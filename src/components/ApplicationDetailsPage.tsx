import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calendar, ChevronDown, FileText, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Textarea } from './ui/textarea';
import {
  evaluateApplicationFit,
  generateApplicationEmailDraft,
  generateApplicationFinalConclusion,
  generateApplicationMarketReport,
  getForm,
  getApplicationMarketReport,
  getFormSubmissions,
  getSubmissionIntelligenceReport,
  getUserPrimaryForm,
  scheduleApplicationCall,
  sendApplicationEmail,
  type DealIntelligenceReport,
  type FinalConclusion,
  type MarketReport,
  type FitCriterionResult,
} from '../utils/api';
import { getStoredFormId, setStoredFormId } from '../utils/formStorage';
import type { FormQuestion } from './FormBuilder';
import { toast } from 'sonner';

interface ApplicationDetailsPageProps {
  userId: string | null;
  submissionId: string;
  accessToken?: string | null;
  onBackToResults: () => void;
}

interface Submission {
  submissionId: string;
  formId: string;
  data: Record<string, string | string[]>;
  submittedAt: string;
}

const renderValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '-';
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return '-';
};

const FIT_ASSESSMENT: FitCriterionResult[] = [
  { criteria: 'Sectors & Industries', status: 'Fit', detail: 'Strong alignment with marketplace, consumer internet, and travel-tech exposure.' },
  { criteria: 'Geography', status: 'Fit', detail: 'Global footprint and diversified market penetration align with broad geographic mandate.' },
  { criteria: 'Revenue Profile', status: 'Fit', detail: 'High free cash flow generation and scalable monetisation exceed baseline thresholds.' },
  { criteria: 'Business Model', status: 'Fit', detail: 'Asset-light two-sided marketplace model matches target economics and defensibility.' },
  { criteria: 'Risk Profile', status: 'Partial Fit', detail: 'Regulatory exposure exists in specific jurisdictions, but mitigated by diversification.' },
];

const FIT_SUMMARY = `This company received an 8.5/10 because it strongly matches the core investment criteria: sector focus, geographic strategy, and scalable economics. The marketplace model demonstrates high operating leverage and durable network effects, while strong cash generation supports resilience and optionality. The score is slightly discounted due to regulatory complexity and cyclical travel sensitivity, but overall fit to VC thesis remains high.`;

const renderReportParagraphs = (paragraphs: string[]) =>
  paragraphs.map((paragraph, index) => (
    <p key={`${index}-${paragraph.slice(0, 24)}`} className="text-[15px] leading-7 text-foreground/90">
      {paragraph}
    </p>
  ));

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractAnswer = (data: Record<string, string | string[]>, keywords: string[]) => {
  const normalized = Object.entries(data).map(([label, value]) => ({
    label: label.toLowerCase(),
    value: Array.isArray(value) ? value.join(', ') : value,
  }));

  for (const entry of normalized) {
    if (keywords.some((keyword) => entry.label.includes(keyword)) && entry.value.trim()) {
      return entry.value;
    }
  }

  return '';
};

