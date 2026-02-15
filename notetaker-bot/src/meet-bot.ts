// Recall.ai bot management - sends a bot to join Google Meet via Recall.ai API

const RECALL_API_BASE = 'https://us-west-2.recall.ai/api/v1';

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
      transcription_options: {
        provider: 'default',
      },
      real_time_transcription: {
        destination_url: '', // We'll poll instead
      },
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
  transcript: Array<{ speaker: string; words: Array<{ text: string; start_time: number; end_time: number }> }> | null;
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

  return {
    status: latestStatus,
    transcript: data.transcript || null,
  };
}

export async function getRecallBotTranscript(botId: string): Promise<{
  segments: Array<{ speaker: string; text: string; start: number; end: number }>;
  fullText: string;
}> {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) throw new Error('RECALL_API_KEY is not configured');

  const response = await fetch(`${RECALL_API_BASE}/bot/${botId}/transcript`, {
    headers: { 'Authorization': `Token ${apiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
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

  return {
    segments,
    fullText: textParts.join('\n'),
  };
}
