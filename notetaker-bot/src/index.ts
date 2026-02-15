import express from 'express';
import { joinMeet } from './meet-bot';
import { recordAudio } from './audio-recorder';
import { transcribeAudio } from './transcriber';
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

async function runBotPipeline(params: JoinRequest) {
  const { callId, sessionId, meetLink, botName, callbackUrl, callbackSecret } = params;
  const log = (msg: string) => console.log(`[BOT ${sessionId}] ${msg}`);

  try {
    // Notify: joining
    await sendWebhook(callbackUrl, callbackSecret, {
      sessionId,
      eventType: 'status_update',
      status: 'joining',
    });

    log('Joining Google Meet...');
    const { browser, page } = await joinMeet(meetLink, botName);

    // Notify: recording
    await sendWebhook(callbackUrl, callbackSecret, {
      sessionId,
      eventType: 'status_update',
      status: 'recording',
    });

    log('Recording audio...');
    const audioPath = await recordAudio(page, sessionId);

    log('Closing browser...');
    await browser.close();

    // Notify: processing
    await sendWebhook(callbackUrl, callbackSecret, {
      sessionId,
      eventType: 'status_update',
      status: 'processing',
    });

    log('Transcribing audio...');
    const transcript = await transcribeAudio(audioPath);

    log('Generating summary...');
    const summary = await summarizeTranscript(transcript.fullText);

    // Notify: completed with results
    await sendWebhook(callbackUrl, callbackSecret, {
      sessionId,
      eventType: 'completed',
      transcript: {
        fullText: transcript.fullText,
        segments: transcript.segments,
        durationSeconds: transcript.durationSeconds,
        wordCount: transcript.wordCount,
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
