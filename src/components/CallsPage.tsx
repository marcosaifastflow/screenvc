import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Bot,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import {
  getCalls,
  sendNotetaker,
  getNotetakerStatus,
  type ScheduledCall,
  type NotetakerSession,
} from '../utils/api';
import { toast } from 'sonner';
import { CallNotesDialog } from './CallNotesDialog';

interface CallsPageProps {
  accessToken?: string | null;
  onBackToHub: () => void;
  onOpenApplication: (submissionId: string) => void;
}

type NotetakerStatusMap = Record<string, NotetakerSession | null>;

const ACTIVE_STATUSES = new Set(['requesting', 'joining', 'recording', 'processing']);

function NotetakerBadge({ session }: { session: NotetakerSession | null }) {
  if (!session) return null;

  const config: Record<string, { label: string; className: string }> = {
    requesting: { label: 'Bot requesting', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
    joining: { label: 'Bot joining', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
    recording: { label: 'Recording', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 animate-pulse' },
    processing: { label: 'Processing', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
    completed: { label: 'Notes ready', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  };

  const { label, className } = config[session.status] ?? { label: session.status, className: 'bg-muted text-muted-foreground' };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {session.status === 'recording' && <span className="size-1.5 rounded-full bg-current" />}
      {session.status === 'completed' && <CheckCircle2 className="size-3" />}
      {session.status === 'failed' && <AlertCircle className="size-3" />}
      {ACTIVE_STATUSES.has(session.status) && session.status !== 'recording' && <Loader2 className="size-3 animate-spin" />}
      {label}
    </span>
  );
}

export function CallsPage({ accessToken, onBackToHub, onOpenApplication }: CallsPageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [calls, setCalls] = useState<ScheduledCall[]>([]);
  const [notetakerStatuses, setNotetakerStatuses] = useState<NotetakerStatusMap>({});
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [notesCallId, setNotesCallId] = useState<string | null>(null);
  const [notesCompanyName, setNotesCompanyName] = useState('');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    const loadCalls = async () => {
      setIsLoading(true);
      const result = await getCalls(accessToken);
      if (!active) return;

      if (!result.success) {
        toast.error(result.error || 'Failed to load calls');
        setCalls([]);
        setIsLoading(false);
        return;
      }

      setCalls(result.calls);
      setIsLoading(false);

      // Load notetaker status for all calls
      const statusMap: NotetakerStatusMap = {};
      await Promise.all(
        result.calls.map(async (call) => {
          const statusResult = await getNotetakerStatus(call.id, accessToken);
          if (active && statusResult.success) {
            statusMap[call.id] = statusResult.session;
          }
        }),
      );
      if (active) {
        setNotetakerStatuses(statusMap);
      }
    };

    loadCalls();
    return () => {
      active = false;
    };
  }, [accessToken]);

  // Poll active sessions every 5 seconds
  const pollActiveStatuses = useCallback(async () => {
    const activeCallIds = Object.entries(notetakerStatuses)
      .filter(([, session]) => session && ACTIVE_STATUSES.has(session.status))
      .map(([callId]) => callId);

    if (activeCallIds.length === 0) return;

    const updates: NotetakerStatusMap = {};
    await Promise.all(
      activeCallIds.map(async (callId) => {
        const result = await getNotetakerStatus(callId, accessToken);
        if (result.success) {
          updates[callId] = result.session;
        }
      }),
    );

    setNotetakerStatuses((prev) => ({ ...prev, ...updates }));
  }, [notetakerStatuses, accessToken]);

  useEffect(() => {
    const hasActive = Object.values(notetakerStatuses).some(
      (s) => s && ACTIVE_STATUSES.has(s.status),
    );

    if (hasActive) {
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(pollActiveStatuses, 5000);
      }
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [notetakerStatuses, pollActiveStatuses]);

  const handleSendNotetaker = async (callId: string) => {
    setSendingIds((prev) => new Set(prev).add(callId));
    const result = await sendNotetaker(callId, accessToken);

    if (!result.success) {
      toast.error(result.error || 'Failed to send notetaker');
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(callId);
        return next;
      });
      return;
    }

    toast.success('Notetaker bot dispatched');
    setSendingIds((prev) => {
      const next = new Set(prev);
      next.delete(callId);
      return next;
    });

    // Immediately set status to requesting
    setNotetakerStatuses((prev) => ({
      ...prev,
      [callId]: {
        id: result.sessionId,
        callId,
        status: 'requesting',
        botName: 'ScreenVC Notetaker',
        errorMessage: null,
        requestedAt: new Date().toISOString(),
        joinedAt: null,
        endedAt: null,
      },
    }));
  };

  const handleViewNotes = (callId: string, companyName: string) => {
    setNotesCallId(callId);
    setNotesCompanyName(companyName);
  };

  const now = Date.now();
  const upcomingCalls = useMemo(
    () => calls.filter((call) => new Date(call.scheduledAt).getTime() >= now),
    [calls, now],
  );
  const pastCalls = useMemo(
    () => calls.filter((call) => new Date(call.scheduledAt).getTime() < now),
    [calls, now],
  );

  const renderCallCard = (call: ScheduledCall) => {
    const session = notetakerStatuses[call.id] ?? null;
    const isSending = sendingIds.has(call.id);
    const canSendNotetaker =
      call.meetLink && !isSending && (!session || session.status === 'failed');
    const hasNotes = session?.status === 'completed';

    return (
      <Card key={call.id} className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3>{call.companyName}</h3>
            <p className="text-sm text-muted-foreground">{call.startupEmail}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotetakerBadge session={session} />
            <p className="text-sm text-muted-foreground">{call.status}</p>
          </div>
        </div>

        {session?.status === 'failed' && session.errorMessage && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{session.errorMessage}</p>
        )}

        <div className="mt-3 space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Scheduled:</span>{' '}
            {new Date(call.scheduledAt).toLocaleString()} ({call.timezone})
          </p>
          <p>
            <span className="text-muted-foreground">Duration:</span> {call.durationMinutes} minutes
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {call.meetLink && (
            <Button asChild>
              <a href={call.meetLink} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4 mr-2" />
                Join Call
              </a>
            </Button>
          )}
          {canSendNotetaker && (
            <Button
              variant="outline"
              onClick={() => handleSendNotetaker(call.id)}
              disabled={isSending}
            >
              {isSending ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Bot className="size-4 mr-2" />
              )}
              Send Notetaker
            </Button>
          )}
          {hasNotes && (
            <Button variant="outline" onClick={() => handleViewNotes(call.id, call.companyName)}>
              <FileText className="size-4 mr-2" />
              View Notes
            </Button>
          )}
          {call.submissionId && (
            <Button variant="outline" onClick={() => onOpenApplication(call.submissionId)}>
              Open Application
            </Button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-muted/30 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl">Calls</h1>
            <p className="text-sm text-muted-foreground">Track upcoming and past founder calls</p>
          </div>
          <Button variant="outline" onClick={onBackToHub}>
            <ArrowLeft className="size-4 mr-2" />
            Back to Hub
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {isLoading ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Loading calls...</p>
          </Card>
        ) : (
          <div className="grid xl:grid-cols-2 gap-6">
            <Card className="p-6">
              <h2 className="mb-4 flex items-center gap-2">
                <CalendarClock className="size-5 text-primary" />
                Upcoming Calls
              </h2>
              <div className="space-y-3">
                {upcomingCalls.length > 0 ? (
                  upcomingCalls.map(renderCallCard)
                ) : (
                  <p className="text-sm text-muted-foreground">No upcoming calls scheduled.</p>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="mb-4">Past Calls</h2>
              <div className="space-y-3">
                {pastCalls.length > 0 ? (
                  pastCalls.map(renderCallCard)
                ) : (
                  <p className="text-sm text-muted-foreground">No past calls yet.</p>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

      <CallNotesDialog
        open={notesCallId !== null}
        onOpenChange={(open) => {
          if (!open) setNotesCallId(null);
        }}
        callId={notesCallId ?? ''}
        companyName={notesCompanyName}
        accessToken={accessToken}
      />
    </div>
  );
}
