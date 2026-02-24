import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail,
  Send,
  Search,
  ArrowUpRight,
  ArrowLeft,
  Inbox,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import {
  getEmailThreadMessages,
  getEmailThreads,
  replyToEmailThread,
  syncMailbox,
  type EmailThread,
  type EmailThreadMessage,
} from '../utils/api';
import { toast } from 'sonner';

interface EmailInboxPageProps {
  accessToken?: string | null;
  onBackToHub: () => void;
  onOpenApplication: (submissionId: string) => void;
}

function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string) {
  const colors = [
    'bg-amber-100 text-amber-700',
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-purple-100 text-purple-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
    'bg-orange-100 text-orange-700',
    'bg-indigo-100 text-indigo-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatMessageTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at ${time}`;
}

export function EmailInboxPage({ accessToken, onBackToHub, onOpenApplication }: EmailInboxPageProps) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [messages, setMessages] = useState<EmailThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(
      (t) =>
        t.companyName.toLowerCase().includes(q) ||
        t.startupEmail.toLowerCase().includes(q) ||
        t.latestSubject.toLowerCase().includes(q) ||
        t.latestPreview.toLowerCase().includes(q),
    );
  }, [threads, searchQuery]);

  useEffect(() => {
    let active = true;
    const loadThreads = async () => {
      setIsLoading(true);
      await syncMailbox(accessToken).catch(() => {});
      const result = await getEmailThreads(accessToken);
      if (!active) return;

      if (!result.success) {
        toast.error(result.error || 'Failed to load email inbox');
        setThreads([]);
        setIsLoading(false);
        return;
      }

      setThreads(result.threads);
      setIsLoading(false);
    };

    loadThreads();
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    const loadMessages = async () => {
      if (!selectedThreadId) {
        setMessages([]);
        return;
      }

      setIsMessagesLoading(true);
      const result = await getEmailThreadMessages(selectedThreadId, accessToken);
      if (!active) return;

      if (!result.success) {
        toast.error(result.error || 'Failed to load thread messages');
        setMessages([]);
        setIsMessagesLoading(false);
        return;
      }

      setMessages(result.messages);
      setReplySubject(
        result.messages[result.messages.length - 1]?.subject
          ? `Re: ${result.messages[result.messages.length - 1].subject}`
          : 'Re: Application follow-up',
      );
      setIsMessagesLoading(false);
    };

    loadMessages();
    return () => {
      active = false;
    };
  }, [selectedThreadId, accessToken]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleRefresh = async () => {
    setIsSyncing(true);
    await syncMailbox(accessToken).catch(() => {});
    const result = await getEmailThreads(accessToken);
    if (result.success) {
      setThreads(result.threads);
      toast.success('Inbox refreshed');
    }
    setIsSyncing(false);
  };

  const handleReply = async () => {
    if (!selectedThreadId) return;
    if (!replySubject.trim() || !replyBody.trim()) {
      toast.error('Please provide subject and body.');
      return;
    }

    setIsReplying(true);
    const result = await replyToEmailThread({
      threadId: selectedThreadId,
      subject: replySubject,
      body: replyBody,
      accessToken,
    });
    setIsReplying(false);

    if (!result.success) {
      toast.error(result.error || 'Failed to send reply');
      return;
    }

    toast.success('Reply sent.');
    setReplyBody('');
    const reload = await getEmailThreadMessages(selectedThreadId, accessToken);
    if (reload.success) {
      setMessages(reload.messages);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your inbox...</p>
        </div>
      </div>
    );
  }

  // When no thread is selected, show the inbox list. When a thread is selected, show only the email detail.
  if (!selectedThread) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden border rounded-xl bg-background shadow-sm mx-4 my-4">
          {/* Inbox header */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="size-5 text-primary" />
                <h2 className="font-semibold text-lg">Inbox</h2>
                {threads.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {threads.length}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={handleRefresh}
                disabled={isSyncing}
              >
                <RefreshCw className={`size-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-sm"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          {/* Thread list */}
          <ScrollArea className="flex-1">
            {filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <Mail className="size-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No conversations match your search' : 'No conversations yet'}
                </p>
              </div>
            ) : (
              <div className="py-1">
                {filteredThreads.map((thread) => (
                  <button
                    key={thread.threadId}
                    type="button"
                    onClick={() => setSelectedThreadId(thread.threadId)}
                    className="w-full text-left px-4 py-3 transition-colors border-l-2 border-l-transparent hover:bg-muted/50"
                  >
                    <div className="flex gap-3 overflow-hidden">
                      <Avatar className="size-9 shrink-0 mt-0.5">
                        <AvatarFallback className={`text-xs font-medium ${getAvatarColor(thread.companyName)}`}>
                          {getInitials(thread.companyName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm truncate">{thread.companyName}</p>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatRelativeTime(thread.latestAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {thread.latestSubject}
                        </p>
                        <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                          {stripHtml(thread.latestPreview)}
                        </p>
                      </div>
                    </div>
                    {thread.messageCount > 1 && (
                      <div className="flex justify-end mt-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                          {thread.messageCount} messages
                        </Badge>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    );
  }

  // Selected thread: show full email detail view
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden border rounded-xl bg-background shadow-sm mx-4 my-4">
        {/* Thread header with back button */}
        <div className="shrink-0 px-6 py-4 border-b flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setSelectedThreadId('')}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Avatar className="size-10 shrink-0">
              <AvatarFallback className={`text-sm font-medium ${getAvatarColor(selectedThread.companyName)}`}>
                {getInitials(selectedThread.companyName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="font-semibold truncate">{selectedThread.companyName}</h2>
              <p className="text-sm text-muted-foreground truncate">{selectedThread.startupEmail}</p>
            </div>
          </div>
          {selectedThread.submissionId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenApplication(selectedThread.submissionId)}
              className="shrink-0"
            >
              <ArrowUpRight className="size-4 mr-1.5" />
              View Application
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-auto px-6">
          {isMessagesLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-6 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Loading messages...</p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Mail className="size-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No messages in this thread yet.</p>
            </div>
          ) : (
            <div className="py-4 space-y-6">
              {messages.map((message) => {
                const isOutbound = message.direction === 'outbound';
                const isHtml = /<[a-z][\s\S]*>/i.test(message.body);
                return (
                  <div
                    key={message.id}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`${isHtml ? 'w-full' : 'max-w-[75%]'} ${isOutbound ? 'order-1' : ''}`}>
                      {/* Sender label */}
                      <div
                        className={`flex items-center gap-2 mb-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}
                      >
                        <span className="text-xs font-medium text-muted-foreground">
                          {isOutbound ? 'You' : selectedThread.companyName}
                        </span>
                        <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatMessageTime(message.createdAt)}
                        </span>
                      </div>
                      {/* Message bubble */}
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          isOutbound
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted/60 border rounded-bl-md'
                        }`}
                      >
                        {message.subject && (
                          <p
                            className={`text-sm font-medium mb-1 ${
                              isOutbound ? 'text-primary-foreground/90' : 'text-foreground'
                            }`}
                          >
                            {message.subject}
                          </p>
                        )}
                        {isHtml ? (
                          <iframe
                            srcDoc={message.body}
                            sandbox="allow-same-origin"
                            className="w-full border-0"
                            style={{ colorScheme: 'light', height: '0px', overflow: 'hidden' }}
                            onLoad={(e) => {
                              const iframe = e.target as HTMLIFrameElement;
                              try {
                                const doc = iframe.contentDocument;
                                if (doc?.body) {
                                  // Reset and measure
                                  doc.body.style.margin = '0';
                                  doc.body.style.overflow = 'hidden';
                                  iframe.style.height = doc.documentElement.scrollHeight + 'px';
                                }
                              } catch {
                                // Fallback if access blocked
                                iframe.style.height = '400px';
                              }
                            }}
                          />
                        ) : (
                          <p
                            className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
                              isOutbound ? 'text-primary-foreground/85' : 'text-foreground/80'
                            }`}
                          >
                            {message.body}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Reply composer */}
        <div className="border-t bg-muted/20 px-6 py-4 space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <Input
              value={replySubject}
              onChange={(event) => setReplySubject(event.target.value)}
              placeholder="Subject"
              className="h-9 text-sm bg-background"
            />
          </div>
          <div className="relative">
            <Textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              rows={3}
              placeholder="Write your reply..."
              className="resize-none text-sm bg-background pr-24"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleReply();
                }
              }}
            />
            <div className="absolute bottom-2 right-2">
              <Button
                size="sm"
                onClick={handleReply}
                disabled={isReplying || !replyBody.trim()}
                className="h-8 px-3 gap-1.5"
              >
                {isReplying ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                {isReplying ? 'Sending...' : 'Send'}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/60">
            Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Cmd+Enter</kbd> to send
          </p>
        </div>
      </div>
    </div>
  );
}
