// Recall.ai bot management - sends a bot to join Google Meet via Recall.ai API

const RECALL_REGION = process.env.RECALL_REGION || 'us-west-2';
const RECALL_API_BASE = `https://${RECALL_REGION}.recall.ai/api/v1`;

interface RecallBotResponse {
  id: string;
  status_changes: Array<{ code: string; created_at: string }>;
  meeting_url: string;
}

export async function createRecallBot(
  meetLink: string,
  botName: string,
): Promise<{ botId: string }> {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) {
    throw new Error('RECALL_API_KEY is not configured');
  }

  console.log(`[RECALL] Creating bot for meeting: ${meetLink}`);

  const response = await fetch(`${RECALL_API_BASE}/bot`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      meeting_url: meetLink,
      bot_name: botName,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[RECALL] Create bot failed (${response.status}):`, errorText);
    throw new Error(`Recall.ai API error: ${response.status} — ${errorText}`);
  }

  const data = (await response.json()) as RecallBotResponse;
  console.log(`[RECALL] Bot created: ${data.id}`);

  return { botId: data.id };
}

export async function getRecallBotStatus(botId: string): Promise<{
  status: string;
}> {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) throw new Error('RECALL_API_KEY is not configured');

  const response = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
    headers: { 'Authorization': `Token ${apiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Recall.ai status error: ${response.status} — ${errorText}`);
  }

  const data = await response.json() as any;

  // Get the latest status
  const statusChanges = data.status_changes || [];
  const latestStatus = statusChanges.length > 0
    ? statusChanges[statusChanges.length - 1].code
    : 'unknown';

  return { status: latestStatus };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getRecallBotTranscript(
  botId: string,
  maxRetries = 5,
): Promise<{
  segments: Array<{ speaker: string; text: string; start: number; end: number }>;
  fullText: string;
}> {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) throw new Error('RECALL_API_KEY is not configured');

  // Recall.ai may take a moment to finalize the transcript after call_ended,
  // so retry a few times with backoff if we get an empty result.
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(`${RECALL_API_BASE}/bot/${botId}/transcript`, {
      headers: { 'Authorization': `Token ${apiKey}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 404 means transcript not ready yet — retry
      if (response.status === 404 && attempt < maxRetries - 1) {
        console.log(`[RECALL] Transcript not ready yet (attempt ${attempt + 1}/${maxRetries}), retrying...`);
        await delay(10_000);
        continue;
      }
      throw new Error(`Recall.ai transcript error: ${response.status} — ${errorText}`);
    }

    const data = await response.json() as any[];

    const segments: Array<{ speaker: string; text: string; start: number; end: number }> = [];
    const textParts: string[] = [];

    for (const entry of data) {
      const speaker = entry.speaker || 'Unknown';
      const words = entry.words || [];
      if (words.length === 0) continue;

      const text = words.map((w: any) => w.text).join(' ');
      const start = words[0].start_time || 0;
      const end = words[words.length - 1].end_time || start;

      segments.push({ speaker, text, start, end });
      textParts.push(`${speaker}: ${text}`);
    }

    // If transcript is empty and we have retries left, wait and try again
    if (textParts.length === 0 && attempt < maxRetries - 1) {
      console.log(`[RECALL] Transcript empty (attempt ${attempt + 1}/${maxRetries}), retrying...`);
      await delay(10_000);
      continue;
    }

    return {
      segments,
      fullText: textParts.join('\n'),
    };
  }

  // Should not reach here, but just in case
  return { segments: [], fullText: '' };
}
