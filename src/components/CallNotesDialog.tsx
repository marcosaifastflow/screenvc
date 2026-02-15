import { useEffect, useState } from 'react';
import { Copy, Check, FileText, ListChecks } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  getCallTranscript,
  getCallSummary,
  type CallTranscript,
  type CallSummary,
} from '../utils/api';
import { toast } from 'sonner';

interface CallNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string;
  companyName: string;
  accessToken?: string | null;
}

export function CallNotesDialog({
  open,
  onOpenChange,
  callId,
  companyName,
  accessToken,
}: CallNotesDialogProps) {
  const [transcript, setTranscript] = useState<CallTranscript | null>(null);
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !callId) return;

    let active = true;
    const load = async () => {
      setIsLoading(true);
      const [transcriptResult, summaryResult] = await Promise.all([
        getCallTranscript(callId, accessToken),
        getCallSummary(callId, accessToken),
      ]);

      if (!active) return;

      if (transcriptResult.success) {
        setTranscript(transcriptResult.transcript);
      }
      if (summaryResult.success) {
        setSummary(summaryResult.summary);
      }
      setIsLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [open, callId, accessToken]);

  const handleCopy = async () => {
    const parts: string[] = [];

    if (summary) {
      parts.push(`## Summary\n${summary.overallSummary}`);
      if (summary.keyPoints.length > 0) {
        parts.push(`\n## Key Points\n${summary.keyPoints.map((p) => `- ${p}`).join('\n')}`);
      }
      if (summary.actionItems.length > 0) {
        parts.push(`\n## Action Items\n${summary.actionItems.map((a) => `- ${a}`).join('\n')}`);
      }
      if (summary.concerns.length > 0) {
        parts.push(`\n## Concerns\n${summary.concerns.map((c) => `- ${c}`).join('\n')}`);
      }
      if (summary.nextSteps.length > 0) {
        parts.push(`\n## Next Steps\n${summary.nextSteps.map((s) => `- ${s}`).join('\n')}`);
      }
      if (summary.founderImpressions) {
        parts.push(`\n## Founder Impressions\n${summary.founderImpressions}`);
      }
    }

    if (transcript) {
      parts.push(`\n## Full Transcript\n${transcript.fullText}`);
    }

    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Call Notes — {companyName}</DialogTitle>
          <DialogDescription>
            Transcript and AI-generated summary
            {transcript?.durationSeconds != null && (
              <> · {formatTime(transcript.durationSeconds)} duration</>
            )}
            {transcript?.wordCount != null && <> · {transcript.wordCount} words</>}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading notes...</p>
        ) : !transcript && !summary ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No notes available for this call yet.
          </p>
        ) : (
          <>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="size-4 mr-1.5" />
                ) : (
                  <Copy className="size-4 mr-1.5" />
                )}
                {copied ? 'Copied' : 'Copy All'}
              </Button>
            </div>

            <Tabs defaultValue="summary" className="flex-1 min-h-0">
              <TabsList>
                <TabsTrigger value="summary">
                  <ListChecks className="size-4 mr-1.5" />
                  Summary
                </TabsTrigger>
                <TabsTrigger value="transcript">
                  <FileText className="size-4 mr-1.5" />
                  Full Transcript
                </TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="overflow-y-auto max-h-[50vh] pr-2">
                {summary ? (
                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="font-medium mb-1">Overview</h4>
                      <p className="text-muted-foreground">{summary.overallSummary}</p>
                    </div>

                    {summary.keyPoints.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1">Key Points</h4>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          {summary.keyPoints.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {summary.actionItems.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1">Action Items</h4>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          {summary.actionItems.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {summary.founderImpressions && (
                      <div>
                        <h4 className="font-medium mb-1">Founder Impressions</h4>
                        <p className="text-muted-foreground">{summary.founderImpressions}</p>
                      </div>
                    )}

                    {summary.concerns.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1">Concerns</h4>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          {summary.concerns.map((concern, i) => (
                            <li key={i}>{concern}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {summary.nextSteps.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-1">Next Steps</h4>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          {summary.nextSteps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">No summary available.</p>
                )}
              </TabsContent>

              <TabsContent value="transcript" className="overflow-y-auto max-h-[50vh] pr-2">
                {transcript ? (
                  <div className="space-y-2 text-sm">
                    {transcript.segments.length > 0 ? (
                      transcript.segments.map((seg, i) => (
                        <div key={i} className="flex gap-3">
                          <span className="text-xs text-muted-foreground font-mono shrink-0 pt-0.5">
                            {formatTime(seg.start)}
                          </span>
                          <div>
                            {seg.speaker && (
                              <span className="font-medium mr-1.5">{seg.speaker}:</span>
                            )}
                            <span className="text-muted-foreground">{seg.text}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {transcript.fullText}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">No transcript available.</p>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
