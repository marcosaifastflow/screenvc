import express from 'express';
import { createRecallBot, getRecallBotStatus, getRecallBotTranscript } from './meet-bot';
import { summarizeTranscript } from './summarizer';
import { sendWebhook } from './webhook';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3100', 10);
const BOT_SERVICE_SECRET = process.env.BOT_SERVICE_SECRET || '';

// Auth middleware
app.use((req, res, next) => {
  if (req.path === '/health') return next();

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${BOT_SERVICE_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

interface JoinRequest {
  callId: string;
  sessionId: string;
  meetLink: string;
  botName: string;
  callbackUrl: string;
  callbackSecret: string;
}

app.post('/join', (req, res) => {
  const {
    callId,
    sessionId,
    meetLink,
    botName,
    callbackUrl,
    callbackSecret,
  } = req.body as JoinRequest;

  if (!callId || !sessionId || !meetLink || !callbackUrl || !callbackSecret) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // Acknowledge immediately, process in background
  res.json({ success: true, message: 'Bot dispatched' });

  // Run the bot pipeline asynchronously
  runBotPipeline({
    callId,
    sessionId,
    meetLink,
    botName: botName || 'ScreenVC Notetaker',
    callbackUrl,
    callbackSecret,
  }).catch((err) => {
    console.error(`[BOT ${sessionId}] Fatal error:`, err);
  });
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Recall.ai bot statuses that mean "still in progress"
const ACTIVE_STATUSES = new Set([
  'ready',
  'joining_call',
  'in_waiting_room',
  'in_call_not_recording',
  'in_call_recording',
]);

// Statuses that mean the bot is done (successfully or not)
const TERMINAL_STATUSES = new Set([
  'call_ended',
  'done',
  'fatal',
  'analysis_done',
]);

const POLL_INTERVAL_MS = 10_000; // Poll every 10 seconds
const MAX_POLL_DURATION_MS = 120 * 60 * 1000; // 2 hours max

async function runBotPipeline(params: JoinRequest) {
  const { sessionId, meetLink, botName, callbackUrl, callbackSecret } = params;
  const log = (msg: string) => console.log(`[BOT ${sessionId}] ${msg}`);

  try {
    // Step 1: Notify — joining
    await sendWebhook(callbackUrl, callbackSecret, {
      sessionId,
      eventType: 'status_update',
      status: 'joining',
    });

    log('Creating Recall.ai bot...');
    const { botId } = await createRecallBot(meetLink, botName);
    log(`Recall bot created: ${botId}`);

    // Step 2: Poll until the bot finishes
    let sentRecordingStatus = false;
    const pollStart = Date.now();

    while (Date.now() - pollStart < MAX_POLL_DURATION_MS) {
      await delay(POLL_INTERVAL_MS);

      const { status } = await getRecallBotStatus(botId);
      log(`Bot status: ${status}`);

      // Send "recording" webhook once when the bot starts recording
      if (status === 'in_call_recording' && !sentRecordingStatus) {
        sentRecordingStatus = true;
        await sendWebhook(callbackUrl, callbackSecret, {
          sessionId,
          eventType: 'status_update',
          status: 'recording',
        });
      }

      if (status === 'fatal') {
        throw new Error('Recall.ai bot encountered a fatal error');
      }

      if (TERMINAL_STATUSES.has(status)) {
        log('Bot finished, retrieving transcript...');
        break;
      }
    }

    // Step 3: Notify — processing
    await sendWebhook(callbackUrl, callbackSecret, {
      sessionId,
      eventType: 'status_update',
      status: 'processing',
    });

    // Step 4: Get transcript from Recall.ai
    log('Fetching transcript from Recall.ai...');
    const transcript = await getRecallBotTranscript(botId);

    if (!transcript.fullText || transcript.fullText.trim().length === 0) {
      throw new Error('No transcript was produced — the call may have been too short or silent.');
    }

    log(`Transcript received: ${transcript.fullText.length} chars`);

    // Step 5: Summarize with GPT
    log('Generating summary...');
    const summary = await summarizeTranscript(transcript.fullText);

    // Build segments with duration info
    const durationSeconds =
      transcript.segments.length > 0
        ? Math.ceil(transcript.segments[transcript.segments.length - 1].end)
        : 0;
    const wordCount = transcript.fullText.split(/\s+/).filter(Boolean).length;

    // Step 6: Notify — completed with results
    await sendWebhook(callbackUrl, callbackSecret, {
      sessionId,
      eventType: 'completed',
      transcript: {
        fullText: transcript.fullText,
        segments: transcript.segments,
        durationSeconds,
        wordCount,
      },
      summary,
    });

    log('Pipeline completed successfully.');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error: ${errorMessage}`);

    await sendWebhook(callbackUrl, callbackSecret, {
      sessionId,
      eventType: 'status_update',
      status: 'failed',
      errorMessage,
    }).catch(() => {});
  }
}

app.listen(PORT, () => {
  console.log(`Notetaker bot service listening on port ${PORT}`);
});
