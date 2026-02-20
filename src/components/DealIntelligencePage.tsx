import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { toast } from 'sonner';
import {
  getDealIntelligenceReport,
  generateDealIntelligenceReport,
  type DealIntelligenceReport,
} from '../utils/api';

interface DealIntelligencePageProps {
  callId: string;
  accessToken?: string | null;
  onBack: () => void;
}

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'founder', label: 'Founder' },
  { id: 'risks', label: 'Risks' },
  { id: 'compete', label: 'Compete' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'deal', label: 'Deal Score' },
  { id: 'memo', label: 'IC Memo' },
  { id: 'transcript', label: 'Transcript' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const SIGNAL_COLORS: Record<string, string> = {
  'Strong Pass': 'bg-red-100 text-red-800',
  'Lean Pass': 'bg-orange-100 text-orange-800',
  'Neutral': 'bg-gray-100 text-gray-800',
  'Lean Invest': 'bg-emerald-100 text-emerald-800',
  'Strong Invest': 'bg-green-100 text-green-800',
};

const SEVERITY_BORDER: Record<string, string> = {
  red: 'border-l-red-500',
  yellow: 'border-l-yellow-500',
  green: 'border-l-green-500',
};

const ANNOTATION_COLORS: Record<string, string> = {
  risk: 'bg-red-100 text-red-700',
  signal: 'bg-green-100 text-green-700',
  metric: 'bg-blue-100 text-blue-700',
  competitor: 'bg-purple-100 text-purple-700',
};

const THREAT_COLORS: Record<string, string> = {
  Low: 'bg-green-100 text-green-800',
  Medium: 'bg-yellow-100 text-yellow-800',
  High: 'bg-red-100 text-red-800',
};

export function DealIntelligencePage({ callId, accessToken, onBack }: DealIntelligencePageProps) {
  const [report, setReport] = useState<DealIntelligenceReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      const result = await getDealIntelligenceReport(callId, accessToken);
      if (!active) return;
      setIsLoading(false);
      if (!result.success) {
        setError(result.error ?? 'Failed to load report');
        return;
      }
      setReport(result.report ?? null);
    };
    load();
    return () => { active = false; };
  }, [callId, accessToken]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    const result = await generateDealIntelligenceReport(callId, accessToken);
    setIsGenerating(false);
    if (!result.success) {
      setError(result.error ?? 'Generation failed');
      toast.error(result.error ?? 'Failed to generate report');
      return;
    }
    setReport(result.report ?? null);
    toast.success('Deal Intelligence Report generated');
  }, [callId, accessToken]);

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCopyMemo = useCallback(() => {
    if (!report) return;
    const text = report.icMemo.sections
      .map((s) => `## ${s.heading}\n\n${s.content}`)
      .join('\n\n');
    const full = `# ${report.icMemo.title}\n\n${text}`;
    navigator.clipboard.writeText(full);
    toast.success('IC Memo copied to clipboard');
  }, [report]);

  const handleDownloadMemo = useCallback(() => {
    if (!report) return;
    const text = report.icMemo.sections
      .map((s) => `## ${s.heading}\n\n${s.content}`)
      .join('\n\n');
    const full = `# ${report.icMemo.title}\n\n${text}`;
    const blob = new Blob([full], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.header.companyName.replace(/[^a-zA-Z0-9]/g, '_')}_IC_Memo.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="size-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading report...</p>
        </div>
      </div>
    );
  }

  // Empty state — no report yet
  if (!report && !isGenerating) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-muted/30 border-b border-border">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <h1 className="text-2xl">Deal Intelligence</h1>
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="size-4 mr-2" />
              Back to Calls
            </Button>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-16 text-center space-y-6">
          <Sparkles className="size-12 mx-auto text-muted-foreground/50" />
          <div>
            <h2 className="text-xl mb-2">No Intelligence Report Yet</h2>
            <p className="text-sm text-muted-foreground">
              Generate an AI-powered deal analysis from the call transcript, startup data, and your VC thesis.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button size="lg" onClick={handleGenerate}>
            <Sparkles className="size-4 mr-2" />
            Generate Report
          </Button>
        </div>
      </div>
    );
  }

  // Generating state
  if (isGenerating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="size-10 animate-spin mx-auto text-primary" />
          <div>
            <p className="text-lg font-medium">Analyzing call...</p>
            <p className="text-sm text-muted-foreground mt-1">
              This typically takes 15-30 seconds
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const { header } = report;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header Bar */}
      <div className="bg-muted/30 border-b border-border shrink-0">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
              <ArrowLeft className="size-4 mr-1" />
              Back
            </Button>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <div className="min-w-0">
              <span className="font-semibold truncate">{header.companyName}</span>
              {header.stage && (
                <span className="text-muted-foreground text-sm ml-2 hidden sm:inline">{header.stage}</span>
              )}
              {header.sector && (
                <span className="text-muted-foreground text-sm ml-2 hidden sm:inline">{header.sector}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-3xl font-bold">{header.thesisAlignmentScore}</span>
            <span className="text-xs text-muted-foreground leading-tight">
              Thesis<br />Alignment
            </span>
          </div>
        </div>
      </div>

      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 max-w-[1400px] mx-auto w-full">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 border-r border-border py-4 hidden md:block">
          <div className="space-y-1 px-3">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  activeSection === s.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <ScrollArea className="flex-1 h-[calc(100vh-57px)]">
          <div className="p-6 space-y-8 max-w-4xl">
            {/* 1. Overview / Executive Summary */}
            <section ref={(el) => { sectionRefs.current.overview = el; }}>
              <h2 className="text-2xl font-semibold mb-4">Executive Summary</h2>
              <Card className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm leading-relaxed">{report.executiveSummary.summary}</p>
                  <Badge
                    className={`shrink-0 ${SIGNAL_COLORS[report.executiveSummary.investmentSignal] ?? ''}`}
                  >
                    {report.executiveSummary.investmentSignal}
                  </Badge>
                </div>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Signal Rationale</p>
                  <p className="text-sm">{report.executiveSummary.signalRationale}</p>
                </div>
                {header.fundraisingTarget && (
                  <p className="text-sm text-muted-foreground">
                    Fundraising: <span className="text-foreground font-medium">{header.fundraisingTarget}</span>
                  </p>
                )}
              </Card>
            </section>

            {/* 2. Founder Analysis */}
            <section ref={(el) => { sectionRefs.current.founder = el; }}>
              <h2 className="text-2xl font-semibold mb-4">Founder Analysis</h2>
              <Card className="p-5 space-y-4">
                {report.founderAnalysis.dimensions.map((dim) => (
                  <Collapsible key={dim.name}>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{dim.name}</span>
                        <span className="text-sm font-semibold">{dim.score}</span>
                      </div>
                      <Progress value={dim.score} />
                      <p className="text-xs text-muted-foreground">{dim.assessment}</p>
                      <CollapsibleTrigger asChild>
                        <button className="text-xs text-primary flex items-center gap-1 hover:underline">
                          <ChevronRight className="size-3" />
                          Evidence
                        </button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <blockquote className="mt-2 border-l-2 border-muted pl-3 text-xs text-muted-foreground italic">
                        "{dim.evidence}"
                      </blockquote>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </Card>
            </section>

            {/* 3. Risk Dashboard */}
            <section ref={(el) => { sectionRefs.current.risks = el; }}>
              <h2 className="text-2xl font-semibold mb-4">Risk Dashboard</h2>
              <div className="space-y-3">
                {report.riskDashboard.flags.map((flag, i) => (
                  <Card
                    key={i}
                    className={`p-4 border-l-4 ${SEVERITY_BORDER[flag.severity] ?? ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{flag.category}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{flag.description}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs capitalize ${
                          flag.severity === 'red'
                            ? 'border-red-300 text-red-700'
                            : flag.severity === 'yellow'
                              ? 'border-yellow-300 text-yellow-700'
                              : 'border-green-300 text-green-700'
                        }`}
                      >
                        {flag.severity}
                      </Badge>
                    </div>
                    {flag.evidence && (
                      <blockquote className="mt-2 border-l-2 border-muted pl-3 text-xs text-muted-foreground italic">
                        "{flag.evidence}"
                      </blockquote>
                    )}
                  </Card>
                ))}
                {report.riskDashboard.flags.length === 0 && (
                  <p className="text-sm text-muted-foreground">No risk flags identified.</p>
                )}
              </div>
            </section>

            {/* 4. Competitive Intelligence */}
            <section ref={(el) => { sectionRefs.current.compete = el; }}>
              <h2 className="text-2xl font-semibold mb-4">Competitive Intelligence</h2>
              <Card className="p-5 space-y-4">
                {report.competitiveIntelligence.competitors.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Competitor</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-24">Threat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.competitiveIntelligence.competitors.map((comp) => (
                        <TableRow key={comp.name}>
                          <TableCell className="font-medium">{comp.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {comp.description}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${THREAT_COLORS[comp.threatLevel] ?? ''}`}>
                              {comp.threatLevel}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Differentiation
                  </p>
                  <p className="text-sm">{report.competitiveIntelligence.differentiation}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Market Positioning
                  </p>
                  <p className="text-sm">{report.competitiveIntelligence.positioning}</p>
                </div>
              </Card>
            </section>

            {/* 5. Question Coverage */}
            <section ref={(el) => { sectionRefs.current.coverage = el; }}>
              <h2 className="text-2xl font-semibold mb-4">Question Coverage</h2>
              <Card className="p-5 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold">
                    {report.questionCoverage.overallCoveragePercent}%
                  </span>
                  <span className="text-sm text-muted-foreground">Overall Coverage</span>
                </div>
                <Progress value={report.questionCoverage.overallCoveragePercent} />

                {report.questionCoverage.areas.map((area) => (
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
                          {area.gaps.map((gap, i) => (
                            <li key={i}>{gap}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}

                {report.questionCoverage.suggestedFollowUps.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                        Suggested Follow-Up Questions
                      </p>
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        {report.questionCoverage.suggestedFollowUps.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </Card>
            </section>

            {/* 6. Deal Strength Score */}
            <section ref={(el) => { sectionRefs.current.deal = el; }}>
              <h2 className="text-2xl font-semibold mb-4">Deal Strength</h2>
              <Card className="p-5 space-y-5">
                <div className="text-center">
                  <span className="text-5xl font-bold">{report.dealStrengthScore.overall}</span>
                  <span className="text-lg text-muted-foreground ml-1">/100</span>
                </div>
                <Progress value={report.dealStrengthScore.overall} className="h-3" />

                <div className="space-y-3 pt-2">
                  {report.dealStrengthScore.breakdown.map((b) => (
                    <div key={b.dimension} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{b.dimension}</span>
                        <span className="font-medium">
                          {b.score}{' '}
                          <span className="text-xs text-muted-foreground">
                            (w: {Math.round(b.weight * 100)}%)
                          </span>
                        </span>
                      </div>
                      <Progress value={b.score} className="h-1.5" />
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            {/* 7. IC Memo */}
            <section ref={(el) => { sectionRefs.current.memo = el; }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">{report.icMemo.title}</h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyMemo}>
                    <Copy className="size-3.5 mr-1.5" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadMemo}>
                    <Download className="size-3.5 mr-1.5" />
                    Download
                  </Button>
                </div>
              </div>
              <Card className="p-5 space-y-5">
                {report.icMemo.sections.map((section, i) => (
                  <div key={i}>
                    {i > 0 && <Separator className="mb-5" />}
                    <h3 className="text-base font-semibold mb-2">{section.heading}</h3>
                    <p className="text-sm leading-relaxed whitespace-pre-line">{section.content}</p>
                  </div>
                ))}
              </Card>
            </section>

            {/* 8. Smart Transcript */}
            <section ref={(el) => { sectionRefs.current.transcript = el; }}>
              <h2 className="text-2xl font-semibold mb-4">Transcript Annotations</h2>
              <Card className="p-5">
                {report.transcriptAnnotations.length > 0 ? (
                  <div className="space-y-3">
                    {report.transcriptAnnotations.map((ann, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Badge className={`shrink-0 text-xs mt-0.5 ${ANNOTATION_COLORS[ann.type] ?? ''}`}>
                          {ann.type}
                        </Badge>
                        <div>
                          <p className="text-xs font-medium">{ann.label}</p>
                          <blockquote className="text-xs text-muted-foreground italic mt-0.5">
                            "{ann.quote}"
                          </blockquote>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No annotations available.</p>
                )}
              </Card>
            </section>

            {/* Bottom spacer */}
            <div className="h-16" />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
