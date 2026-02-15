import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
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

export function EmailInboxPage({ accessToken, onBackToHub, onOpenApplication }: EmailInboxPageProps) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [messages, setMessages] = useState<EmailThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

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
      if (result.threads.length > 0) {
        setSelectedThreadId(result.threads[0].threadId);
      }
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

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-muted/30 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl">Email Inbox</h1>
            <p className="text-sm text-muted-foreground">Manage outreach and startup responses</p>
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
            <p className="text-muted-foreground">Loading inbox...</p>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-6">
            <Card className="p-4">
              <h2 className="mb-4">Threads</h2>
              {threads.length === 0 && (
                <p className="text-sm text-muted-foreground">No emails yet.</p>
              )}
              <div className="space-y-2">
                {threads.map((thread) => (
                  <button
                    key={thread.threadId}
                    type="button"
                    onClick={() => setSelectedThreadId(thread.threadId)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      selectedThreadId === thread.threadId
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <p className="font-medium truncate">{thread.companyName}</p>
                    <p className="text-xs text-muted-foreground truncate">{thread.startupEmail}</p>
                    <p className="text-sm mt-1 line-clamp-2">{thread.latestPreview || thread.latestSubject}</p>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              {!selectedThread ? (
                <div className="text-center py-12">
                  <Mail className="size-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Select a thread to view messages.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2>{selectedThread.companyName}</h2>
                      <p className="text-sm text-muted-foreground">{selectedThread.startupEmail}</p>
                    </div>
                    {selectedThread.submissionId && (
                      <Button
                        variant="outline"
                        onClick={() => onOpenApplication(selectedThread.submissionId)}
                      >
                        Open Application
                      </Button>
                    )}
                  </div>

                  {isMessagesLoading ? (
                    <p className="text-muted-foreground">Loading messages...</p>
                  ) : (
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-lg border p-3 ${
                            message.direction === 'outbound'
                              ? 'border-primary/30 bg-primary/5'
                              : 'border-border bg-muted/30'
                          }`}
                        >
                          <p className="text-sm font-medium">{message.subject}</p>
                          <p className="text-xs text-muted-foreground mb-2">
                            {new Date(message.createdAt).toLocaleString()}
                          </p>
                          <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                        </div>
                      ))}
                      {messages.length === 0 && (
                        <p className="text-sm text-muted-foreground">No messages in this thread yet.</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-3 border-t border-border pt-4">
                    <h3>Reply</h3>
                    <Input
                      value={replySubject}
                      onChange={(event) => setReplySubject(event.target.value)}
                      placeholder="Subject"
                    />
                    <Textarea
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      rows={6}
                      placeholder="Write your reply"
                    />
                    <div className="flex justify-end">
                      <Button onClick={handleReply} disabled={isReplying}>
                        <Send className="size-4 mr-2" />
                        {isReplying ? 'Sending...' : 'Send Reply'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
