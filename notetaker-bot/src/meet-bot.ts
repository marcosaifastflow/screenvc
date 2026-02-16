// Recall.ai bot management - sends a bot to join Google Meet via Recall.ai API

const RECALL_REGION = process.env.RECALL_REGION || 'us-west-2';
const RECALL_API_BASE = `https://${RECALL_REGION}.recall.ai/api/v1`;

function getApiKey(): string {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) throw new Error('RECALL_API_KEY is not configured');
  return apiKey;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function createRecallBot(
  meetLink: string,
  botName: string,
): Promise<{ botId: string }> {
  const apiKey = getApiKey();

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

  const data = await response.json() as any;
  console.log(`[RECALL] Bot created: ${data.id}`);

  return { botId: data.id };
}

export async function getRecallBotStatus(botId: string): Promise<{
  status: string;
}> {
  const apiKey = getApiKey();

  const response = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
    headers: { 'Authorization': `Token ${apiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Recall.ai status error: ${response.status} — ${errorText}`);
  }

  const data = await response.json() as any;

  const statusChanges = data.status_changes || [];
  const latestStatus = statusChanges.length > 0
    ? statusChanges[statusChanges.length - 1].code
    : 'unknown';

  return { status: latestStatus };
}

export async function getRecallBotTranscript(
  botId: string,
  maxRetries = 10,
): Promise<{
  segments: Array<{ speaker: string; text: string; start: number; end: number }>;
  fullText: string;
}> {
  const apiKey = getApiKey();

  // The new Recall.ai API provides transcripts via the bot object:
  // bot.recordings[].media_shortcuts.transcript.data.download_url
  // We poll the bot until the transcript download URL is available, then fetch it.

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Step 1: Get the bot object to find the transcript download URL
    const botResponse = await fetch(`${RECALL_API_BASE}/bot/${botId}`, {
      headers: { 'Authorization': `Token ${apiKey}` },
    });

    if (!botResponse.ok) {
      const errorText = await botResponse.text();
      throw new Error(`Recall.ai bot retrieve error: ${botResponse.status} — ${errorText}`);
    }

    const botData = await botResponse.json() as any;
    const recordings = botData.recordings || [];

    // Find transcript download URL from recordings
    let downloadUrl: string | null = null;
    for (const recording of recordings) {
      const transcriptUrl = recording?.media_shortcuts?.transcript?.data?.download_url;
      if (transcriptUrl) {
        downloadUrl = transcriptUrl;
        break;
      }
    }

    if (!downloadUrl) {
      if (attempt < maxRetries - 1) {
        console.log(`[RECALL] Transcript not ready yet (attempt ${attempt + 1}/${maxRetries}), retrying in 15s...`);
        await delay(15_000);
        continue;
      }
      throw new Error('Transcript download URL not available after all retries');
    }

    // Step 2: Download the transcript JSON
    console.log(`[RECALL] Downloading transcript from: ${downloadUrl}`);
    const transcriptResponse = await fetch(downloadUrl);

    if (!transcriptResponse.ok) {
      if (attempt < maxRetries - 1) {
        console.log(`[RECALL] Transcript download failed (${transcriptResponse.status}), retrying...`);
        await delay(10_000);
        continue;
      }
      const errorText = await transcriptResponse.text();
      throw new Error(`Recall.ai transcript download error: ${transcriptResponse.status} — ${errorText}`);
    }

    const data = await transcriptResponse.json() as any[];

    // Step 3: Parse the transcript
    // Format: [{ participant: { name }, words: [{ text, start_timestamp: { relative }, end_timestamp: { relative } }] }]
    const segments: Array<{ speaker: string; text: string; start: number; end: number }> = [];
    const textParts: string[] = [];

    for (const entry of data) {
      const speaker = entry.participant?.name || entry.speaker || 'Unknown';
      const words = entry.words || [];
      if (words.length === 0) continue;

      const text = words.map((w: any) => w.text).join(' ');

      // Support both old format (start_time/end_time) and new format (start_timestamp.relative/end_timestamp.relative)
      const start = words[0].start_timestamp?.relative ?? words[0].start_time ?? 0;
      const end = words[words.length - 1].end_timestamp?.relative ?? words[words.length - 1].end_time ?? start;

      segments.push({ speaker, text, start, end });
      textParts.push(`${speaker}: ${text}`);
    }

    if (textParts.length === 0 && attempt < maxRetries - 1) {
      console.log(`[RECALL] Transcript empty (attempt ${attempt + 1}/${maxRetries}), retrying...`);
      await delay(15_000);
      continue;
    }

    return {
      segments,
      fullText: textParts.join('\n'),
    };
  }

  return { segments: [], fullText: '' };
}