export function ApplicationDetailsPage({
  userId,
  submissionId,
  accessToken,
  onBackToResults,
}: ApplicationDetailsPageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [formName, setFormName] = useState('Application');
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [fitAssessment, setFitAssessment] = useState<FitCriterionResult[]>(FIT_ASSESSMENT);
  const [fitSummary, setFitSummary] = useState(FIT_SUMMARY);
  const [isFitLoading, setIsFitLoading] = useState(false);
  const [marketReport, setMarketReport] = useState<MarketReport | null>(null);
  const [isMarketReportLoading, setIsMarketReportLoading] = useState(false);
  const [isGeneratingMarketReport, setIsGeneratingMarketReport] = useState(false);
  const [marketReportError, setMarketReportError] = useState('');
  const [finalConclusion, setFinalConclusion] = useState<FinalConclusion | null>(null);
  const [isFinalConclusionLoading, setIsFinalConclusionLoading] = useState(false);
  const [finalConclusionError, setFinalConclusionError] = useState('');
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isCallDialogOpen, setIsCallDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailThreadId, setEmailThreadId] = useState('');
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [callDate, setCallDate] = useState('');
  const [callTime, setCallTime] = useState('');
  const [callTimeZone, setCallTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [callDuration, setCallDuration] = useState('30');
  const [callNotes, setCallNotes] = useState('');
  const [isSchedulingCall, setIsSchedulingCall] = useState(false);
  const [intelligenceReport, setIntelligenceReport] = useState<DealIntelligenceReport | null>(null);
  const [isIntelligenceLoading, setIsIntelligenceLoading] = useState(false);
  const [openSections, setOpenSections] = useState({
    submissionDetails: false,
    thesisFit: false,
    investmentMemorandum: false,
    finalConclusions: false,
    dealIntelligence: false,
  });

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!userId) {
        if (!active) return;
        setError('You must be logged in to view this application.');
        setIsLoading(false);
        return;
      }

      let formId = getStoredFormId(userId);
      if (!formId) {
        const primaryFormResult = await getUserPrimaryForm(accessToken);
        if (!active) return;

        if (primaryFormResult.success && primaryFormResult.form?.formId) {
          formId = primaryFormResult.form.formId;
          setStoredFormId(userId, formId);
        } else if (primaryFormResult.success) {
          setError('No published form found for this account.');
          setIsLoading(false);
          return;
        } else {
          setError(primaryFormResult.error || 'Failed to load form details.');
          setIsLoading(false);
          return;
        }
      }

      if (!formId) {
        if (!active) return;
        setError('No published form found for this account.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError('');

      const [formResult, submissionsResult] = await Promise.all([
        getForm(formId, accessToken),
        getFormSubmissions(formId),
      ]);

      if (!active) return;

      if (!formResult.success || !formResult.form) {
        setError(formResult.error || 'Failed to load form details.');
        setIsLoading(false);
        return;
      }

      if (!submissionsResult.success) {
        setError(submissionsResult.error || 'Failed to load application.');
        setIsLoading(false);
        return;
      }

      const target = submissionsResult.submissions.find((item) => item.submissionId === submissionId);
      if (!target) {
        setError('Application not found.');
        setIsLoading(false);
        return;
      }

      setActiveFormId(formId);
      setFormName(formResult.form.formName);
      setQuestions(formResult.form.questions);
      setSubmission(target);
      setEmailTo(extractAnswer(target.data, ['email']));
      setIsFitLoading(true);
      setIsMarketReportLoading(true);
      setIsFinalConclusionLoading(true);
      setMarketReportError('');
      setFinalConclusionError('');

      const [fitResult, reportResult, conclusionResult] = await Promise.all([
        evaluateApplicationFit(formId, submissionId, accessToken),
        getApplicationMarketReport(formId, submissionId, accessToken),
        generateApplicationFinalConclusion(formId, submissionId, accessToken),
      ]);
      if (!active) return;

      if (fitResult.success && fitResult.results.length > 0) {
        setFitAssessment(fitResult.results);
        if (fitResult.summary.trim()) {
          setFitSummary(fitResult.summary);
        }
      } else if (!fitResult.success) {
        console.warn('[FIT EVALUATION]', fitResult.error);
      }

      if (reportResult.success) {
        setMarketReport(reportResult.report);
      } else {
        setMarketReport(null);
        setMarketReportError(reportResult.error || '');
      }

      if (conclusionResult.success && conclusionResult.conclusion) {
        setFinalConclusion(conclusionResult.conclusion);
      } else {
        setFinalConclusion(null);
        setFinalConclusionError(conclusionResult.error || 'Failed to load final conclusion');
      }

      setIsFitLoading(false);
      setIsMarketReportLoading(false);
      setIsFinalConclusionLoading(false);
      setIsLoading(false);

      // Load deal intelligence report in background (non-blocking)
      setIsIntelligenceLoading(true);
      getSubmissionIntelligenceReport(formId, submissionId, accessToken).then((intResult) => {
        if (!active) return;
        if (intResult.success && intResult.report) {
          setIntelligenceReport(intResult.report);
          setOpenSections((prev) => ({ ...prev, dealIntelligence: true }));
        }
        setIsIntelligenceLoading(false);
      });
    };

    load();

    return () => {
      active = false;
    };
  }, [userId, submissionId, accessToken]);

  const orderedAnswers = useMemo(() => {
    if (!submission) {
      return [] as Array<{ label: string; value: string | string[] | undefined }>;
    }

    const fromQuestions = questions.map((question) => ({
      label: question.label,
      value: submission.data[question.label],
    }));

    const knownLabels = new Set(questions.map((question) => question.label));
    const extraEntries = Object.entries(submission.data)
      .filter(([label]) => !knownLabels.has(label))
      .map(([label, value]) => ({ label, value }));

    return [...fromQuestions, ...extraEntries];
  }, [questions, submission]);

  const startupEmail = useMemo(() => {
    if (!submission) return '';
    return extractAnswer(submission.data, ['email']);
  }, [submission]);

  const startupCompanyName = useMemo(() => {
    if (!submission) return '';
    return extractAnswer(submission.data, ['company name']) || 'Startup';
  }, [submission]);

  const handleGenerateMarketReport = async () => {
    if (!activeFormId) {
      setMarketReportError('Could not determine the form for this application.');
      return;
    }

    setMarketReportError('');
    setIsGeneratingMarketReport(true);

    const result = await generateApplicationMarketReport(activeFormId, submissionId, accessToken);

    if (!result.success || !result.report) {
      setMarketReportError(result.error || 'Failed to generate market report');
      setIsGeneratingMarketReport(false);
      return;
    }

    setMarketReport(result.report);
    setOpenSections((prev) => ({ ...prev, investmentMemorandum: true }));

    setIsFinalConclusionLoading(true);
    let latestError = '';
    let updated = false;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const conclusionResult = await generateApplicationFinalConclusion(activeFormId, submissionId, accessToken);
      if (conclusionResult.success && conclusionResult.conclusion) {
        setFinalConclusion(conclusionResult.conclusion);
        setFinalConclusionError('');
        setOpenSections((prev) => ({ ...prev, finalConclusions: true }));

        if (conclusionResult.mode === 'with_report') {
          updated = true;
          break;
        }
      } else {
        latestError = conclusionResult.error || 'Failed to update final conclusion';
      }

      await delay(500);
    }

    if (!updated && latestError) {
      setFinalConclusionError(latestError);
    }

    setIsFinalConclusionLoading(false);
    setIsGeneratingMarketReport(false);
  };

  const handleGenerateEmailWithAI = async () => {
    if (!activeFormId) {
      toast.error('Could not determine form context for this application.');
      return;
    }

    setIsGeneratingEmail(true);
    const result = await generateApplicationEmailDraft(activeFormId, submissionId, accessToken);
    setIsGeneratingEmail(false);

    if (!result.success || !result.draft) {
      toast.error(result.error || 'Failed to generate email draft');
      return;
    }

    setEmailTo(result.draft.toEmail || startupEmail);
    setEmailSubject(result.draft.subject);
    setEmailBody(result.draft.body);
    toast.success('AI email draft generated. Review and send when ready.');
  };

  const handleSendEmail = async () => {
    if (!activeFormId) {
      toast.error('Could not determine form context for this application.');
      return;
    }
    if (!emailTo.trim()) {
      toast.error('Startup email is missing.');
      return;
    }
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error('Please provide subject and body before sending.');
      return;
    }

    setIsSendingEmail(true);
    const result = await sendApplicationEmail({
      formId: activeFormId,
      submissionId,
      subject: emailSubject,
      body: emailBody,
      threadId: emailThreadId || undefined,
      accessToken,
    });
    setIsSendingEmail(false);

    if (!result.success) {
      toast.error(result.error || 'Failed to send email');
      return;
    }

    if (result.threadId) {
      setEmailThreadId(result.threadId);
    }
    setIsEmailDialogOpen(false);
    toast.success(`Email sent to ${emailTo}.`);
  };

  const handleScheduleCall = async () => {
    if (!activeFormId) {
      toast.error('Could not determine form context for this application.');
      return;
    }
    if (!callDate || !callTime || !callTimeZone) {
      toast.error('Please set date, time and timezone.');
      return;
    }

    setIsSchedulingCall(true);
    const result = await scheduleApplicationCall({
      formId: activeFormId,
      submissionId,
      date: callDate,
      time: callTime,
      timezone: callTimeZone,
      durationMinutes: Number(callDuration),
      notes: callNotes,
      accessToken,
    });
    setIsSchedulingCall(false);

    if (!result.success || !result.call) {
      toast.error(result.error || 'Failed to schedule call');
      return;
    }

    setIsCallDialogOpen(false);
    toast.success('Call scheduled and invites sent.');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-muted/30 border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl">View Application</h1>
            <p className="text-sm text-muted-foreground">{formName}</p>
          </div>
          <Button variant="outline" onClick={onBackToResults}>
            <ArrowLeft className="size-4 mr-2" />
            Back to Results
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {isLoading && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading application...</p>
          </Card>
        )}

        {!isLoading && error && (
          <Card className="p-8 text-center">
            <h2 className="mb-2">Could Not Load Application</h2>
            <p className="text-muted-foreground">{error}</p>
          </Card>
        )}

        {!isLoading && !error && submission && (
          <div className="space-y-6">
            <Collapsible
              open={openSections.submissionDetails}
              onOpenChange={(open) =>
                setOpenSections((prev) => ({ ...prev, submissionDetails: open }))
              }
            >
              <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button type="button" className="w-full p-6 flex items-center justify-between text-left">
                    <h2 className="text-xl">Submission Details</h2>
                    <ChevronDown
                      className={`size-5 transition-transform ${
                        openSections.submissionDetails ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-6 pb-6 border-t border-border">
                    <div className="pt-4 pb-6">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="size-4" />
                        {new Date(submission.submittedAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="space-y-4">
                      {orderedAnswers.map((item) => (
                        <div key={item.label} className="rounded-lg border border-border p-4">
                          <p className="text-sm text-muted-foreground mb-1">{item.label}</p>
                          <p className="whitespace-pre-wrap break-words">{renderValue(item.value)}</p>
                        </div>
                      ))}
                    </div>

                    {orderedAnswers.length === 0 && (
                      <div className="text-center py-12">
                        <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                          <FileText className="size-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground">No responses available for this application.</p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible
              open={openSections.thesisFit}
              onOpenChange={(open) =>
                setOpenSections((prev) => ({ ...prev, thesisFit: open }))
              }
            >
              <Card className="border-primary/20 overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button type="button" className="w-full p-6 flex items-center justify-between text-left">
                    <h2 className="text-xl">Level of fitting into VC thesis and criteria</h2>
                    <ChevronDown
                      className={`size-5 transition-transform ${
                        openSections.thesisFit ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-primary/20">
                    <div className="p-6 border-b border-primary/20 bg-primary/5 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-primary font-medium mb-2">
                          Thesis Match Analysis
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Requirement-level fit based on the saved VC thesis criteria.
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Overall Fit</p>
                        <p className="text-3xl font-semibold text-primary">8.5/10</p>
                      </div>
                    </div>

                    <div className="p-6 space-y-4">
                      {isFitLoading && (
                        <div className="rounded-lg border border-border p-4">
                          <p className="text-sm text-muted-foreground">Analyzing fit against VC criteria...</p>
                        </div>
                      )}

                      {!isFitLoading && fitAssessment.map((item) => (
                        <div key={item.criteria} className="rounded-lg border border-border p-4">
                          <div className="flex items-center justify-between mb-2 gap-3">
                            <p className="font-medium">{item.criteria}</p>
                            <Badge
                              className={
                                item.status === 'Fit'
                                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                  : item.status === 'Not a Fit'
                                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                  : 'bg-muted text-foreground hover:bg-muted'
                              }
                            >
                              {item.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{item.detail}</p>
                        </div>
                      ))}

                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                        <p className="text-sm font-medium mb-2">Summary of Score</p>
                        <p className="text-sm text-muted-foreground leading-6">{fitSummary}</p>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {!marketReport && (
              <Card className="border-primary/20 p-8">
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <Button
                    type="button"
                    size="lg"
                    disabled={isGeneratingMarketReport || isMarketReportLoading}
                    onClick={handleGenerateMarketReport}
                  >
                    {isGeneratingMarketReport || isMarketReportLoading
                      ? 'Generating Market Report...'
                      : 'Generate Market Report'}
                  </Button>
                  {marketReportError && (
                    <p className="text-sm text-destructive">{marketReportError}</p>
                  )}
                </div>
              </Card>
            )}

            {marketReport && (
              <Collapsible
                open={openSections.investmentMemorandum}
                onOpenChange={(open) =>
                  setOpenSections((prev) => ({ ...prev, investmentMemorandum: open }))
                }
              >
                <Card className="border-primary/20 overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="w-full p-6 flex items-center justify-between text-left">
                      <h2 className="text-xl">Investment Memorandum</h2>
                      <ChevronDown
                        className={`size-5 transition-transform ${
                          openSections.investmentMemorandum ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-primary/20">
                      <div className="p-6 border-b border-primary/20 bg-primary/5">
                        <p className="text-xs uppercase tracking-wide text-primary font-medium mb-2">
                          Investment Memorandum
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Generated from the startup submission and market context.
                        </p>
                      </div>

                      <div className="p-6 space-y-8">
                        <section className="space-y-3">
                          <h2 className="text-3xl font-bold tracking-tight">{marketReport.title}</h2>
                          <p className="text-sm text-muted-foreground">
                            Company: {marketReport.companyName} | Industry: {marketReport.industry}
                          </p>
                        </section>

                        {marketReport.sections.map((section) => (
                          <section key={section.title} className="space-y-4">
                            <h3 className="text-2xl font-bold tracking-tight">{section.title}</h3>
                            {section.subtitle && (
                              <h4 className="text-lg font-semibold text-primary">{section.subtitle}</h4>
                            )}
                            {renderReportParagraphs(section.paragraphs)}
                            {section.bullets.length > 0 && (
                              <ul className="list-disc pl-6 space-y-2 text-[15px] leading-7">
                                {section.bullets.map((bullet) => (
                                  <li key={`${section.title}-${bullet}`}>{bullet}</li>
                                ))}
                              </ul>
                            )}
                          </section>
                        ))}

                        <section className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-5">
                          <h3 className="text-2xl font-bold tracking-tight">{marketReport.conclusion.title}</h3>
                          {renderReportParagraphs(marketReport.conclusion.paragraphs)}
                          <p className="text-[15px] font-semibold leading-7">{marketReport.conclusion.finalStatement}</p>
                        </section>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            <Collapsible
              open={openSections.finalConclusions}
              onOpenChange={(open) =>
                setOpenSections((prev) => ({ ...prev, finalConclusions: open }))
              }
            >
              <Card className="border-primary/20 overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button type="button" className="w-full p-6 flex items-center justify-between text-left">
                    <h2 className="text-xl">Final Conclusions</h2>
                    <ChevronDown
                      className={`size-5 transition-transform ${
                        openSections.finalConclusions ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-primary/20 p-6 space-y-4">
                    {isFinalConclusionLoading && (
                      <div className="rounded-lg border border-border p-4">
                        <p className="text-sm text-muted-foreground">Generating final conclusion...</p>
                      </div>
                    )}

                    {!isFinalConclusionLoading && finalConclusion && (
                      <>
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{finalConclusion.title}</p>
                            <p className="text-xs text-muted-foreground">Confidence: {finalConclusion.confidence}</p>
                          </div>
                          <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">
                            {finalConclusion.mode === 'with_report' ? 'Enhanced Conclusion' : 'Preliminary Conclusion'}
                          </Badge>
                        </div>

                        <div className="rounded-lg border border-border p-4">
                          <p className="text-sm font-medium mb-2">Verdict</p>
                          <p className="text-[15px] leading-7">{finalConclusion.verdict}</p>
                        </div>

                        <div className="space-y-3">
                          {renderReportParagraphs(finalConclusion.paragraphs)}
                        </div>

                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                          <p className="text-sm font-medium mb-2">Recommendation</p>
                          <p className="text-[15px] leading-7">{finalConclusion.recommendation}</p>
                        </div>
                      </>
                    )}

                    {!isFinalConclusionLoading && !finalConclusion && (
                      <div className="rounded-lg border border-border p-4">
                        <p className="text-sm text-muted-foreground">
                          {finalConclusionError || 'No conclusion is available yet for this application.'}
                        </p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {(intelligenceReport || isIntelligenceLoading) && (
              <Collapsible
                open={openSections.dealIntelligence}
                onOpenChange={(open) =>
                  setOpenSections((prev) => ({ ...prev, dealIntelligence: open }))
                }
              >
                <Card className="border-primary/20 overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="w-full p-6 flex items-center justify-between text-left">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-5 text-primary" />
                        <h2 className="text-xl">Deal Intelligence Report</h2>
                      </div>
                      <ChevronDown
                        className={`size-5 transition-transform ${
                          openSections.dealIntelligence ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-primary/20 p-6 space-y-6">
                      {isIntelligenceLoading && (
                        <div className="rounded-lg border border-border p-4">
                          <p className="text-sm text-muted-foreground">Loading deal intelligence report...</p>
                        </div>
                      )}

                      {!isIntelligenceLoading && intelligenceReport && (
                        <>
                          {/* Header */}
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{intelligenceReport.header.companyName}</p>
                              <p className="text-xs text-muted-foreground">
                                {[intelligenceReport.header.stage, intelligenceReport.header.sector].filter(Boolean).join(' · ')}
                                {intelligenceReport.header.fundraisingTarget && ` · ${intelligenceReport.header.fundraisingTarget}`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-3xl font-bold">{intelligenceReport.header.thesisAlignmentScore}</p>
                              <p className="text-xs text-muted-foreground">Thesis Alignment</p>
                            </div>
                          </div>

                          {/* Executive Summary */}
                          <div className="space-y-2">
                            <h3 className="text-base font-semibold">Executive Summary</h3>
                            <div className="rounded-lg border border-border p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm leading-relaxed">{intelligenceReport.executiveSummary.summary}</p>
                                <Badge className={`shrink-0 ${
                                  intelligenceReport.executiveSummary.investmentSignal === 'Strong Invest' ? 'bg-green-100 text-green-800' :
                                  intelligenceReport.executiveSummary.investmentSignal === 'Lean Invest' ? 'bg-emerald-100 text-emerald-800' :
                                  intelligenceReport.executiveSummary.investmentSignal === 'Neutral' ? 'bg-gray-100 text-gray-800' :
                                  intelligenceReport.executiveSummary.investmentSignal === 'Lean Pass' ? 'bg-orange-100 text-orange-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {intelligenceReport.executiveSummary.investmentSignal}
                                </Badge>
                              </div>
                              <Separator />
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Signal Rationale</p>
                                <p className="text-sm">{intelligenceReport.executiveSummary.signalRationale}</p>
                              </div>
                            </div>
                          </div>

                          {/* Founder Analysis */}
                          {intelligenceReport.founderAnalysis.dimensions.length > 0 && (
                            <div className="space-y-2">
                              <h3 className="text-base font-semibold">Founder Analysis</h3>
                              <div className="rounded-lg border border-border p-4 space-y-4">
                                {intelligenceReport.founderAnalysis.dimensions.map((dim) => (
                                  <div key={dim.name} className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">{dim.name}</span>
                                      <span className="text-sm font-semibold">{dim.score}</span>
                                    </div>
                                    <Progress value={dim.score} />
                                    <p className="text-xs text-muted-foreground">{dim.assessment}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Risk Dashboard */}
                          {intelligenceReport.riskDashboard.flags.length > 0 && (
                            <div className="space-y-2">
                              <h3 className="text-base font-semibold">Risk Dashboard</h3>
                              <div className="space-y-2">
                                {intelligenceReport.riskDashboard.flags.map((flag, i) => (
                                  <div
                                    key={i}
                                    className={`rounded-lg border p-3 border-l-4 ${
                                      flag.severity === 'red' ? 'border-l-red-500' :
                                      flag.severity === 'yellow' ? 'border-l-yellow-500' :
                                      'border-l-green-500'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-medium">{flag.category}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
                                      </div>
                                      <Badge variant="outline" className={`shrink-0 text-xs capitalize ${
                                        flag.severity === 'red' ? 'border-red-300 text-red-700' :
                                        flag.severity === 'yellow' ? 'border-yellow-300 text-yellow-700' :
                                        'border-green-300 text-green-700'
                                      }`}>
                                        {flag.severity}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Competitive Intelligence */}
                          {intelligenceReport.competitiveIntelligence.competitors.length > 0 && (
                            <div className="space-y-2">
                              <h3 className="text-base font-semibold">Competitive Intelligence</h3>
                              <div className="rounded-lg border border-border p-4 space-y-3">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Competitor</TableHead>
                                      <TableHead>Description</TableHead>
                                      <TableHead className="w-24">Threat</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {intelligenceReport.competitiveIntelligence.competitors.map((comp) => (
                                      <TableRow key={comp.name}>
                                        <TableCell className="font-medium">{comp.name}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{comp.description}</TableCell>
                                        <TableCell>
                                          <Badge className={`text-xs ${
                                            comp.threatLevel === 'High' ? 'bg-red-100 text-red-800' :
                                            comp.threatLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-green-100 text-green-800'
                                          }`}>
                                            {comp.threatLevel}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                <Separator />
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Differentiation</p>
                                  <p className="text-sm">{intelligenceReport.competitiveIntelligence.differentiation}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Market Positioning</p>
                                  <p className="text-sm">{intelligenceReport.competitiveIntelligence.positioning}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Deal Strength Score */}
                          <div className="space-y-2">
                            <h3 className="text-base font-semibold">Deal Strength</h3>
                            <div className="rounded-lg border border-border p-4 space-y-4">
                              <div className="text-center">
                                <span className="text-4xl font-bold">{intelligenceReport.dealStrengthScore.overall}</span>
                                <span className="text-lg text-muted-foreground ml-1">/100</span>
                              </div>
                              <Progress value={intelligenceReport.dealStrengthScore.overall} className="h-3" />
                              <div className="space-y-2 pt-1">
                                {intelligenceReport.dealStrengthScore.breakdown.map((b) => (
                                  <div key={b.dimension} className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                      <span>{b.dimension}</span>
                                      <span className="font-medium">
                                        {b.score} <span className="text-xs text-muted-foreground">(w: {Math.round(b.weight * 100)}%)</span>
                                      </span>
                                    </div>
                                    <Progress value={b.score} className="h-1.5" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Question Coverage */}
                          <div className="space-y-2">
                            <h3 className="text-base font-semibold">Question Coverage</h3>
                            <div className="rounded-lg border border-border p-4 space-y-4">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl font-bold">{intelligenceReport.questionCoverage.overallCoveragePercent}%</span>
                                <span className="text-sm text-muted-foreground">Overall Coverage</span>
                              </div>
                              <Progress value={intelligenceReport.questionCoverage.overallCoveragePercent} />
                              {intelligenceReport.questionCoverage.areas.map((area) => (
                                <div key={area.area} className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{area.area}</span>
                                    <span className="text-sm">{area.coveragePercent}%</span>
                                  </div>
                                  <Progress value={area.coveragePercent} className="h-1.5" />
                                  {area.gaps.length > 0 && (
                                    <div className="mt-1">
                                      <p className="text-xs text-red-600 font-medium">Gaps:</p>
                                      <ul className="text-xs text-muted-foreground list-disc list-inside">
                                        {area.gaps.map((gap, i) => <li key={i}>{gap}</li>)}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              ))}
                              {intelligenceReport.questionCoverage.suggestedFollowUps.length > 0 && (
                                <>
                                  <Separator />
                                  <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Suggested Follow-Up Questions</p>
                                    <ul className="text-sm space-y-1 list-disc list-inside">
                                      {intelligenceReport.questionCoverage.suggestedFollowUps.map((q, i) => <li key={i}>{q}</li>)}
                                    </ul>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* IC Memo */}
                          <div className="space-y-2">
                            <h3 className="text-base font-semibold">{intelligenceReport.icMemo.title}</h3>
                            <div className="rounded-lg border border-border p-4 space-y-4">
                              {intelligenceReport.icMemo.sections.map((section, i) => (
                                <div key={i}>
                                  {i > 0 && <Separator className="mb-4" />}
                                  <h4 className="text-sm font-semibold mb-1">{section.heading}</h4>
                                  <p className="text-sm leading-relaxed whitespace-pre-line">{section.content}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Transcript Annotations */}
                          {intelligenceReport.transcriptAnnotations.length > 0 && (
                            <div className="space-y-2">
                              <h3 className="text-base font-semibold">Transcript Annotations</h3>
                              <div className="rounded-lg border border-border p-4 space-y-3">
                                {intelligenceReport.transcriptAnnotations.map((ann, i) => (
                                  <div key={i} className="flex items-start gap-3">
                                    <Badge className={`shrink-0 text-xs mt-0.5 ${
                                      ann.type === 'risk' ? 'bg-red-100 text-red-700' :
                                      ann.type === 'signal' ? 'bg-green-100 text-green-700' :
                                      ann.type === 'metric' ? 'bg-blue-100 text-blue-700' :
                                      'bg-purple-100 text-purple-700'
                                    }`}>
                                      {ann.type}
                                    </Badge>
                                    <div>
                                      <p className="text-xs font-medium">{ann.label}</p>
                                      <blockquote className="text-xs text-muted-foreground italic mt-0.5">"{ann.quote}"</blockquote>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            <Card className="p-6">
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                <Button type="button" onClick={() => setIsEmailDialogOpen(true)}>
                  Write an email
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsCallDialogOpen(true)}>
                  Book a call
                </Button>
              </div>
            </Card>

            <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Write an Email</DialogTitle>
                  <DialogDescription>
                    Send an email to {startupCompanyName} ({emailTo || startupEmail || 'no email found'}).
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <Input value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder="To" />
                  <Input
                    value={emailSubject}
                    onChange={(event) => setEmailSubject(event.target.value)}
                    placeholder="Subject"
                  />
                  <Textarea
                    value={emailBody}
                    onChange={(event) => setEmailBody(event.target.value)}
                    placeholder="Write your email"
                    rows={10}
                  />
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isGeneratingEmail}
                    onClick={handleGenerateEmailWithAI}
                  >
                    {isGeneratingEmail ? 'Generating...' : 'Generate with AI'}
                  </Button>
                  <Button type="button" disabled={isSendingEmail} onClick={handleSendEmail}>
                    {isSendingEmail ? 'Sending...' : 'Send'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isCallDialogOpen} onOpenChange={setIsCallDialogOpen}>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Book a Call</DialogTitle>
                  <DialogDescription>
                    Schedule a Google Meet call with {startupCompanyName} ({startupEmail || 'no email found'}).
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Date</p>
                    <Input type="date" value={callDate} onChange={(event) => setCallDate(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Time</p>
                    <Input type="time" value={callTime} onChange={(event) => setCallTime(event.target.value)} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <p className="text-sm text-muted-foreground">Time Zone</p>
                    <Input
                      value={callTimeZone}
                      onChange={(event) => setCallTimeZone(event.target.value)}
                      placeholder="e.g. Europe/London"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <p className="text-sm text-muted-foreground">Duration (minutes)</p>
                    <Input
                      type="number"
                      min={15}
                      max={180}
                      value={callDuration}
                      onChange={(event) => setCallDuration(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <p className="text-sm text-muted-foreground">Notes (optional)</p>
                    <Textarea
                      value={callNotes}
                      onChange={(event) => setCallNotes(event.target.value)}
                      rows={4}
                      placeholder="Add context for the call invite"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" disabled={isSchedulingCall} onClick={handleScheduleCall}>
                    {isSchedulingCall ? 'Scheduling...' : 'Create Google Meet & Send Invite'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
}
