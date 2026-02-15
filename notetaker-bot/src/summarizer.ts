import OpenAI from 'openai';

interface SummaryResult {
  overallSummary: string;
  keyPoints: string[];
  actionItems: string[];
  founderImpressions: string;
  concerns: string[];
  nextSteps: string[];
}

export async function summarizeTranscript(transcriptText: string): Promise<SummaryResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are an AI assistant for a venture capital firm. You analyze transcripts of calls between VCs and startup founders.

Your job is to produce a structured summary of the call. Return a JSON object with these fields:

- overallSummary: A 2-3 paragraph summary of the entire call
- keyPoints: An array of 3-8 key discussion points from the call
- actionItems: An array of action items that were agreed upon or implied
- founderImpressions: A paragraph describing your impression of the founder(s) based on the call — their communication style, conviction, domain expertise, etc.
- concerns: An array of any red flags, risks, or concerns raised during the call
- nextSteps: An array of concrete next steps discussed or implied

Be concise but thorough. Focus on information relevant to investment decisions.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Please analyze the following call transcript and provide a structured summary:\n\n${transcriptText}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content || '{}';
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(content);
  } catch {
    console.error('[SUMMARIZER] Failed to parse GPT response:', content);
    parsed = {};
  }

  const toStringArray = (val: unknown): string[] =>
    Array.isArray(val) ? val.filter((item): item is string => typeof item === 'string') : [];

  return {
    overallSummary: typeof parsed.overallSummary === 'string' ? parsed.overallSummary : '',
    keyPoints: toStringArray(parsed.keyPoints),
    actionItems: toStringArray(parsed.actionItems),
    founderImpressions: typeof parsed.founderImpressions === 'string' ? parsed.founderImpressions : '',
    concerns: toStringArray(parsed.concerns),
    nextSteps: toStringArray(parsed.nextSteps),
  };
}
