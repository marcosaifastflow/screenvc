import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB (Whisper limit is 25MB)

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface TranscriptionResult {
  fullText: string;
  segments: TranscriptSegment[];
  durationSeconds: number;
  wordCount: number;
}

export async function transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const fileSize = fs.statSync(audioPath).size;

  let segments: TranscriptSegment[] = [];
  let fullText = '';

  if (fileSize <= MAX_CHUNK_SIZE) {
    // Single file transcription
    const result = await transcribeChunk(openai, audioPath);
    segments = result.segments;
    fullText = result.text;
  } else {
    // Split into chunks using ffmpeg
    console.log(`[TRANSCRIBER] File is ${(fileSize / 1024 / 1024).toFixed(1)}MB, splitting into chunks...`);
    const chunks = await splitAudioIntoChunks(audioPath);
    let timeOffset = 0;

    for (const chunk of chunks) {
      const result = await transcribeChunk(openai, chunk.path);
      const adjustedSegments = result.segments.map((seg) => ({
        ...seg,
        start: seg.start + timeOffset,
        end: seg.end + timeOffset,
      }));
      segments.push(...adjustedSegments);
      fullText += (fullText ? ' ' : '') + result.text;
      timeOffset += chunk.durationSeconds;

      // Clean up chunk file
      fs.unlinkSync(chunk.path);
    }
  }

  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  // Get duration from segments or estimate
  const durationSeconds =
    segments.length > 0
      ? Math.ceil(segments[segments.length - 1].end)
      : Math.ceil(wordCount / 2.5); // Rough estimate: ~150 words/minute

  return { fullText, segments, durationSeconds, wordCount };
}

async function transcribeChunk(
  openai: OpenAI,
  filePath: string,
): Promise<{ text: string; segments: TranscriptSegment[] }> {
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  const text = response.text || '';
  const segments: TranscriptSegment[] = (response as any).segments?.map(
    (seg: any): TranscriptSegment => ({
      start: seg.start ?? 0,
      end: seg.end ?? 0,
      text: (seg.text ?? '').trim(),
    }),
  ) ?? [];

  return { text, segments };
}

async function splitAudioIntoChunks(
  audioPath: string,
): Promise<Array<{ path: string; durationSeconds: number }>> {
  const tmpDir = os.tmpdir();
  const chunkDurationSec = 600; // 10-minute chunks

  // Get total duration
  const { stdout: durationOut } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
  );
  const totalDuration = parseFloat(durationOut.trim()) || 0;

  const chunks: Array<{ path: string; durationSeconds: number }> = [];
  let startSec = 0;
  let index = 0;

  while (startSec < totalDuration) {
    const chunkPath = path.join(tmpDir, `notetaker-chunk-${index}.webm`);
    const duration = Math.min(chunkDurationSec, totalDuration - startSec);

    await execAsync(
      `ffmpeg -y -i "${audioPath}" -ss ${startSec} -t ${chunkDurationSec} -c copy "${chunkPath}"`,
    );

    chunks.push({ path: chunkPath, durationSeconds: duration });
    startSec += chunkDurationSec;
    index++;
  }

  return chunks;
}
