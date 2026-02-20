import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import {
  FileText,
  CalendarClock,
  Mail,
  Briefcase,
  ClipboardList,
  Building2,
  DollarSign,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import {
  getUserPrimaryForm,
  getFormSubmissions,
  getCalls,
  getEmailThreads,
  getPortfolio,
  getMailboxStatus,
  getMailboxConnectUrl,
  disconnectMailbox,
  type EmailThread,
  type ScheduledCall,
  type PortfolioCompany,
  type MailboxStatus,
} from '../utils/api';
import { getStoredFormId, setStoredFormId } from '../utils/formStorage';
import { toast } from 'sonner';

interface DashboardPageProps {
  userId?: string;
  accessToken?: string | null;
  onNavigate: (view: string) => void;
}

interface SubmissionSummary {
  submissionId: string;
  companyName: string;
  submittedAt: string;
}

export function DashboardPage({ userId, accessToken, onNavigate }: DashboardPageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [upcomingCalls, setUpcomingCalls] = useState<ScheduledCall[]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [companies, setCompanies] = useState<PortfolioCompany[]>([]);
  const [formName, setFormName] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);

  const [mailboxStatus, setMailboxStatus] = useState<MailboxStatus | null>(null);
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mailboxParam = params.get('mailbox');
    if (mailboxParam === 'connected') {
      toast.success('Mailbox connected successfully.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (mailboxParam === 'error') {
      const message = params.get('message') || 'Failed to connect mailbox.';
      toast.error(message);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadAll = async () => {
      setIsLoading(true);

      // Load form + submissions
      const uid = userId ?? '';
      const storedFormId = uid ? getStoredFormId(uid) : null;
      let formId = storedFormId;

      if (!formId) {
        const formResult = await getUserPrimaryForm(accessToken);
        if (formResult.success && formResult.form) {
          formId = formResult.form.formId;
          if (uid) setStoredFormId(uid, formId);
          setFormName(formResult.form.formName);
          setFormStatus(formResult.form.status ?? 'active');
        }
      }

      if (formId) {
        const subResult = await getFormSubmissions(formId);
        if (active && subResult.success) {
          const subs = (subResult.submissions ?? []).map((s: { submissionId: string; data: Record<string, string | string[]>; submittedAt: string }) => ({
            submissionId: s.submissionId,
            companyName: findCompanyName(s.data),
            submittedAt: s.submittedAt,
          }));
          subs.sort((a: SubmissionSummary, b: SubmissionSummary) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
          setSubmissions(subs.slice(0, 5));
        }
        if (!formId) {
          setFormName(null);
          setFormStatus(null);
        }
      }

      // Load calls
      const callsResult = await getCalls(accessToken);
      if (active && callsResult.success) {
        const now = new Date();
        const upcoming = (callsResult.calls ?? [])
          .filter((c: ScheduledCall) => new Date(c.scheduledAt) > now)
          .sort((a: ScheduledCall, b: ScheduledCall) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
          .slice(0, 5);
        setUpcomingCalls(upcoming);
      }

      // Load emails
      const emailResult = await getEmailThreads(accessToken);
      if (active && emailResult.success) {
        const sorted = (emailResult.threads ?? [])
          .sort((a: EmailThread, b: EmailThread) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
          .slice(0, 5);
        setThreads(sorted);
      }

      // Load portfolio
      const portfolioResult = await getPortfolio(accessToken);
      if (active && portfolioResult.success) {
        setCompanies(portfolioResult.companies ?? []);
      }

      // Load mailbox status
      setIsLoadingEmail(true);
      const mbResult = await getMailboxStatus(accessToken);
      if (active) {
        setMailboxStatus(mbResult.status ?? null);
        setIsLoadingEmail(false);
      }

      if (active) setIsLoading(false);
    };

    loadAll();
    return () => { active = false; };
  }, [accessToken]);

  const handleConnectMailbox = async (provider: 'google' | 'microsoft') => {
    setIsConnecting(true);
    const result = await getMailboxConnectUrl(provider, accessToken);
    setIsConnecting(false);
    if (!result.success || !result.url) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to create connect URL.');
      return;
    }
    window.location.href = result.url;
  };

  const handleDisconnectMailbox = async () => {
    setIsDisconnecting(true);
    const result = await disconnectMailbox(accessToken);
    setIsDisconnecting(false);
    if (!result.success) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to disconnect mailbox.');
      return;
    }
    setMailboxStatus(null);
    toast.success('Mailbox disconnected.');
  };

  const isConnected = mailboxStatus?.connected ?? false;
  const connectedEmail = mailboxStatus?.email ?? '';
  const providerLabel = mailboxStatus?.provider === 'microsoft' ? 'Outlook' : mailboxStatus?.provider === 'google' ? 'Gmail' : '';

  const totalInvested = companies.reduce((sum, c) => sum + (c.dealSize ?? 0), 0);
  const activeCount = companies.filter((c) => c.status === 'active').length;
  const exitedCount = companies.filter((c) => c.status === 'exited').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your deal flow pipeline</p>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* New Opportunities */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="size-5 text-primary" />
              </div>
              <h2 className="font-medium">New Opportunities</h2>
            </div>
            <span className="text-2xl font-bold">{submissions.length}</span>
          </div>
          {submissions.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {submissions.slice(0, 3).map((s) => (
                <li key={s.submissionId} className="flex items-center justify-between text-muted-foreground">
                  <span className="truncate">{s.companyName}</span>
                  <span className="text-xs shrink-0 ml-2">{formatRelative(s.submittedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No submissions yet</p>
          )}
          <Button variant="link" className="px-0 mt-3" onClick={() => onNavigate('results')}>
            View all results
          </Button>
        </Card>

        {/* Upcoming Calls */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarClock className="size-5 text-primary" />
              </div>
              <h2 className="font-medium">Upcoming Calls</h2>
            </div>
            <span className="text-2xl font-bold">{upcomingCalls.length}</span>
          </div>
          {upcomingCalls.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {upcomingCalls.slice(0, 3).map((c) => (
                <li key={c.id} className="flex items-center justify-between text-muted-foreground">
                  <span className="truncate">{c.companyName}</span>
                  <span className="text-xs shrink-0 ml-2">{formatDate(c.scheduledAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming calls</p>
          )}
          <Button variant="link" className="px-0 mt-3" onClick={() => onNavigate('calls')}>
            View all calls
          </Button>
        </Card>

        {/* Recent Emails */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Mail className="size-5 text-primary" />
              </div>
              <h2 className="font-medium">Recent Emails</h2>
            </div>
            <span className="text-2xl font-bold">{threads.length}</span>
          </div>
          {threads.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {threads.slice(0, 3).map((t) => (
                <li key={t.threadId} className="flex items-center justify-between text-muted-foreground">
                  <span className="truncate">{t.companyName}</span>
                  <span className="text-xs shrink-0 ml-2">{formatRelative(t.latestAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No email threads</p>
          )}
          <Button variant="link" className="px-0 mt-3" onClick={() => onNavigate('inbox')}>
            View inbox
          </Button>
        </Card>

        {/* Portfolio Highlights */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Briefcase className="size-5 text-primary" />
            </div>
            <h2 className="font-medium">Portfolio Highlights</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Companies:</span>
              <span className="font-medium">{companies.length}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Invested:</span>
              <span className="font-medium">${(totalInvested / 1_000_000).toFixed(1)}M</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Active:</span>
              <span className="font-medium">{activeCount}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Exited:</span>
              <span className="font-medium">{exitedCount}</span>
            </div>
          </div>
          <Button variant="link" className="px-0 mt-3" onClick={() => onNavigate('portfolio')}>
            View portfolio
          </Button>
        </Card>

        {/* Form Builder */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="size-5 text-primary" />
            </div>
            <h2 className="font-medium">Form Builder</h2>
          </div>
          {formName ? (
            <div className="text-sm space-y-1">
              <p className="text-muted-foreground">
                Form: <span className="text-foreground font-medium">{formName}</span>
              </p>
              <p className="text-muted-foreground">
                Status: <span className="text-foreground font-medium capitalize">{formStatus ?? 'active'}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No form published yet</p>
          )}
          <Button variant="link" className="px-0 mt-3" onClick={() => onNavigate('builder')}>
            {formName ? 'Edit form' : 'Create form'}
          </Button>
        </Card>

        {/* Linked Email */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="size-5 text-primary" />
            </div>
            <h2 className="font-medium">Linked Sender Email</h2>
          </div>
          {isLoadingEmail ? (
            <p className="text-sm text-muted-foreground">Loading email settings...</p>
          ) : isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connected via {providerLabel}: <span className="text-foreground">{connectedEmail}</span>
              </p>
              <Button variant="outline" size="sm" onClick={handleDisconnectMailbox} disabled={isDisconnecting}>
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No email linked. Connect your Gmail or Outlook to send emails from your real address.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleConnectMailbox('google')} disabled={isConnecting}>
                  {isConnecting ? 'Connecting...' : 'Connect Gmail'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleConnectMailbox('microsoft')} disabled={isConnecting}>
                  {isConnecting ? 'Connecting...' : 'Connect Outlook'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function findCompanyName(data: Record<string, string | string[]>): string {
  for (const [key, value] of Object.entries(data)) {
    const k = key.toLowerCase();
    if ((k.includes('company') || k.includes('startup') || k.includes('name')) && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return 'Unnamed';
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
