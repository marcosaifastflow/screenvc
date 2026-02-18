import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Sparkles, ClipboardList, FileText, LogOut, User, Mail, CalendarClock, Briefcase } from 'lucide-react';
import { getMailboxStatus, getMailboxConnectUrl, disconnectMailbox, type MailboxStatus } from '../utils/api';
import { toast } from 'sonner';

interface VCHubPageProps {
  userEmail?: string;
  accessToken?: string | null;
  onOpenBuilder: () => void;
  onOpenResults: () => void;
  onOpenInbox: () => void;
  onOpenCalls: () => void;
  onOpenPortfolio: () => void;
  onLogout: () => void;
}

export function VCHubPage({
  userEmail,
  accessToken,
  onOpenBuilder,
  onOpenResults,
  onOpenInbox,
  onOpenCalls,
  onOpenPortfolio,
  onLogout,
}: VCHubPageProps) {
  const [mailboxStatus, setMailboxStatus] = useState<MailboxStatus | null>(null);
  const [isLoadingEmailSettings, setIsLoadingEmailSettings] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Handle OAuth callback params
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

  // Load mailbox status
  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      setIsLoadingEmailSettings(true);
      const result = await getMailboxStatus(accessToken);
      if (!active) return;

      setMailboxStatus(result.status ?? null);
      setIsLoadingEmailSettings(false);
    };

    loadStatus();
    return () => {
      active = false;
    };
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

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-muted/30 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-yellow.png" alt="ScreenVC" className="h-12" />
            <div>
              <h1 className="text-2xl">VC Hub</h1>
              <p className="text-sm text-muted-foreground">
                Manage your application form and review submissions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground hidden sm:flex items-center gap-2">
              <User className="size-4" />
              <span>{userEmail}</span>
            </div>
            <Button variant="outline" onClick={onLogout} className="gap-2">
              <LogOut className="size-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-8">
            <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <ClipboardList className="size-6 text-primary" />
            </div>
            <h2 className="mb-2">Form Builder</h2>
            <p className="text-muted-foreground mb-6">
              Create your screening form, define your VC thesis, preview it, and publish.
            </p>
            <Button onClick={onOpenBuilder} className="w-full">
              Open Form Builder
            </Button>
          </Card>

          <Card className="p-8">
            <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="size-6 text-primary" />
            </div>
            <h2 className="mb-2">View Form Results</h2>
            <p className="text-muted-foreground mb-6">
              Review submissions from founders and inspect answers in one place.
            </p>
            <Button onClick={onOpenResults} className="w-full">
              View Form Results
            </Button>
          </Card>

          <Card className="p-8">
            <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Mail className="size-6 text-primary" />
            </div>
            <h2 className="mb-2">Email Inbox</h2>
            <p className="text-muted-foreground mb-6">
              Review sent emails, monitor startup replies, and send follow-ups.
            </p>
            <Button onClick={onOpenInbox} className="w-full">
              Open Email Inbox
            </Button>
          </Card>

          <Card className="p-8">
            <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <CalendarClock className="size-6 text-primary" />
            </div>
            <h2 className="mb-2">Calls</h2>
            <p className="text-muted-foreground mb-6">
              Track upcoming and past calls, and join scheduled meetings.
            </p>
            <Button onClick={onOpenCalls} className="w-full">
              Open Calls
            </Button>
          </Card>

          <Card className="p-8">
            <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Briefcase className="size-6 text-primary" />
            </div>
            <h2 className="mb-2">My Portfolio</h2>
            <p className="text-muted-foreground mb-6">
              Track your startup investments, view portfolio analytics, and get AI recommendations.
            </p>
            <Button onClick={onOpenPortfolio} className="w-full">
              Open Portfolio
            </Button>
          </Card>

          <Card className="p-8 md:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="mb-2">Linked Sender Email</h2>
                {isLoadingEmailSettings ? (
                  <p className="text-muted-foreground">Loading email settings...</p>
                ) : isConnected ? (
                  <p className="text-muted-foreground">
                    Connected via {providerLabel}: {connectedEmail}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    No email linked yet. Connect your Gmail or Outlook to send and receive emails from your real address.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {!isConnected && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleConnectMailbox('google')}
                      disabled={isConnecting || isLoadingEmailSettings}
                    >
                      {isConnecting ? 'Connecting...' : 'Connect Gmail'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleConnectMailbox('microsoft')}
                      disabled={isConnecting || isLoadingEmailSettings}
                    >
                      {isConnecting ? 'Connecting...' : 'Connect Outlook'}
                    </Button>
                  </>
                )}
                {isConnected && (
                  <Button variant="outline" onClick={handleDisconnectMailbox} disabled={isDisconnecting}>
                    {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
