import { type Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';

const MAX_DURATION_MS = 90 * 60 * 1000; // 90 minutes max
const CHECK_INTERVAL_MS = 5000;

export async function recordAudio(page: Page, sessionId: string): Promise<string> {
  const outputPath = path.join(os.tmpdir(), `notetaker-${sessionId}.webm`);

  // Inject MediaRecorder into the page to capture audio from the tab
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      try {
        // Use getDisplayMedia to capture tab audio
        const audioContext = new AudioContext();
        const dest = audioContext.createMediaStreamDestination();

        // Capture all audio elements on the page
        const audioElements = document.querySelectorAll('audio, video');
        audioElements.forEach((el) => {
          try {
            const source = audioContext.createMediaElementSource(el as HTMLMediaElement);
            source.connect(dest);
            source.connect(audioContext.destination); // Keep playback
          } catch {
            // Element might already be connected
          }
        });

        const recorder = new MediaRecorder(dest.stream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          (globalThis as any).__recordedBlob = blob;
        };

        recorder.start(1000); // Collect data every second
        (globalThis as any).__mediaRecorder = recorder;
        (globalThis as any).__audioContext = audioContext;

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  console.log('[RECORDER] Recording started');

  // Monitor for call end
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_DURATION_MS) {
    await page.waitForTimeout(CHECK_INTERVAL_MS);

    const callEnded = await page.evaluate(() => {
      const body = document.body.innerText;
      return (
        body.includes('You left the meeting') ||
        body.includes('The meeting has ended') ||
        body.includes('Return to home screen') ||
        body.includes('Rejoin') ||
        body.includes('removed you from the meeting')
      );
    }).catch(() => false);

    if (callEnded) {
      console.log('[RECORDER] Call ended detected');
      break;
    }
  }

  // Stop recording
  await page.evaluate(() => {
    const recorder = (globalThis as any).__mediaRecorder as MediaRecorder;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    const ctx = (globalThis as any).__audioContext as AudioContext;
    if (ctx) ctx.close();
  });

  // Wait for blob to be ready
  await page.waitForTimeout(1000);

  // Extract the recorded audio
  const audioBase64 = await page.evaluate(() => {
    return new Promise<string>((resolve) => {
      const blob = (globalThis as any).__recordedBlob as Blob;
      if (!blob) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1] || '');
      };
      reader.readAsDataURL(blob);
    });
  });

  if (!audioBase64) {
    throw new Error('No audio was recorded');
  }

  // Write to file
  const buffer = Buffer.from(audioBase64, 'base64');
  fs.writeFileSync(outputPath, buffer);
  console.log(`[RECORDER] Audio saved to ${outputPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

  return outputPath;
}
