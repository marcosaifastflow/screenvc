import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";

const app = new Hono();

// Supabase clients
const getServiceClient = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
};

const getAnonClient = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );
};

// Auth middleware helper
const getUserFromToken = async (token: string | null) => {
  if (!token) {
    console.log('[AUTH] No token provided');
    return null;
  }

  console.log('[AUTH] ============ TOKEN DEBUG ============');
  console.log('[AUTH] Token received (first 50 chars):', token.substring(0, 50) + '...');
  console.log('[AUTH] Token (last 50 chars):', '...' + token.substring(token.length - 50));
  console.log('[AUTH] Token length:', token.length);
  
  // Decode the JWT payload to see what's inside (without verification)
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      console.log('[AUTH] JWT Payload:', JSON.stringify(payload, null, 2));
      console.log('[AUTH] JWT Issuer:', payload.iss);
      console.log('[AUTH] JWT Subject (user):', payload.sub);
      console.log('[AUTH] JWT Expires:', new Date(payload.exp * 1000).toISOString());
      console.log('[AUTH] Current time:', new Date().toISOString());
      console.log('[AUTH] Token expired?', payload.exp * 1000 < Date.now());
    }
  } catch (e) {
    console.error('[AUTH] Failed to decode JWT:', e);
  }
  
  console.log('[AUTH] SUPABASE_URL:', Deno.env.get('SUPABASE_URL'));
  console.log('[AUTH] SUPABASE_ANON_KEY (first 50):', Deno.env.get('SUPABASE_ANON_KEY')?.substring(0, 50));

  try {
    // Try with service role client first
    console.log('[AUTH] Attempting validation with service role client...');
    const serviceClient = getServiceClient();
    const { data: serviceData, error: serviceError } = await serviceClient.auth.getUser(token);
    
    if (!serviceError && serviceData.user) {
      console.log('[AUTH] ✓ Service client validation SUCCESS');
      console.log('[AUTH] User ID:', serviceData.user.id);
      console.log('[AUTH] User email:', serviceData.user.email);
      return serviceData.user;
    } else {
      console.error('[AUTH] ✗ Service client validation FAILED:', serviceError?.message);
      console.error('[AUTH] Service error details:', JSON.stringify(serviceError));
    }

    // Try with anon client
    console.log('[AUTH] Attempting validation with anon client...');
    const anonClient = getAnonClient();
    const { data: anonData, error: anonError } = await anonClient.auth.getUser(token);
    
    if (!anonError && anonData.user) {
      console.log('[AUTH] ✓ Anon client validation SUCCESS');
      console.log('[AUTH] User ID:', anonData.user.id);
      console.log('[AUTH] User email:', anonData.user.email);
      return anonData.user;
    } else {
      console.error('[AUTH] ✗ Anon client validation FAILED:', anonError?.message);
      console.error('[AUTH] Anon error details:', JSON.stringify(anonError));
    }
    
    console.log('[AUTH] ============ END TOKEN DEBUG ============');
    return null;
  } catch (err) {
    console.error('[AUTH] Exception during token validation:', err);
    return null;
  }
};

const getUserFromRequest = async (c: any) => {
  // Preferred: explicit user JWT header (keeps gateway auth separate from app auth).
  const userJwtHeader = c.req.header('x-user-jwt');
  if (userJwtHeader) {
    const user = await getUserFromToken(userJwtHeader);
    if (user) return user;
  }

  // Backward compatibility: accept Bearer user JWT from Authorization.
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return null;
  const bearerToken = authHeader.split(' ')[1];
  if (!bearerToken) return null;
  return getUserFromToken(bearerToken);
};

type FitStatus = 'Fit' | 'Partial Fit' | 'Not a Fit';

interface FitCriterionResult {
  criteria: string;
  status: FitStatus;
  detail: string;
}

const DEFAULT_FIT_RESULTS: FitCriterionResult[] = [
  { criteria: 'Investment Stage', status: 'Partial Fit', detail: 'Insufficient structured stage evidence in submission; requires deeper diligence.' },
  { criteria: 'Sectors & Industries', status: 'Fit', detail: 'The company appears aligned with the target sector orientation in the VC criteria.' },
  { criteria: 'Geography', status: 'Fit', detail: 'Geographic profile broadly matches the preferred investment footprint.' },
  { criteria: 'Revenue Profile', status: 'Partial Fit', detail: 'Revenue signals are promising but require validation against threshold expectations.' },
  { criteria: 'Custom Criteria', status: 'Partial Fit', detail: 'Several custom thesis elements are partially met based on provided answers.' },
];

const DEFAULT_FIT_SUMMARY =
  'The application shows meaningful alignment with core thesis dimensions, particularly sector and geography, while stage and revenue clarity are moderate. Overall this supports a strong but not perfect fit assessment.';

const normalizeFitStatus = (value: unknown): FitStatus => {
  if (value === 'Fit' || value === 'Partial Fit' || value === 'Not a Fit') {
    return value;
  }
  return 'Partial Fit';
};

const normalizeFitResults = (value: unknown): FitCriterionResult[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_FIT_RESULTS;
  }

  const normalized = value
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        criteria: typeof record.criteria === 'string' ? record.criteria : 'Criteria',
        status: normalizeFitStatus(record.status),
        detail: typeof record.detail === 'string' ? record.detail : '',
      };
    })
    .slice(0, 8);

  return normalized.length > 0 ? normalized : DEFAULT_FIT_RESULTS;
};

const evaluateFitWithOpenAI = async (
  criteria: unknown,
  submissionData: unknown,
  questions: unknown,
): Promise<{ results: FitCriterionResult[]; summary: string }> => {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return { results: DEFAULT_FIT_RESULTS, summary: DEFAULT_FIT_SUMMARY };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'vc_fit_assessment',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      criteria: { type: 'string' },
                      status: { type: 'string', enum: ['Fit', 'Partial Fit', 'Not a Fit'] },
                      detail: { type: 'string' },
                    },
                    required: ['criteria', 'status', 'detail'],
                  },
                },
                summary: { type: 'string' },
              },
              required: ['results', 'summary'],
            },
          },
        },
        messages: [
          {
            role: 'system',
            content:
              'You evaluate startup applications against VC thesis criteria. Return concise JSON only. Use status labels exactly: Fit, Partial Fit, Not a Fit.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: 'Compare VC saved criteria with the founder form answers and evaluate fit.',
              requiredCriteria: [
                'Investment Stage',
                'Sectors & Industries',
                'Geography',
                'Revenue Profile',
                'Custom Criteria',
              ],
              vcCriteria: criteria,
              submissionAnswers: submissionData,
              questions,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[OPENAI FIT] Non-OK response:', response.status, errorBody);
      return { results: DEFAULT_FIT_RESULTS, summary: DEFAULT_FIT_SUMMARY };
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return { results: DEFAULT_FIT_RESULTS, summary: DEFAULT_FIT_SUMMARY };
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const results = normalizeFitResults(parsed.results);
    const summary = typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
      ? parsed.summary
      : DEFAULT_FIT_SUMMARY;

    return { results, summary };
  } catch (error) {
    console.error('[OPENAI FIT] Exception:', error);
    return { results: DEFAULT_FIT_RESULTS, summary: DEFAULT_FIT_SUMMARY };
  }
};

interface MarketReportSection {
  title: string;
  subtitle: string;
  paragraphs: string[];
  bullets: string[];
}

interface MarketReportConclusion {
  title: string;
  paragraphs: string[];
  finalStatement: string;
}

interface MarketReportPayload {
  title: string;
  sections: MarketReportSection[];
  conclusion: MarketReportConclusion;
  companyName: string;
  industry: string;
  oneLiner: string;
  generatedAt: string;
}

const DEFAULT_MARKET_REPORT_SECTION_TITLES = [
  '1. Executive Summary',
  '2. Market Opportunity',
  '3. Business Model & Economics',
  '4. Competitive Positioning',
  '5. Brand & Consumer Behavior Advantage',
  '6. Structural Growth Drivers',
  '7. Financial Profile & Capital Efficiency',
  '8. Risk Analysis',
  '9. Strategic Optionality',
  '10. Investment Thesis',
];

const normalizeSubmissionTextMap = (submissionData: unknown) => {
  const map = new Map<string, string>();
  if (typeof submissionData !== 'object' || submissionData === null) {
    return map;
  }

  Object.entries(submissionData as Record<string, unknown>).forEach(([rawKey, value]) => {
    const key = rawKey.trim().toLowerCase();
    if (typeof value === 'string') {
      map.set(key, value.trim());
      return;
    }
    if (Array.isArray(value)) {
      const joined = value.filter((item) => typeof item === 'string').join(', ').trim();
      if (joined) {
        map.set(key, joined);
      }
    }
  });

  return map;
};

const findSubmissionAnswerByKeyword = (
  normalizedMap: Map<string, string>,
  keywords: string[],
) => {
  for (const [label, answer] of normalizedMap.entries()) {
    if (!answer) continue;
    const isMatch = keywords.some((keyword) => label.includes(keyword));
    if (isMatch) {
      return answer;
    }
  }
  return '';
};

const buildFallbackMarketReport = (
  companyName: string,
  industry: string,
  oneLiner: string,
): MarketReportPayload => {
  const safeCompany = companyName || 'This company';
  const safeIndustry = industry || 'its target industry';
  const safeOneLiner = oneLiner || 'The business summary was not provided in detail.';

  return {
    title: `Why ${safeCompany} Represents a High-Value Investment Opportunity`,
    sections: DEFAULT_MARKET_REPORT_SECTION_TITLES.map((title) => ({
      title,
      subtitle: '',
      paragraphs: [
        `${safeCompany} is positioned in ${safeIndustry} with a proposition summarized as: "${safeOneLiner}".`,
        'This section is a fallback report. Add OPENAI_API_KEY to generate a deeper AI report tailored to this startup.',
      ],
      bullets: [
        'Clear product proposition',
        'Potential market tailwinds',
        'Scalable execution potential',
      ],
    })),
    conclusion: {
      title: 'Conclusion',
      paragraphs: [
        `${safeCompany} appears to have a promising opportunity in ${safeIndustry}, with upside dependent on execution and market timing.`,
      ],
      finalStatement:
        'This preliminary memorandum should be refined with deeper diligence inputs and additional company data.',
    },
    companyName: safeCompany,
    industry: safeIndustry,
    oneLiner: safeOneLiner,
    generatedAt: new Date().toISOString(),
  };
};

const normalizeMarketReport = (
  report: unknown,
  companyName: string,
  industry: string,
  oneLiner: string,
): MarketReportPayload => {
  if (typeof report !== 'object' || report === null) {
    return buildFallbackMarketReport(companyName, industry, oneLiner);
  }

  const record = report as Record<string, unknown>;
  const base = buildFallbackMarketReport(companyName, industry, oneLiner);
  const safeSections = Array.isArray(record.sections)
    ? record.sections
        .filter((item) => typeof item === 'object' && item !== null)
        .map((item, index) => {
          const section = item as Record<string, unknown>;
          const fallbackTitle = base.sections[index]?.title ?? `Section ${index + 1}`;
          return {
            title: typeof section.title === 'string' && section.title.trim() ? section.title : fallbackTitle,
            subtitle: typeof section.subtitle === 'string' ? section.subtitle : '',
            paragraphs: Array.isArray(section.paragraphs)
              ? section.paragraphs.filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
              : [],
            bullets: Array.isArray(section.bullets)
              ? section.bullets.filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
              : [],
          };
        })
        .slice(0, 14)
    : [];

  const sectionList = safeSections.length > 0 ? safeSections : base.sections;
  const conclusionRaw =
    typeof record.conclusion === 'object' && record.conclusion !== null
      ? (record.conclusion as Record<string, unknown>)
      : {};

  return {
    title:
      typeof record.title === 'string' && record.title.trim().length > 0
        ? record.title
        : base.title,
    sections: sectionList,
    conclusion: {
      title:
        typeof conclusionRaw.title === 'string' && conclusionRaw.title.trim().length > 0
          ? conclusionRaw.title
          : base.conclusion.title,
      paragraphs: Array.isArray(conclusionRaw.paragraphs)
        ? conclusionRaw.paragraphs.filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
        : base.conclusion.paragraphs,
      finalStatement:
        typeof conclusionRaw.finalStatement === 'string' && conclusionRaw.finalStatement.trim().length > 0
          ? conclusionRaw.finalStatement
          : base.conclusion.finalStatement,
    },
    companyName:
      typeof record.companyName === 'string' && record.companyName.trim().length > 0
        ? record.companyName
        : base.companyName,
    industry:
      typeof record.industry === 'string' && record.industry.trim().length > 0
        ? record.industry
        : base.industry,
    oneLiner:
      typeof record.oneLiner === 'string' && record.oneLiner.trim().length > 0
        ? record.oneLiner
        : base.oneLiner,
    generatedAt:
      typeof record.generatedAt === 'string' && record.generatedAt.trim().length > 0
        ? record.generatedAt
        : new Date().toISOString(),
  };
};

const generateMarketReportWithOpenAI = async ({
  companyName,
  industry,
  oneLiner,
  submissionData,
}: {
  companyName: string;
  industry: string;
  oneLiner: string;
  submissionData: unknown;
}): Promise<MarketReportPayload> => {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return buildFallbackMarketReport(companyName, industry, oneLiner);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'market_report',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                sections: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      title: { type: 'string' },
                      subtitle: { type: 'string' },
                      paragraphs: { type: 'array', items: { type: 'string' } },
                      bullets: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['title', 'subtitle', 'paragraphs', 'bullets'],
                  },
                },
                conclusion: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string' },
                    paragraphs: { type: 'array', items: { type: 'string' } },
                    finalStatement: { type: 'string' },
                  },
                  required: ['title', 'paragraphs', 'finalStatement'],
                },
                companyName: { type: 'string' },
                industry: { type: 'string' },
                oneLiner: { type: 'string' },
              },
              required: ['title', 'sections', 'conclusion', 'companyName', 'industry', 'oneLiner'],
            },
          },
        },
        messages: [
          {
            role: 'system',
            content:
              'You are an institutional VC analyst. Create a high-quality investment memorandum. Return valid JSON only. Use concrete, concise, investment-grade language.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task:
                'Generate a market and business potential report for this startup using exactly this structure: title, 10 numbered sections, and conclusion.',
              requiredSectionTitles: DEFAULT_MARKET_REPORT_SECTION_TITLES,
              formattingGuidance: {
                headingStyle: 'Large bold heading',
                subheadingStyle: 'Semibold subtitle',
              },
              startup: {
                companyName,
                industry,
                oneLiner,
              },
              submissionAnswers: submissionData,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[OPENAI MARKET REPORT] Non-OK response:', response.status, errorBody);
      return buildFallbackMarketReport(companyName, industry, oneLiner);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return buildFallbackMarketReport(companyName, industry, oneLiner);
    }

    const parsed = JSON.parse(content);
    return normalizeMarketReport(parsed, companyName, industry, oneLiner);
  } catch (error) {
    console.error('[OPENAI MARKET REPORT] Exception:', error);
    return buildFallbackMarketReport(companyName, industry, oneLiner);
  }
};

const persistSubmissionMarketReport = async (
  db: ReturnType<typeof getServiceClient>,
  submissionRowId: string,
  marketReport: MarketReportPayload,
) => {
  const candidateColumns = ['ai_market_report', 'aiMarketReport'];

  for (const columnName of candidateColumns) {
    const { error } = await db
      .from('submissions')
      .update({ [columnName]: marketReport })
      .eq('id', submissionRowId);

    if (!error) {
      return;
    }

    const message = error.message ?? '';
    if (message.includes('column') || message.includes('schema cache')) {
      continue;
    }

    throw error;
  }

  throw new Error('Market report column not found. Apply latest database migration.');
};

type FinalConclusionMode = 'pre_report' | 'with_report';

interface FinalConclusionPayload {
  title: string;
  mode: FinalConclusionMode;
  verdict: string;
  confidence: string;
  paragraphs: string[];
  recommendation: string;
  generatedAt: string;
}

interface FinalConclusionStore {
  pre_report?: FinalConclusionPayload;
  with_report?: FinalConclusionPayload;
}

const buildFallbackFinalConclusion = (
  mode: FinalConclusionMode,
  companyName: string,
): FinalConclusionPayload => {
  const withReport = mode === 'with_report';
  return {
    title: 'Final Conclusions',
    mode,
    verdict: withReport ? 'Consider with Caution' : 'Preliminary Positive Signal',
    confidence: withReport ? 'Medium' : 'Low',
    paragraphs: [
      `${companyName || 'This startup'} shows relevant potential based on the available application data and thesis fit signals.`,
      withReport
        ? 'After incorporating the market report, the opportunity appears investable subject to deeper commercial and execution diligence.'
        : 'This conclusion is based on submission-only inputs and should be treated as an initial screening signal.',
    ],
    recommendation: withReport
      ? 'Recommendation: Proceed to partner review with targeted diligence workstreams.'
      : 'Recommendation: Generate the Market Report for a more accurate conclusion before final investment prioritization.',
    generatedAt: new Date().toISOString(),
  };
};

const normalizeFinalConclusionPayload = (
  value: unknown,
  mode: FinalConclusionMode,
  companyName: string,
): FinalConclusionPayload => {
  if (typeof value !== 'object' || value === null) {
    return buildFallbackFinalConclusion(mode, companyName);
  }

  const record = value as Record<string, unknown>;
  const fallback = buildFallbackFinalConclusion(mode, companyName);

  return {
    title:
      typeof record.title === 'string' && record.title.trim().length > 0
        ? record.title
        : fallback.title,
    mode:
      record.mode === 'pre_report' || record.mode === 'with_report'
        ? record.mode
        : fallback.mode,
    verdict:
      typeof record.verdict === 'string' && record.verdict.trim().length > 0
        ? record.verdict
        : fallback.verdict,
    confidence:
      typeof record.confidence === 'string' && record.confidence.trim().length > 0
        ? record.confidence
        : fallback.confidence,
    paragraphs: Array.isArray(record.paragraphs)
      ? record.paragraphs.filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
      : fallback.paragraphs,
    recommendation:
      typeof record.recommendation === 'string' && record.recommendation.trim().length > 0
        ? record.recommendation
        : fallback.recommendation,
    generatedAt:
      typeof record.generatedAt === 'string' && record.generatedAt.trim().length > 0
        ? record.generatedAt
        : fallback.generatedAt,
  };
};

const normalizeFinalConclusionStore = (
  value: unknown,
  companyName: string,
): FinalConclusionStore => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const store: FinalConclusionStore = {};

  if (record.pre_report) {
    store.pre_report = normalizeFinalConclusionPayload(record.pre_report, 'pre_report', companyName);
  }
  if (record.with_report) {
    store.with_report = normalizeFinalConclusionPayload(record.with_report, 'with_report', companyName);
  }

  return store;
};

const persistSubmissionFinalConclusion = async (
  db: ReturnType<typeof getServiceClient>,
  submissionRowId: string,
  finalConclusionStore: FinalConclusionStore,
) => {
  const candidateColumns = ['ai_final_conclusion', 'aiFinalConclusion'];

  for (const columnName of candidateColumns) {
    const { error } = await db
      .from('submissions')
      .update({ [columnName]: finalConclusionStore })
      .eq('id', submissionRowId);

    if (!error) {
      return;
    }

    const message = error.message ?? '';
    if (message.includes('column') || message.includes('schema cache')) {
      continue;
    }

    throw error;
  }

  throw new Error('Final conclusion column not found. Apply latest database migration.');
};

const generateFinalConclusionWithOpenAI = async ({
  mode,
  companyName,
  industry,
  oneLiner,
  fitResults,
  fitSummary,
  marketReport,
  submissionData,
}: {
  mode: FinalConclusionMode;
  companyName: string;
  industry: string;
  oneLiner: string;
  fitResults: FitCriterionResult[];
  fitSummary: string;
  marketReport: MarketReportPayload | null;
  submissionData: unknown;
}): Promise<FinalConclusionPayload> => {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return buildFallbackFinalConclusion(mode, companyName);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'final_conclusion',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string' },
                mode: { type: 'string', enum: ['pre_report', 'with_report'] },
                verdict: { type: 'string' },
                confidence: { type: 'string' },
                paragraphs: { type: 'array', items: { type: 'string' } },
                recommendation: { type: 'string' },
              },
              required: ['title', 'mode', 'verdict', 'confidence', 'paragraphs', 'recommendation'],
            },
          },
        },
        messages: [
          {
            role: 'system',
            content:
              mode === 'pre_report'
                ? 'You are a VC investment committee reviewer. Provide a preliminary conclusion based only on startup submission answers and thesis fit. Always recommend generating the market report for improved accuracy.'
                : 'You are a VC investment committee reviewer. Provide a final conclusion using startup submission, thesis fit, and generated market report.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              mode,
              startup: {
                companyName,
                industry,
                oneLiner,
              },
              fitAssessment: {
                results: fitResults,
                summary: fitSummary,
              },
              marketReport,
              submissionAnswers: submissionData,
              guidance:
                mode === 'pre_report'
                  ? 'State that this is preliminary and explicitly advise generating market report for a more accurate conclusion.'
                  : 'Synthesize both fit assessment and market report into a decision-oriented recommendation.',
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[OPENAI FINAL CONCLUSION] Non-OK response:', response.status, errorBody);
      return buildFallbackFinalConclusion(mode, companyName);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return buildFallbackFinalConclusion(mode, companyName);
    }

    const parsed = JSON.parse(content);
    return normalizeFinalConclusionPayload(parsed, mode, companyName);
  } catch (error) {
    console.error('[OPENAI FINAL CONCLUSION] Exception:', error);
    return buildFallbackFinalConclusion(mode, companyName);
  }
};

interface SubmissionContext {
  form: Record<string, unknown>;
  submission: Record<string, unknown>;
  externalFormId: string;
  externalSubmissionId: string;
  companyName: string;
  startupEmail: string;
  industry: string;
  oneLiner: string;
}

const resolveOwnerSubmissionContext = async (
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  formId: string,
  submissionId: string,
): Promise<{ errorStatus?: number; errorMessage?: string; context?: SubmissionContext }> => {
  const form = await getFormByExternalId(db, formId);
  if (!form) {
    return { errorStatus: 404, errorMessage: 'Form not found' };
  }
  if (!isOwner(form, userId)) {
    return { errorStatus: 403, errorMessage: 'Forbidden' };
  }

  const submissions = await getSubmissionsForForm(db, form);
  const submission = submissions.find((row) => {
    const external = typeof row.external_submission_id === 'string' ? row.external_submission_id : '';
    const legacy = typeof row.submission_id === 'string' ? row.submission_id : '';
    const internal = String(row.id ?? '');
    return external === submissionId || legacy === submissionId || internal === submissionId;
  });

  if (!submission) {
    return { errorStatus: 404, errorMessage: 'Submission not found' };
  }

  const normalizedMap = normalizeSubmissionTextMap(submission.data);
  const companyName =
    findSubmissionAnswerByKeyword(normalizedMap, ['company name']) || 'This company';
  const startupEmail =
    findSubmissionAnswerByKeyword(normalizedMap, ['email']) || '';
  const industry =
    findSubmissionAnswerByKeyword(normalizedMap, ['industry', 'sector', 'vertical', 'market']) || 'General';
  const oneLiner =
    findSubmissionAnswerByKeyword(normalizedMap, [
      'one line',
      'one-liner',
      'one liner',
      'what your company does',
    ]) || '';

  const externalFormId =
    typeof form.external_form_id === 'string'
      ? form.external_form_id
      : typeof form.form_id === 'string'
        ? form.form_id
        : formId;

  const externalSubmissionId =
    typeof submission.external_submission_id === 'string'
      ? submission.external_submission_id
      : typeof submission.submission_id === 'string'
        ? submission.submission_id
        : String(submission.id ?? submissionId);

  return {
    context: {
      form,
      submission,
      externalFormId,
      externalSubmissionId,
      companyName,
      startupEmail,
      industry,
      oneLiner,
    },
  };
};

const upsertTableRowWithFallback = async (
  db: ReturnType<typeof getServiceClient>,
  table: string,
  payload: Record<string, unknown>,
) => {
  let candidatePayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await db
      .from(table)
      .upsert(candidatePayload)
      .select('*')
      .single();

    if (!error) {
      return data;
    }

    const missingColumn = extractMissingColumnName(error.message ?? '', table);
    if (missingColumn && Object.prototype.hasOwnProperty.call(candidatePayload, missingColumn)) {
      delete candidatePayload[missingColumn];
      continue;
    }

    throw error;
  }

  throw new Error(`Failed to upsert into ${table}`);
};

const buildEmailFallbackDraft = ({
  companyName,
  finalConclusion,
}: {
  companyName: string;
  finalConclusion: FinalConclusionPayload;
}) => {
  const verdictText = finalConclusion.verdict.toLowerCase();
  const isRejection = verdictText.includes('not') || verdictText.includes('reject');

  if (isRejection) {
    return {
      subject: `Update on your application to our VC process`,
      body: `Hi ${companyName} team,\n\nThank you for taking the time to apply and share your company with us.\n\nAfter reviewing your application, we have decided not to move forward at this stage. This decision reflects fit to our current investment focus rather than the overall quality of your work.\n\nWe appreciate your time and wish you continued success.\n\nBest,\nThe VC Team`,
      emailType: 'rejection',
    };
  }

  return {
    subject: `Next step for your application`,
    body: `Hi ${companyName} team,\n\nThank you for your application. We enjoyed reviewing your company and would like to invite you to the next stage of our process.\n\nCould you please share your availability for a call in the next few days?\n\nBest,\nThe VC Team`,
    emailType: 'next_stage',
  };
};

const generateApplicationEmailWithOpenAI = async ({
  companyName,
  finalConclusion,
}: {
  companyName: string;
  finalConclusion: FinalConclusionPayload;
}): Promise<{ subject: string; body: string; emailType: 'rejection' | 'next_stage' }> => {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return buildEmailFallbackDraft({ companyName, finalConclusion });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'application_email',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                subject: { type: 'string' },
                body: { type: 'string' },
                emailType: { type: 'string', enum: ['rejection', 'next_stage'] },
              },
              required: ['subject', 'body', 'emailType'],
            },
          },
        },
        messages: [
          {
            role: 'system',
            content:
              'Write concise, professional VC candidate emails. Choose rejection or next_stage based strictly on provided verdict.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              companyName,
              finalConclusion,
              instruction:
                'If verdict is negative, draft a rejection. If positive/neutral, draft an invite to next stage asking availability for a call.',
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[OPENAI EMAIL] Non-OK response:', response.status, errorBody);
      return buildEmailFallbackDraft({ companyName, finalConclusion });
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return buildEmailFallbackDraft({ companyName, finalConclusion });
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    const emailType = parsed.emailType === 'rejection' ? 'rejection' : 'next_stage';
    if (!subject || !body) {
      return buildEmailFallbackDraft({ companyName, finalConclusion });
    }

    return { subject, body, emailType };
  } catch (error) {
    console.error('[OPENAI EMAIL] Exception:', error);
    return buildEmailFallbackDraft({ companyName, finalConclusion });
  }
};

const sendEmailViaResend = async ({
  to,
  subject,
  body,
  replyTo,
}: {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}) => {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? '';
  if (!apiKey || !from) {
    return {
      success: false,
      error: 'Email provider is not configured. Set RESEND_API_KEY and EMAIL_FROM.',
      providerMessageId: null as string | null,
    };
  }

  const html = body
    .split('\n')
    .map((line) => line.trim())
    .join('<br />');

  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    html,
    text: body,
  };
  if (replyTo) {
    payload.reply_to = replyTo;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    return {
      success: false,
      error: typeof parsed.message === 'string' ? parsed.message : `Resend API error (${response.status})`,
      providerMessageId: null as string | null,
    };
  }

  return {
    success: true,
    error: null as string | null,
    providerMessageId: typeof parsed.id === 'string' ? parsed.id : null,
  };
};

// ========================================
// MAILBOX OAUTH HELPERS (Gmail / Outlook)
// ========================================

type MailboxProvider = 'google' | 'microsoft';

interface MailboxConnection {
  user_id: string;
  provider: MailboxProvider;
  mailbox_email: string;
  grant_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
  last_synced_at: string | null;
}

const getMailboxConfig = () => ({
  google: {
    clientId: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '',
  },
  microsoft: {
    clientId: Deno.env.get('MICROSOFT_OAUTH_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('MICROSOFT_OAUTH_CLIENT_SECRET') ?? '',
  },
  redirectUri: `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/make-server-26821bbd/communications/mailbox/callback`,
  stateSecret: Deno.env.get('MAILBOX_STATE_SECRET') ?? '',
  appBaseUrl: Deno.env.get('APP_BASE_URL') ?? '',
});

const mapMailboxProvider = (value: unknown): MailboxProvider =>
  value === 'microsoft' ? 'microsoft' : 'google';

const toBase64Url = (str: string) =>
  btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const fromBase64Url = (str: string) => {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return atob(b64);
};

const signMailboxState = async (payloadB64: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigBytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of sigBytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const buildMailboxState = async ({
  userId,
  provider,
  appBaseUrl,
  secret,
}: {
  userId: string;
  provider: MailboxProvider;
  appBaseUrl: string;
  secret: string;
}) => {
  const payload = {
    userId,
    provider,
    appBaseUrl,
    exp: Date.now() + 10 * 60 * 1000,
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = await signMailboxState(payloadB64, secret);
  return `${payloadB64}.${signature}`;
};

const parseMailboxState = async (state: string, secret: string) => {
  const [payloadB64, signature] = state.split('.');
  if (!payloadB64 || !signature) {
    throw new Error('Invalid state.');
  }
  const expected = await signMailboxState(payloadB64, secret);
  if (expected !== signature) {
    throw new Error('State signature mismatch.');
  }

  const payload = JSON.parse(fromBase64Url(payloadB64)) as {
    userId?: string;
    provider?: MailboxProvider;
    appBaseUrl?: string;
    exp?: number;
  };
  if (!payload.userId || !payload.provider || !payload.exp || payload.exp < Date.now()) {
    throw new Error('State expired or malformed.');
  }
  return payload as { userId: string; provider: MailboxProvider; appBaseUrl: string };
};

const getMailboxConnection = async (
  db: ReturnType<typeof getServiceClient>,
  userId: string,
): Promise<MailboxConnection | null> => {
  const { data, error } = await db
    .from('user_mailbox_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('relation') || msg.includes('schema cache')) {
      return null;
    }
    console.error('[MAILBOX CONNECTION] Error:', error);
    return null;
  }

  return data as MailboxConnection | null;
};

const upsertMailboxConnection = async (
  db: ReturnType<typeof getServiceClient>,
  data: Partial<MailboxConnection> & { user_id: string },
) => {
  const { error } = await db
    .from('user_mailbox_connections')
    .upsert(
      { ...data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[UPSERT MAILBOX CONNECTION] Error:', error);
    throw error;
  }
};

const refreshMailboxAccessToken = async (
  db: ReturnType<typeof getServiceClient>,
  connection: MailboxConnection,
): Promise<string> => {
  if (!connection.refresh_token) {
    throw new Error('No refresh token available.');
  }

  const config = getMailboxConfig();
  const providerConfig = connection.provider === 'microsoft' ? config.microsoft : config.google;

  const tokenUrl = connection.provider === 'microsoft'
    ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    : 'https://oauth2.googleapis.com/token';

  const params = new URLSearchParams({
    client_id: providerConfig.clientId,
    client_secret: providerConfig.clientSecret,
    refresh_token: connection.refresh_token,
    grant_type: 'refresh_token',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[REFRESH TOKEN] Error:', response.status, errorBody);
    throw new Error(`Token refresh failed (${response.status})`);
  }

  const tokenData = await response.json();
  const accessToken = tokenData.access_token as string;
  const expiresIn = typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 3600;
  const newRefreshToken = typeof tokenData.refresh_token === 'string'
    ? tokenData.refresh_token
    : connection.refresh_token;

  await upsertMailboxConnection(db, {
    user_id: connection.user_id,
    access_token: accessToken,
    refresh_token: newRefreshToken,
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  });

  return accessToken;
};

const getValidMailboxToken = async (
  db: ReturnType<typeof getServiceClient>,
  connection: MailboxConnection,
): Promise<string> => {
  if (
    connection.access_token &&
    connection.token_expires_at &&
    new Date(connection.token_expires_at).getTime() > Date.now() + 60_000
  ) {
    return connection.access_token;
  }
  return refreshMailboxAccessToken(db, connection);
};

const sendEmailViaGmail = async (
  accessToken: string,
  { to, subject, body, from }: { to: string; subject: string; body: string; from: string },
) => {
  const mimeMessage = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    body.split('\n').map((l) => l.trim()).join('<br />'),
  ].join('\r\n');

  const raw = toBase64Url(mimeMessage);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[GMAIL SEND] Error:', response.status, errorBody);
    return {
      success: false,
      error: `Gmail API error (${response.status})`,
      providerMessageId: null as string | null,
    };
  }

  const result = await response.json();
  return {
    success: true,
    error: null as string | null,
    providerMessageId: typeof result.id === 'string' ? result.id : null,
  };
};

const sendEmailViaMicrosoft = async (
  accessToken: string,
  { to, subject, body }: { to: string; subject: string; body: string },
) => {
  const html = body.split('\n').map((l) => l.trim()).join('<br />');

  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[MICROSOFT SEND] Error:', response.status, errorBody);
    return {
      success: false,
      error: `Microsoft Graph API error (${response.status})`,
      providerMessageId: null as string | null,
    };
  }

  return {
    success: true,
    error: null as string | null,
    providerMessageId: null as string | null,
  };
};

const sendEmailViaProvider = async ({
  db,
  userId,
  to,
  subject,
  body,
  replyTo,
}: {
  db: ReturnType<typeof getServiceClient>;
  userId: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<{ success: boolean; error: string | null; providerMessageId: string | null }> => {
  const connection = await getMailboxConnection(db, userId);

  if (connection && connection.status === 'connected' && connection.refresh_token) {
    try {
      const accessToken = await getValidMailboxToken(db, connection);

      if (connection.provider === 'microsoft') {
        return sendEmailViaMicrosoft(accessToken, { to, subject, body });
      }

      return sendEmailViaGmail(accessToken, {
        to,
        subject,
        body,
        from: connection.mailbox_email,
      });
    } catch (err) {
      console.error('[SEND VIA PROVIDER] OAuth send failed, falling back to Resend:', err);
    }
  }

  return sendEmailViaResend({ to, subject, body, replyTo });
};

const syncMailboxMessages = async (
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  connection: MailboxConnection,
) => {
  const accessToken = await getValidMailboxToken(db, connection);

  if (connection.provider === 'google') {
    const listResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=in:inbox',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!listResponse.ok) {
      console.error('[GMAIL SYNC] List error:', listResponse.status);
      return;
    }

    const listData = await listResponse.json();
    const messageRefs = Array.isArray(listData.messages) ? listData.messages : [];

    for (const ref of messageRefs.slice(0, 20)) {
      const msgId = typeof ref.id === 'string' ? ref.id : '';
      if (!msgId) continue;

      const { data: existingRow } = await db
        .from('application_emails')
        .select('id')
        .eq('provider_message_id', msgId)
        .eq('owner_user_id', userId)
        .maybeSingle();

      if (existingRow) continue;

      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!msgResponse.ok) continue;

      const msgData = await msgResponse.json();
      const headers = Array.isArray(msgData.payload?.headers) ? msgData.payload.headers : [];
      const getHeader = (name: string) => {
        const h = headers.find((hdr: { name: string; value: string }) =>
          hdr.name.toLowerCase() === name.toLowerCase(),
        );
        return h ? String(h.value) : '';
      };

      const fromHeader = getHeader('From');
      const toHeader = getHeader('To');
      const subjectHeader = getHeader('Subject');
      const dateHeader = getHeader('Date');
      const threadIdHeader = msgData.threadId ?? '';

      let bodyText = '';
      const extractBody = (part: Record<string, unknown>): string => {
        if (part.mimeType === 'text/plain' && typeof part.body === 'object' && part.body !== null) {
          const bodyObj = part.body as Record<string, unknown>;
          if (typeof bodyObj.data === 'string') {
            try {
              return fromBase64Url(bodyObj.data);
            } catch {
              return '';
            }
          }
        }
        if (Array.isArray(part.parts)) {
          for (const sub of part.parts) {
            const text = extractBody(sub as Record<string, unknown>);
            if (text) return text;
          }
        }
        return '';
      };
      bodyText = extractBody(msgData.payload ?? {});

      const fromEmail = fromHeader.match(/<([^>]+)>/)?.[1] ?? fromHeader;
      const isInbound = fromEmail.toLowerCase() !== connection.mailbox_email.toLowerCase();

      await insertRowWithFallback(db, 'application_emails', {
        owner_user_id: userId,
        thread_id: `gmail_${threadIdHeader}`,
        startup_email: isInbound ? fromEmail : toHeader.match(/<([^>]+)>/)?.[1] ?? toHeader,
        vc_email: connection.mailbox_email,
        direction: isInbound ? 'inbound' : 'outbound',
        subject: subjectHeader,
        body: bodyText,
        provider_status: isInbound ? 'received' : 'sent',
        provider_message_id: msgId,
        created_at: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
      });
    }
  } else if (connection.provider === 'microsoft') {
    const listResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages?$top=20&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,body,receivedDateTime,conversationId',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!listResponse.ok) {
      console.error('[MICROSOFT SYNC] List error:', listResponse.status);
      return;
    }

    const listData = await listResponse.json();
    const messages = Array.isArray(listData.value) ? listData.value : [];

    for (const msg of messages) {
      const msgId = typeof msg.id === 'string' ? msg.id : '';
      if (!msgId) continue;

      const { data: existingRow } = await db
        .from('application_emails')
        .select('id')
        .eq('provider_message_id', msgId)
        .eq('owner_user_id', userId)
        .maybeSingle();

      if (existingRow) continue;

      const fromEmail = msg.from?.emailAddress?.address ?? '';
      const toEmail = msg.toRecipients?.[0]?.emailAddress?.address ?? '';
      const subjectText = typeof msg.subject === 'string' ? msg.subject : '';
      const bodyContent = msg.body?.content ?? '';
      const conversationId = typeof msg.conversationId === 'string' ? msg.conversationId : '';
      const receivedAt = typeof msg.receivedDateTime === 'string' ? msg.receivedDateTime : new Date().toISOString();

      const isInbound = fromEmail.toLowerCase() !== connection.mailbox_email.toLowerCase();

      await insertRowWithFallback(db, 'application_emails', {
        owner_user_id: userId,
        thread_id: `msft_${conversationId}`,
        startup_email: isInbound ? fromEmail : toEmail,
        vc_email: connection.mailbox_email,
        direction: isInbound ? 'inbound' : 'outbound',
        subject: subjectText,
        body: bodyContent,
        provider_status: isInbound ? 'received' : 'sent',
        provider_message_id: msgId,
        created_at: receivedAt,
      });
    }
  }

  await upsertMailboxConnection(db, {
    user_id: userId,
    last_synced_at: new Date().toISOString(),
  });
};

const base64UrlEncode = (value: string | Uint8Array) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const importPrivateKeyFromPem = async (pem: string) => {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(body);
  const keyBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );
};

const getGoogleCalendarAccessToken = async () => {
  const rawServiceAccount = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!rawServiceAccount) {
    return { success: false, error: 'Google Calendar is not configured.' } as const;
  }

  let serviceAccount: {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch {
    return { success: false, error: 'Invalid GOOGLE_SERVICE_ACCOUNT_JSON secret.' } as const;
  }

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    return { success: false, error: 'Google service account is missing client_email/private_key.' } as const;
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token';
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const privateKey = await importPrivateKeyFromPem(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenResponse = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const tokenText = await tokenResponse.text();
  let tokenData: Record<string, unknown> = {};
  try {
    tokenData = tokenText ? (JSON.parse(tokenText) as Record<string, unknown>) : {};
  } catch {
    tokenData = {};
  }

  if (!tokenResponse.ok || typeof tokenData.access_token !== 'string') {
    return {
      success: false,
      error:
        typeof tokenData.error_description === 'string'
          ? tokenData.error_description
          : `Failed to obtain Google access token (${tokenResponse.status}).`,
    } as const;
  }

  return { success: true, accessToken: tokenData.access_token } as const;
};

const scheduleGoogleMeetEvent = async ({
  summary,
  description,
  startupEmail,
  vcEmail,
  startDateTime,
  endDateTime,
  timeZone,
  userAccessToken,
}: {
  summary: string;
  description: string;
  startupEmail: string;
  vcEmail: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
  userAccessToken?: string;
}) => {
  let accessToken: string;

  if (userAccessToken) {
    accessToken = userAccessToken;
  } else {
    const tokenResult = await getGoogleCalendarAccessToken();
    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error, meetLink: '', eventId: '' };
    }
    accessToken = tokenResult.accessToken;
  }

  const calendarId = userAccessToken ? 'primary' : encodeURIComponent(Deno.env.get('GOOGLE_CALENDAR_ID') ?? 'primary');
  const createEventResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: startDateTime, timeZone },
        end: { dateTime: endDateTime, timeZone },
        attendees: [{ email: startupEmail }, { email: vcEmail }],
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  );

  const eventText = await createEventResponse.text();
  let eventData: Record<string, unknown> = {};
  try {
    eventData = eventText ? (JSON.parse(eventText) as Record<string, unknown>) : {};
  } catch {
    eventData = {};
  }

  if (!createEventResponse.ok) {
    return {
      success: false,
      error:
        typeof eventData.error === 'object'
          ? String((eventData.error as Record<string, unknown>).message ?? 'Google Calendar error')
          : `Failed to create Google Meet call (${createEventResponse.status}).`,
      meetLink: '',
      eventId: '',
    };
  }

  const meetLink =
    typeof eventData.hangoutLink === 'string'
      ? eventData.hangoutLink
      : Array.isArray((eventData.conferenceData as Record<string, unknown> | undefined)?.entryPoints)
        ? String(
            (
              (eventData.conferenceData as Record<string, unknown>).entryPoints as Record<string, unknown>[]
            ).find((entry) => entry.entryPointType === 'video')?.uri ?? '',
          )
        : '';

  return {
    success: true,
    error: '',
    meetLink,
    eventId: typeof eventData.id === 'string' ? eventData.id : '',
  };
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getLinkedVcEmail = async (
  db: ReturnType<typeof getServiceClient>,
  user: { id: string; email?: string | null },
) => {
  const fallbackEmail = typeof user.email === 'string' ? user.email : '';

  const linked = await db
    .from('vc_email_accounts')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (linked.error) {
    const message = linked.error.message ?? '';
    if (!message.includes('column') && !message.includes('schema cache') && !message.includes('relation')) {
      throw linked.error;
    }
    return { email: fallbackEmail, displayName: '', linked: false };
  }

  const linkedEmail =
    linked.data && typeof linked.data.linked_email === 'string'
      ? linked.data.linked_email.trim()
      : '';
  const displayName =
    linked.data && typeof linked.data.display_name === 'string'
      ? linked.data.display_name
      : '';

  if (linkedEmail) {
    return { email: linkedEmail, displayName, linked: true };
  }

  return { email: fallbackEmail, displayName, linked: false };
};

const extractMissingColumnName = (message: string, table: string) => {
  const relationRegex = new RegExp(`column "([^"]+)" of relation "${table}" does not exist`);
  const relationMatch = message.match(relationRegex);
  if (relationMatch?.[1]) {
    return relationMatch[1];
  }

  const schemaCacheRegex = new RegExp(`Could not find the '([^']+)' column of '${table}' in the schema cache`);
  const schemaCacheMatch = message.match(schemaCacheRegex);
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  return null;
};

const insertRowWithFallback = async (
  db: ReturnType<typeof getServiceClient>,
  table: string,
  payload: Record<string, unknown>,
) => {
  let candidatePayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await db.from(table).insert(candidatePayload).select('*').single();
    if (!error) {
      return data;
    }

    const missingColumn = extractMissingColumnName(error.message ?? '', table);
    if (missingColumn && Object.prototype.hasOwnProperty.call(candidatePayload, missingColumn)) {
      delete candidatePayload[missingColumn];
      continue;
    }

    throw error;
  }

  throw new Error(`Failed to insert into ${table}`);
};

const upsertRowWithFallback = async (
  db: ReturnType<typeof getServiceClient>,
  table: string,
  payload: Record<string, unknown>,
  onConflict: string,
) => {
  let candidatePayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await db
      .from(table)
      .upsert(candidatePayload, { onConflict })
      .select('*')
      .single();

    if (!error) {
      return data;
    }

    const missingColumn = extractMissingColumnName(error.message ?? '', table);
    if (missingColumn && Object.prototype.hasOwnProperty.call(candidatePayload, missingColumn)) {
      delete candidatePayload[missingColumn];
      continue;
    }

    throw error;
  }

  throw new Error(`Failed to upsert ${table}`);
};

const normalizeFormStatus = (form: Record<string, unknown>) => {
  if (typeof form.status === 'string') {
    return form.status;
  }

  if (form.is_published === false) {
    return 'inactive';
  }

  return 'active';
};

const normalizeFormQuestions = (form: Record<string, unknown>) => {
  if (Array.isArray(form.questions)) {
    return form.questions;
  }

  if (Array.isArray(form.schema)) {
    return form.schema;
  }

  return [];
};

const mapFormResponse = (form: Record<string, unknown>) => {
  const formId =
    typeof form.external_form_id === 'string'
      ? form.external_form_id
      : typeof form.form_id === 'string'
        ? form.form_id
        : String(form.id ?? '');

  return {
    formId,
    formName:
      typeof form.form_name === 'string'
        ? form.form_name
        : typeof form.name === 'string'
          ? form.name
          : 'Application Form',
    questions: normalizeFormQuestions(form),
    thesis: (form.thesis as Record<string, unknown> | null) ?? {},
    status: normalizeFormStatus(form),
    publishedAt:
      typeof form.published_at === 'string'
        ? form.published_at
        : typeof form.created_at === 'string'
          ? form.created_at
          : new Date().toISOString(),
    updatedAt:
      typeof form.updated_at === 'string'
        ? form.updated_at
        : typeof form.created_at === 'string'
          ? form.created_at
          : new Date().toISOString(),
    userId:
      typeof form.owner_user_id === 'string'
        ? form.owner_user_id
        : typeof form.user_id === 'string'
          ? form.user_id
          : null,
  };
};

const isOwner = (form: Record<string, unknown>, userId: string) =>
  form.owner_user_id === userId || form.user_id === userId;

const getFormByExternalId = async (
  db: ReturnType<typeof getServiceClient>,
  externalFormId: string,
) => {
  const primary = await db.from('forms').select('*').eq('external_form_id', externalFormId).maybeSingle();
  if (primary.error) {
    throw primary.error;
  }
  if (primary.data) {
    return primary.data as Record<string, unknown>;
  }

  // Fallback for legacy schemas that only persisted form_id.
  const fallback = await db.from('forms').select('*').eq('form_id', externalFormId).maybeSingle();
  if (fallback.error) {
    const message = fallback.error.message ?? '';
    if (message.includes('column') || message.includes('schema cache')) {
      return null;
    }
    throw fallback.error;
  }

  return (fallback.data as Record<string, unknown>) ?? null;
};

const getSubmissionsForForm = async (
  db: ReturnType<typeof getServiceClient>,
  form: Record<string, unknown>,
) => {
  const internalFormId = String(form.id ?? '');
  const externalFormId =
    typeof form.external_form_id === 'string'
      ? form.external_form_id
      : typeof form.form_id === 'string'
        ? form.form_id
        : internalFormId;

  const primary = await db
    .from('submissions')
    .select('*')
    .eq('form_id', internalFormId)
    .order('submitted_at', { ascending: false });

  if (primary.error) {
    throw primary.error;
  }

  if ((primary.data ?? []).length > 0) {
    return (primary.data as Record<string, unknown>[]).map((row) => ({
      ...row,
      _external_form_id: externalFormId,
    }));
  }

  const fallback = await db
    .from('submissions')
    .select('*')
    .eq('form_id', externalFormId)
    .order('submitted_at', { ascending: false });

  if (fallback.error) {
    const message = fallback.error.message ?? '';
    if (message.includes('invalid input syntax for type uuid')) {
      return [];
    }
    throw fallback.error;
  }

  return (fallback.data as Record<string, unknown>[]).map((row) => ({
    ...row,
    _external_form_id: externalFormId,
  }));
};

const mapSubmissionResponse = (submission: Record<string, unknown>, externalFormId: string) => ({
  submissionId:
    typeof submission.external_submission_id === 'string'
      ? submission.external_submission_id
      : typeof submission.submission_id === 'string'
        ? submission.submission_id
        : String(submission.id ?? crypto.randomUUID()),
  formId: externalFormId,
  data:
    typeof submission.data === 'object' && submission.data !== null
      ? submission.data
      : {},
  isHighValue:
    typeof submission.is_high_value === 'boolean'
      ? submission.is_high_value
      : typeof submission.is_high_level === 'boolean'
        ? submission.is_high_level
        : true,
  isHighLevel:
    typeof submission.is_high_level === 'boolean'
      ? submission.is_high_level
      : typeof submission.is_high_value === 'boolean'
        ? submission.is_high_value
        : true,
  submittedAt:
    typeof submission.submitted_at === 'string'
      ? submission.submitted_at
      : typeof submission.created_at === 'string'
        ? submission.created_at
        : new Date().toISOString(),
});

const getFormsForUser = async (
  db: ReturnType<typeof getServiceClient>,
  userId: string,
) => {
  const forms: Record<string, unknown>[] = [];

  const byOwner = await db
    .from('forms')
    .select('*')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false });

  if (byOwner.error) {
    const message = byOwner.error.message ?? '';
    if (!message.includes('column') && !message.includes('schema cache')) {
      throw byOwner.error;
    }
  } else {
    forms.push(...((byOwner.data as Record<string, unknown>[]) ?? []));
  }

  const byUser = await db
    .from('forms')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (byUser.error) {
    const message = byUser.error.message ?? '';
    if (!message.includes('column') && !message.includes('schema cache')) {
      throw byUser.error;
    }
  } else {
    forms.push(...((byUser.data as Record<string, unknown>[]) ?? []));
  }

  const deduped = Array.from(
    new Map(forms.map((form) => [String(form.id ?? form.external_form_id ?? form.form_id), form])).values(),
  );

  deduped.sort((a, b) => {
    const aDate = new Date(String(a.updated_at ?? a.created_at ?? 0)).getTime();
    const bDate = new Date(String(b.updated_at ?? b.created_at ?? 0)).getTime();
    return bDate - aDate;
  });

  return deduped;
};

const getFavoriteExternalSubmissionIds = async (
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  form: Record<string, unknown>,
) => {
  const isUuidLike = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const externalFormId =
    typeof form.external_form_id === 'string'
      ? form.external_form_id
      : typeof form.form_id === 'string'
        ? form.form_id
        : String(form.id ?? '');

  const internalFormId = String(form.id ?? '');

  const { data: favoriteRows, error: favoriteError } = await db
    .from('submission_favorites')
    .select('submission_id')
    .eq('user_id', userId);

  if (favoriteError) {
    throw favoriteError;
  }

  const submissionIds = (favoriteRows ?? [])
    .map((row) => String(row.submission_id ?? '').trim())
    .filter((value) => value.length > 0);

  if (submissionIds.length === 0) {
    return [];
  }

  const collectedRows: Record<string, unknown>[] = [];
  const seenRowKeys = new Set<string>();

  const appendRows = (rows: Record<string, unknown>[] | null) => {
    (rows ?? []).forEach((row) => {
      const rowKey = String(row.id ?? row.external_submission_id ?? row.submission_id ?? crypto.randomUUID());
      if (!seenRowKeys.has(rowKey)) {
        seenRowKeys.add(rowKey);
        collectedRows.push(row);
      }
    });
  };

  const idValues = submissionIds.filter(isUuidLike);
  if (idValues.length > 0) {
    const { data: byInternalId, error: byInternalIdError } = await db
      .from('submissions')
      .select('id, external_submission_id, form_id')
      .in('id', idValues);

    if (byInternalIdError) {
      throw byInternalIdError;
    }

    appendRows((byInternalId as Record<string, unknown>[]) ?? null);
  }

  const byExternalId = await db
    .from('submissions')
    .select('id, external_submission_id, form_id')
    .in('external_submission_id', submissionIds);

  if (!byExternalId.error) {
    appendRows((byExternalId.data as Record<string, unknown>[]) ?? null);
  } else {
    const message = byExternalId.error.message ?? '';
    if (!message.includes('column') && !message.includes('schema cache')) {
      throw byExternalId.error;
    }
  }

  const queryLegacyIds = async (values: string[]) =>
    db
      .from('submissions')
      .select('id, external_submission_id, submission_id, form_id')
      .in('submission_id', values);

  let byLegacyId = await queryLegacyIds(submissionIds);
  if (byLegacyId.error) {
    const message = byLegacyId.error.message ?? '';
    if (message.includes('invalid input syntax for type uuid')) {
      const legacyUuidValues = submissionIds.filter(isUuidLike);
      if (legacyUuidValues.length > 0) {
        byLegacyId = await queryLegacyIds(legacyUuidValues);
      } else {
        byLegacyId = { data: [], error: null };
      }
    }
  }

  if (!byLegacyId.error) {
    appendRows((byLegacyId.data as Record<string, unknown>[]) ?? null);
  } else {
    const message = byLegacyId.error.message ?? '';
    if (!message.includes('column') && !message.includes('schema cache')) {
      throw byLegacyId.error;
    }
  }

  return collectedRows
    .filter((row) => {
      const formId = String(row.form_id ?? '');
      return formId === internalFormId || formId === externalFormId;
    })
    .map((row) => {
      if (typeof row.external_submission_id === 'string' && row.external_submission_id.length > 0) {
        return row.external_submission_id;
      }
      if (typeof row.submission_id === 'string' && row.submission_id.length > 0) {
        return row.submission_id;
      }
      return String(row.id);
    });
};

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-user-jwt"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-26821bbd/health", (c) => {
  return c.json({ status: "ok" });
});

// ========================================
// AUTH ROUTES
// ========================================

// Save VC thesis criteria - REQUIRES AUTH
app.post("/make-server-26821bbd/criteria/save", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const { thesis } = await c.req.json();
    const nowIso = new Date().toISOString();
    const db = getServiceClient();

    await upsertRowWithFallback(
      db,
      'vc_criteria',
      {
        user_id: user.id,
        thesis: thesis ?? {},
        updated_at: nowIso,
        created_at: nowIso,
      },
      'user_id',
    );

    return c.json({ success: true });
  } catch (error) {
    console.error('[SAVE CRITERIA] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get VC thesis criteria - REQUIRES AUTH
app.get("/make-server-26821bbd/criteria", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from('vc_criteria')
      .select('thesis')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    return c.json({ success: true, thesis: data?.thesis ?? null });
  } catch (error) {
    console.error('[GET CRITERIA] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Sign up - creates a new user
app.post("/make-server-26821bbd/auth/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password are required' }, 400);
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || '' },
      email_confirm: true,
    });

    if (error) {
      console.error('[SIGNUP] Error creating user:', error);
      return c.json({ success: false, error: error.message }, 400);
    }

    return c.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: name || '',
      },
    });
  } catch (error) {
    console.error('[SIGNUP] Exception:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Publish or update one form for authenticated VC.
app.post("/make-server-26821bbd/forms/publish", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const { oldFormId, formName, questions, thesis } = await c.req.json();
    const db = getServiceClient();
    const nowIso = new Date().toISOString();
    const safeQuestions = Array.isArray(questions) ? questions : [];
    const safeThesis = typeof thesis === 'object' && thesis !== null ? thesis : {};

    const userForms = await getFormsForUser(db, user.id);
    const currentPrimaryForm = userForms[0] ?? null;

    let targetExternalFormId: string | null = null;
    let existingTargetForm: Record<string, unknown> | null = null;

    if (typeof oldFormId === 'string' && oldFormId.trim().length > 0) {
      const requestedForm = await getFormByExternalId(db, oldFormId);
      if (requestedForm && isOwner(requestedForm, user.id)) {
        targetExternalFormId = oldFormId;
        existingTargetForm = requestedForm;
      }
    }

    if (!targetExternalFormId && currentPrimaryForm) {
      targetExternalFormId = String(
        currentPrimaryForm.external_form_id ?? currentPrimaryForm.form_id ?? '',
      );
      existingTargetForm = currentPrimaryForm;
    }

    if (!targetExternalFormId) {
      targetExternalFormId = `fs_${crypto.randomUUID()}`;
    }

    const publishedAt =
      typeof existingTargetForm?.published_at === 'string'
        ? existingTargetForm.published_at
        : nowIso;

    await upsertRowWithFallback(
      db,
      'forms',
      {
        external_form_id: targetExternalFormId,
        form_id: targetExternalFormId,
        owner_user_id: user.id,
        user_id: user.id,
        form_name: formName || 'Application Form',
        name: formName || 'Application Form',
        questions: safeQuestions,
        schema: safeQuestions,
        thesis: safeThesis,
        status: 'active',
        is_published: true,
        published_at: publishedAt,
        updated_at: nowIso,
        created_at:
          typeof existingTargetForm?.created_at === 'string'
            ? existingTargetForm.created_at
            : nowIso,
      },
      'external_form_id',
    );

    const isUpdate = Boolean(existingTargetForm);
    return c.json({
      success: true,
      formId: targetExternalFormId,
      message: isUpdate ? 'Form updated successfully' : 'Form published successfully',
    });
  } catch (error) {
    console.error('[PUBLISH] Error publishing form:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get a published form by ID
app.get("/make-server-26821bbd/forms/:formId", async (c) => {
  try {
    const formId = c.req.param('formId');
    const db = getServiceClient();
    const form = await getFormByExternalId(db, formId);
    const user = await getUserFromRequest(c);

    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }

    if (normalizeFormStatus(form) === 'inactive' && (!user || !isOwner(form, user.id))) {
      return c.json({
        success: false,
        error: 'This form link has been replaced. Please contact the VC for the latest link.',
      }, 410);
    }

    return c.json({ success: true, form: mapFormResponse(form) });
  } catch (error) {
    console.error('[GET FORM] Error fetching form:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Submit a form response
app.post("/make-server-26821bbd/forms/:formId/submit", async (c) => {
  try {
    const formId = c.req.param('formId');
    const { data } = await c.req.json();
    const sanitizedData = typeof data === 'object' && data !== null ? data : {};
    const db = getServiceClient();

    const form = await getFormByExternalId(db, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (normalizeFormStatus(form) === 'inactive') {
      return c.json({ success: false, error: 'This form is no longer accepting submissions' }, 410);
    }

    const submissionId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await insertRowWithFallback(db, 'submissions', {
      external_submission_id: submissionId,
      submission_id: submissionId,
      form_id: String(form.id ?? formId),
      data: sanitizedData,
      is_high_value: true,
      submitted_at: nowIso,
      created_at: nowIso,
    });

    return c.json({ success: true, submissionId });
  } catch (error) {
    console.error('[SUBMIT] Error submitting form:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get all submissions for a form
app.get("/make-server-26821bbd/forms/:formId/submissions", async (c) => {
  try {
    const formId = c.req.param('formId');
    const db = getServiceClient();
    const form = await getFormByExternalId(db, formId);

    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }

    const submissions = await getSubmissionsForForm(db, form);
    const externalFormId =
      typeof form.external_form_id === 'string'
        ? form.external_form_id
        : formId;

    const mapped = submissions
      .map((submission) => mapSubmissionResponse(submission, externalFormId))
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    return c.json({ success: true, submissions: mapped });
  } catch (error) {
    console.error('[GET SUBMISSIONS] Error fetching submissions:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Evaluate submission fit against saved VC thesis criteria - REQUIRES AUTH
app.post("/make-server-26821bbd/forms/:formId/submissions/:submissionId/evaluate-fit", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const formId = c.req.param('formId');
    const submissionId = c.req.param('submissionId');
    const db = getServiceClient();

    const form = await getFormByExternalId(db, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (!isOwner(form, user.id)) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }

    const submissions = await getSubmissionsForForm(db, form);
    const submission = submissions.find((row) => {
      const external = typeof row.external_submission_id === 'string' ? row.external_submission_id : '';
      const legacy = typeof row.submission_id === 'string' ? row.submission_id : '';
      const internal = String(row.id ?? '');
      return external === submissionId || legacy === submissionId || internal === submissionId;
    });

    if (!submission) {
      return c.json({ success: false, error: 'Submission not found' }, 404);
    }

    const cachedEvaluation =
      (submission.ai_fit_evaluation as Record<string, unknown> | null) ??
      (submission.aiFitEvaluation as Record<string, unknown> | null);

    if (
      cachedEvaluation &&
      Array.isArray(cachedEvaluation.results) &&
      typeof cachedEvaluation.summary === 'string'
    ) {
      return c.json({
        success: true,
        results: normalizeFitResults(cachedEvaluation.results),
        summary: cachedEvaluation.summary || DEFAULT_FIT_SUMMARY,
        score: '8.5/10',
        cached: true,
      });
    }

    const { data: criteriaRow } = await db
      .from('vc_criteria')
      .select('thesis')
      .eq('user_id', user.id)
      .maybeSingle();

    const criteria = criteriaRow?.thesis ?? form.thesis ?? {};
    const submissionData = submission.data ?? {};
    const questions = normalizeFormQuestions(form);

    const evaluation = await evaluateFitWithOpenAI(criteria, submissionData, questions);

    if (submission.id) {
      await db
        .from('submissions')
        .update({
          ai_fit_evaluation: {
            results: evaluation.results,
            summary: evaluation.summary,
            generatedAt: new Date().toISOString(),
          },
        })
        .eq('id', submission.id);
    }

    return c.json({
      success: true,
      results: evaluation.results,
      summary: evaluation.summary,
      score: '8.5/10',
      cached: false,
    });
  } catch (error) {
    console.error('[EVALUATE FIT] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get cached market report for an application submission - REQUIRES AUTH
app.get("/make-server-26821bbd/forms/:formId/submissions/:submissionId/market-report", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const formId = c.req.param('formId');
    const submissionId = c.req.param('submissionId');
    const db = getServiceClient();

    const form = await getFormByExternalId(db, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (!isOwner(form, user.id)) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }

    const submissions = await getSubmissionsForForm(db, form);
    const submission = submissions.find((row) => {
      const external = typeof row.external_submission_id === 'string' ? row.external_submission_id : '';
      const legacy = typeof row.submission_id === 'string' ? row.submission_id : '';
      const internal = String(row.id ?? '');
      return external === submissionId || legacy === submissionId || internal === submissionId;
    });

    if (!submission) {
      return c.json({ success: false, error: 'Submission not found' }, 404);
    }

    const normalizedMap = normalizeSubmissionTextMap(submission.data);
    const companyName =
      findSubmissionAnswerByKeyword(normalizedMap, ['company name']) || 'This company';
    const industry =
      findSubmissionAnswerByKeyword(normalizedMap, ['industry', 'sector', 'vertical', 'market']) || 'General';
    const oneLiner =
      findSubmissionAnswerByKeyword(normalizedMap, [
        'one line',
        'one-liner',
        'one liner',
        'what your company does',
      ]) || '';

    const cachedRaw =
      (submission.ai_market_report as Record<string, unknown> | null) ??
      (submission.aiMarketReport as Record<string, unknown> | null);

    if (!cachedRaw) {
      return c.json({ success: true, report: null, cached: false });
    }

    const report = normalizeMarketReport(cachedRaw, companyName, industry, oneLiner);
    return c.json({ success: true, report, cached: true });
  } catch (error) {
    console.error('[GET MARKET REPORT] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Generate market report for an application submission (cached after first run) - REQUIRES AUTH
app.post("/make-server-26821bbd/forms/:formId/submissions/:submissionId/market-report/generate", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const formId = c.req.param('formId');
    const submissionId = c.req.param('submissionId');
    const db = getServiceClient();

    const form = await getFormByExternalId(db, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (!isOwner(form, user.id)) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }

    const submissions = await getSubmissionsForForm(db, form);
    const submission = submissions.find((row) => {
      const external = typeof row.external_submission_id === 'string' ? row.external_submission_id : '';
      const legacy = typeof row.submission_id === 'string' ? row.submission_id : '';
      const internal = String(row.id ?? '');
      return external === submissionId || legacy === submissionId || internal === submissionId;
    });

    if (!submission) {
      return c.json({ success: false, error: 'Submission not found' }, 404);
    }

    const normalizedMap = normalizeSubmissionTextMap(submission.data);
    const companyName =
      findSubmissionAnswerByKeyword(normalizedMap, ['company name']) || 'This company';
    const industry =
      findSubmissionAnswerByKeyword(normalizedMap, ['industry', 'sector', 'vertical', 'market']) || 'General';
    const oneLiner =
      findSubmissionAnswerByKeyword(normalizedMap, [
        'one line',
        'one-liner',
        'one liner',
        'what your company does',
      ]) || '';

    const cachedRaw =
      (submission.ai_market_report as Record<string, unknown> | null) ??
      (submission.aiMarketReport as Record<string, unknown> | null);

    if (cachedRaw) {
      const report = normalizeMarketReport(cachedRaw, companyName, industry, oneLiner);
      return c.json({ success: true, report, cached: true });
    }

    const report = await generateMarketReportWithOpenAI({
      companyName,
      industry,
      oneLiner,
      submissionData: submission.data ?? {},
    });

    if (!submission.id || typeof submission.id !== 'string') {
      return c.json({ success: true, report, cached: false });
    }

    await persistSubmissionMarketReport(db, submission.id, report);

    return c.json({ success: true, report, cached: false });
  } catch (error) {
    console.error('[GENERATE MARKET REPORT] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Generate or fetch cached final investment conclusion - REQUIRES AUTH
app.post("/make-server-26821bbd/forms/:formId/submissions/:submissionId/final-conclusion/generate", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const formId = c.req.param('formId');
    const submissionId = c.req.param('submissionId');
    const db = getServiceClient();

    const form = await getFormByExternalId(db, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (!isOwner(form, user.id)) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }

    const submissions = await getSubmissionsForForm(db, form);
    const submission = submissions.find((row) => {
      const external = typeof row.external_submission_id === 'string' ? row.external_submission_id : '';
      const legacy = typeof row.submission_id === 'string' ? row.submission_id : '';
      const internal = String(row.id ?? '');
      return external === submissionId || legacy === submissionId || internal === submissionId;
    });

    if (!submission) {
      return c.json({ success: false, error: 'Submission not found' }, 404);
    }

    const normalizedMap = normalizeSubmissionTextMap(submission.data);
    const companyName =
      findSubmissionAnswerByKeyword(normalizedMap, ['company name']) || 'This company';
    const industry =
      findSubmissionAnswerByKeyword(normalizedMap, ['industry', 'sector', 'vertical', 'market']) || 'General';
    const oneLiner =
      findSubmissionAnswerByKeyword(normalizedMap, [
        'one line',
        'one-liner',
        'one liner',
        'what your company does',
      ]) || '';

    const marketReportRaw =
      (submission.ai_market_report as Record<string, unknown> | null) ??
      (submission.aiMarketReport as Record<string, unknown> | null);
    const marketReport = marketReportRaw
      ? normalizeMarketReport(marketReportRaw, companyName, industry, oneLiner)
      : null;

    const mode: FinalConclusionMode = marketReport ? 'with_report' : 'pre_report';
    const existingStore = normalizeFinalConclusionStore(
      (submission.ai_final_conclusion as Record<string, unknown> | null) ??
        (submission.aiFinalConclusion as Record<string, unknown> | null),
      companyName,
    );
    const cachedConclusion = existingStore[mode];

    if (cachedConclusion) {
      return c.json({ success: true, conclusion: cachedConclusion, mode, cached: true });
    }

    const cachedFit =
      (submission.ai_fit_evaluation as Record<string, unknown> | null) ??
      (submission.aiFitEvaluation as Record<string, unknown> | null);

    let fitResults: FitCriterionResult[] = DEFAULT_FIT_RESULTS;
    let fitSummary = DEFAULT_FIT_SUMMARY;
    if (cachedFit && Array.isArray(cachedFit.results) && typeof cachedFit.summary === 'string') {
      fitResults = normalizeFitResults(cachedFit.results);
      fitSummary = cachedFit.summary || DEFAULT_FIT_SUMMARY;
    } else {
      const { data: criteriaRow } = await db
        .from('vc_criteria')
        .select('thesis')
        .eq('user_id', user.id)
        .maybeSingle();

      const criteria = criteriaRow?.thesis ?? form.thesis ?? {};
      const fitEvaluation = await evaluateFitWithOpenAI(criteria, submission.data ?? {}, normalizeFormQuestions(form));
      fitResults = fitEvaluation.results;
      fitSummary = fitEvaluation.summary;

      if (submission.id) {
        await db
          .from('submissions')
          .update({
            ai_fit_evaluation: {
              results: fitEvaluation.results,
              summary: fitEvaluation.summary,
              generatedAt: new Date().toISOString(),
            },
          })
          .eq('id', submission.id);
      }
    }

    const generatedConclusion = await generateFinalConclusionWithOpenAI({
      mode,
      companyName,
      industry,
      oneLiner,
      fitResults,
      fitSummary,
      marketReport,
      submissionData: submission.data ?? {},
    });

    if (!submission.id || typeof submission.id !== 'string') {
      return c.json({ success: true, conclusion: generatedConclusion, mode, cached: false });
    }

    const nextStore: FinalConclusionStore = {
      ...existingStore,
      [mode]: {
        ...generatedConclusion,
        mode,
        generatedAt: new Date().toISOString(),
      },
    };

    await persistSubmissionFinalConclusion(db, submission.id, nextStore);

    return c.json({
      success: true,
      conclusion: nextStore[mode],
      mode,
      cached: false,
    });
  } catch (error) {
    console.error('[GENERATE FINAL CONCLUSION] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Generate AI email draft from final conclusion - REQUIRES AUTH
app.post("/make-server-26821bbd/forms/:formId/submissions/:submissionId/email/generate", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const formId = c.req.param('formId');
    const submissionId = c.req.param('submissionId');
    const db = getServiceClient();

    const contextResult = await resolveOwnerSubmissionContext(db, user.id, formId, submissionId);
    if (!contextResult.context) {
      return c.json({ success: false, error: contextResult.errorMessage }, contextResult.errorStatus ?? 400);
    }

    const { context } = contextResult;
    if (!context.startupEmail) {
      return c.json({
        success: false,
        error: 'Startup email is missing in this application.',
      }, 400);
    }

    const marketReportRaw =
      (context.submission.ai_market_report as Record<string, unknown> | null) ??
      (context.submission.aiMarketReport as Record<string, unknown> | null);
    const mode: FinalConclusionMode = marketReportRaw ? 'with_report' : 'pre_report';

    const existingStore = normalizeFinalConclusionStore(
      (context.submission.ai_final_conclusion as Record<string, unknown> | null) ??
        (context.submission.aiFinalConclusion as Record<string, unknown> | null),
      context.companyName,
    );

    let finalConclusion = existingStore[mode];
    if (!finalConclusion) {
      finalConclusion = buildFallbackFinalConclusion(mode, context.companyName);
    }

    const draft = await generateApplicationEmailWithOpenAI({
      companyName: context.companyName,
      finalConclusion,
    });

    return c.json({
      success: true,
      draft: {
        toEmail: context.startupEmail,
        subject: draft.subject,
        body: draft.body,
        emailType: draft.emailType,
      },
    });
  } catch (error) {
    console.error('[GENERATE EMAIL] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Link VC sender email account - REQUIRES AUTH
app.get("/make-server-26821bbd/communications/email-account", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const db = getServiceClient();
    const linked = await getLinkedVcEmail(db, user);

    return c.json({
      success: true,
      linkedEmail: linked.linked ? linked.email : '',
      displayName: linked.displayName ?? '',
      isLinked: linked.linked,
      fallbackEmail: typeof user.email === 'string' ? user.email : '',
    });
  } catch (error) {
    console.error('[GET EMAIL ACCOUNT] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post("/make-server-26821bbd/communications/email-account/link", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const { email, displayName } = await c.req.json();
    if (typeof email !== 'string' || !isValidEmail(email.trim())) {
      return c.json({ success: false, error: 'Please provide a valid email address.' }, 400);
    }

    const db = getServiceClient();
    await upsertTableRowWithFallback(db, 'vc_email_accounts', {
      user_id: user.id,
      linked_email: email.trim().toLowerCase(),
      display_name: typeof displayName === 'string' ? displayName.trim() : null,
      provider: 'resend',
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('[LINK EMAIL ACCOUNT] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

app.post("/make-server-26821bbd/communications/email-account/unlink", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const db = getServiceClient();
    const { error } = await db.from('vc_email_accounts').delete().eq('user_id', user.id);
    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('[UNLINK EMAIL ACCOUNT] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Send email to applicant and store in thread history - REQUIRES AUTH
app.post("/make-server-26821bbd/forms/:formId/submissions/:submissionId/email/send", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const { subject, body, threadId } = await c.req.json();
    if (typeof subject !== 'string' || !subject.trim() || typeof body !== 'string' || !body.trim()) {
      return c.json({ success: false, error: 'Subject and body are required.' }, 400);
    }

    const formId = c.req.param('formId');
    const submissionId = c.req.param('submissionId');
    const db = getServiceClient();

    const contextResult = await resolveOwnerSubmissionContext(db, user.id, formId, submissionId);
    if (!contextResult.context) {
      return c.json({ success: false, error: contextResult.errorMessage }, contextResult.errorStatus ?? 400);
    }
    const { context } = contextResult;

    if (!context.startupEmail) {
      return c.json({ success: false, error: 'Startup email is missing in this application.' }, 400);
    }
    const linkedVcEmail = await getLinkedVcEmail(db, user);
    const senderEmail = linkedVcEmail.email.trim();
    if (!senderEmail) {
      return c.json({
        success: false,
        error: 'No linked sender email. Link your email in VC Hub before sending.',
      }, 400);
    }

    const resolvedThreadId =
      typeof threadId === 'string' && threadId.trim().length > 0
        ? threadId
        : `thread_${context.externalSubmissionId}`;

    const sendResult = await sendEmailViaProvider({
      db,
      userId: user.id,
      to: context.startupEmail,
      subject: subject.trim(),
      body: body.trim(),
      replyTo: senderEmail,
    });

    await insertRowWithFallback(db, 'application_emails', {
      owner_user_id: user.id,
      thread_id: resolvedThreadId,
      form_external_id: context.externalFormId,
      submission_external_id: context.externalSubmissionId,
      company_name: context.companyName,
      startup_email: context.startupEmail,
      vc_email: senderEmail,
      direction: 'outbound',
      subject: subject.trim(),
      body: body.trim(),
      provider_status: sendResult.success ? 'sent' : 'failed',
      provider_message_id: sendResult.providerMessageId,
      created_at: new Date().toISOString(),
    });

    if (!sendResult.success) {
      return c.json({ success: false, error: sendResult.error }, 500);
    }

    return c.json({
      success: true,
      threadId: resolvedThreadId,
      toEmail: context.startupEmail,
      providerMessageId: sendResult.providerMessageId,
    });
  } catch (error) {
    console.error('[SEND EMAIL] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// List email threads for VC inbox - REQUIRES AUTH
app.get("/make-server-26821bbd/communications/emails", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from('application_emails')
      .select('*')
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    const grouped = new Map<string, Record<string, unknown>[]>();
    ((data as Record<string, unknown>[] | null) ?? []).forEach((row) => {
      const rowThread = typeof row.thread_id === 'string' ? row.thread_id : 'thread_unknown';
      const existing = grouped.get(rowThread) ?? [];
      existing.push(row);
      grouped.set(rowThread, existing);
    });

    const threads = Array.from(grouped.entries()).map(([threadId, rows]) => {
      const sorted = [...rows].sort(
        (a, b) =>
          new Date(String(a.created_at ?? 0)).getTime() - new Date(String(b.created_at ?? 0)).getTime(),
      );
      const latest = sorted[sorted.length - 1] ?? {};
      return {
        threadId,
        startupEmail: typeof latest.startup_email === 'string' ? latest.startup_email : '',
        companyName: typeof latest.company_name === 'string' ? latest.company_name : 'Startup',
        submissionId:
          typeof latest.submission_external_id === 'string'
            ? latest.submission_external_id
            : '',
        latestSubject: typeof latest.subject === 'string' ? latest.subject : '',
        latestPreview:
          typeof latest.body === 'string' ? latest.body.slice(0, 180) : '',
        latestAt:
          typeof latest.created_at === 'string'
            ? latest.created_at
            : new Date().toISOString(),
        messageCount: sorted.length,
      };
    });

    threads.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());

    return c.json({ success: true, threads });
  } catch (error) {
    console.error('[GET EMAIL THREADS] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// List messages in one email thread - REQUIRES AUTH
app.get("/make-server-26821bbd/communications/emails/:threadId/messages", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const threadId = c.req.param('threadId');
    const db = getServiceClient();
    const { data, error } = await db
      .from('application_emails')
      .select('*')
      .eq('owner_user_id', user.id)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    const messages = ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
      id: String(row.id ?? crypto.randomUUID()),
      threadId: typeof row.thread_id === 'string' ? row.thread_id : threadId,
      direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
      fromEmail: typeof row.direction === 'inbound' ? row.startup_email : row.vc_email,
      toEmail: typeof row.direction === 'inbound' ? row.vc_email : row.startup_email,
      subject: typeof row.subject === 'string' ? row.subject : '',
      body: typeof row.body === 'string' ? row.body : '',
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      providerStatus: typeof row.provider_status === 'string' ? row.provider_status : 'sent',
      submissionId: typeof row.submission_external_id === 'string' ? row.submission_external_id : '',
      companyName: typeof row.company_name === 'string' ? row.company_name : 'Startup',
    }));

    return c.json({ success: true, messages });
  } catch (error) {
    console.error('[GET EMAIL THREAD MESSAGES] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Send reply from inbox thread - REQUIRES AUTH
app.post("/make-server-26821bbd/communications/emails/:threadId/reply", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const threadId = c.req.param('threadId');
    const { subject, body } = await c.req.json();
    if (typeof subject !== 'string' || !subject.trim() || typeof body !== 'string' || !body.trim()) {
      return c.json({ success: false, error: 'Subject and body are required.' }, 400);
    }

    const db = getServiceClient();
    const linkedVcEmail = await getLinkedVcEmail(db, user);
    const senderEmail = linkedVcEmail.email.trim();
    if (!senderEmail) {
      return c.json({
        success: false,
        error: 'No linked sender email. Link your email in VC Hub before replying.',
      }, 400);
    }

    const { data: existing, error: existingError } = await db
      .from('application_emails')
      .select('*')
      .eq('owner_user_id', user.id)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return c.json({ success: false, error: existingError.message }, 500);
    }
    if (!existing) {
      return c.json({ success: false, error: 'Thread not found' }, 404);
    }

    const startupEmail = typeof existing.startup_email === 'string' ? existing.startup_email : '';
    if (!startupEmail) {
      return c.json({ success: false, error: 'Startup email not found for thread.' }, 400);
    }

    const sendResult = await sendEmailViaProvider({
      db,
      userId: user.id,
      to: startupEmail,
      subject: subject.trim(),
      body: body.trim(),
      replyTo: senderEmail,
    });

    await insertRowWithFallback(db, 'application_emails', {
      owner_user_id: user.id,
      thread_id: threadId,
      form_external_id: existing.form_external_id,
      submission_external_id: existing.submission_external_id,
      company_name: existing.company_name,
      startup_email: startupEmail,
      vc_email: senderEmail,
      direction: 'outbound',
      subject: subject.trim(),
      body: body.trim(),
      provider_status: sendResult.success ? 'sent' : 'failed',
      provider_message_id: sendResult.providerMessageId,
      created_at: new Date().toISOString(),
    });

    if (!sendResult.success) {
      return c.json({ success: false, error: sendResult.error }, 500);
    }

    return c.json({ success: true, providerMessageId: sendResult.providerMessageId });
  } catch (error) {
    console.error('[REPLY EMAIL] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Inbound email webhook (provider integration) - uses shared secret
app.post("/make-server-26821bbd/communications/emails/inbound", async (c) => {
  try {
    const expectedSecret = Deno.env.get('INBOUND_EMAIL_WEBHOOK_SECRET');
    if (!expectedSecret) {
      return c.json({ success: false, error: 'Inbound webhook secret is not configured.' }, 500);
    }

    const providedSecret = c.req.header('x-webhook-secret');
    if (providedSecret !== expectedSecret) {
      return c.json({ success: false, error: 'Unauthorized webhook call.' }, 401);
    }

    const payload = await c.req.json();
    const ownerUserId = typeof payload.ownerUserId === 'string' ? payload.ownerUserId : '';
    const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';
    const subject = typeof payload.subject === 'string' ? payload.subject : '';
    const body = typeof payload.body === 'string' ? payload.body : '';
    const fromEmail = typeof payload.fromEmail === 'string' ? payload.fromEmail : '';
    const vcEmail = typeof payload.vcEmail === 'string' ? payload.vcEmail : '';

    if (!ownerUserId || !threadId || !subject || !body || !fromEmail || !vcEmail) {
      return c.json({ success: false, error: 'Invalid inbound payload.' }, 400);
    }

    const db = getServiceClient();
    await insertRowWithFallback(db, 'application_emails', {
      owner_user_id: ownerUserId,
      thread_id: threadId,
      form_external_id: typeof payload.formId === 'string' ? payload.formId : null,
      submission_external_id: typeof payload.submissionId === 'string' ? payload.submissionId : null,
      company_name: typeof payload.companyName === 'string' ? payload.companyName : 'Startup',
      startup_email: fromEmail,
      vc_email: vcEmail,
      direction: 'inbound',
      subject,
      body,
      provider_status: 'received',
      provider_message_id: typeof payload.providerMessageId === 'string' ? payload.providerMessageId : null,
      in_reply_to: typeof payload.inReplyTo === 'string' ? payload.inReplyTo : null,
      created_at: new Date().toISOString(),
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('[INBOUND EMAIL WEBHOOK] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Schedule a Google Meet call and store call details - REQUIRES AUTH
app.post("/make-server-26821bbd/forms/:formId/submissions/:submissionId/calls/schedule", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }
    const db = getServiceClient();
    const linkedVcEmail = await getLinkedVcEmail(db, user);
    const senderEmail = linkedVcEmail.email.trim();
    if (!senderEmail) {
      return c.json({
        success: false,
        error: 'No linked sender email. Link your email in VC Hub before booking calls.',
      }, 400);
    }

    const { date, time, timezone, durationMinutes, notes } = await c.req.json();
    if (typeof date !== 'string' || typeof time !== 'string' || typeof timezone !== 'string') {
      return c.json({ success: false, error: 'date, time and timezone are required.' }, 400);
    }

    const parsedDuration =
      typeof durationMinutes === 'number' && durationMinutes > 0 && durationMinutes <= 180
        ? Math.floor(durationMinutes)
        : 30;

    const [hourStr, minuteStr] = time.split(':');
    const startHour = Number(hourStr);
    const startMinute = Number(minuteStr);
    if (!Number.isFinite(startHour) || !Number.isFinite(startMinute)) {
      return c.json({ success: false, error: 'Invalid time format. Use HH:mm.' }, 400);
    }

    const endTotalMinutes = startHour * 60 + startMinute + parsedDuration;
    const endHour = Math.floor((endTotalMinutes % (24 * 60)) / 60);
    const endMinute = endTotalMinutes % 60;
    const carryDay = Math.floor(endTotalMinutes / (24 * 60));
    const startDateObj = new Date(`${date}T00:00:00`);
    if (Number.isNaN(startDateObj.getTime())) {
      return c.json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD.' }, 400);
    }
    startDateObj.setDate(startDateObj.getDate() + carryDay);
    const endDate = startDateObj.toISOString().slice(0, 10);

    const startDateTime = `${date}T${hourStr.padStart(2, '0')}:${minuteStr.padStart(2, '0')}:00`;
    const endDateTime = `${endDate}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;

    const formId = c.req.param('formId');
    const submissionId = c.req.param('submissionId');

    const contextResult = await resolveOwnerSubmissionContext(db, user.id, formId, submissionId);
    if (!contextResult.context) {
      return c.json({ success: false, error: contextResult.errorMessage }, contextResult.errorStatus ?? 400);
    }
    const { context } = contextResult;

    if (!context.startupEmail) {
      return c.json({ success: false, error: 'Startup email is missing in this application.' }, 400);
    }

    // Try to use the user's OAuth token for Calendar access
    let userCalendarToken: string | undefined;
    const mailboxConn = await getMailboxConnection(db, user.id);
    if (mailboxConn && mailboxConn.provider === 'google' && mailboxConn.status === 'connected') {
      try {
        userCalendarToken = await getValidMailboxToken(db, mailboxConn);
      } catch (err) {
        console.error('[SCHEDULE CALL] Could not get user OAuth token, will try service account:', err);
      }
    }

    const scheduleResult = await scheduleGoogleMeetEvent({
      summary: `Intro Call - ${context.companyName}`,
      description:
        typeof notes === 'string' && notes.trim().length > 0
          ? notes
          : `ScreenVC call for ${context.companyName}`,
      startupEmail: context.startupEmail,
      vcEmail: senderEmail,
      startDateTime,
      endDateTime,
      timeZone: timezone,
      userAccessToken: userCalendarToken,
    });

    if (!scheduleResult.success) {
      return c.json({ success: false, error: scheduleResult.error }, 500);
    }

    const inserted = await insertRowWithFallback(db, 'application_calls', {
      owner_user_id: user.id,
      form_external_id: context.externalFormId,
      submission_external_id: context.externalSubmissionId,
      company_name: context.companyName,
      startup_email: context.startupEmail,
      vc_email: senderEmail,
      scheduled_at: `${startDateTime}Z`,
      timezone,
      duration_minutes: parsedDuration,
      meet_link: scheduleResult.meetLink,
      google_event_id: scheduleResult.eventId,
      status: 'scheduled',
      notes: typeof notes === 'string' ? notes : null,
      created_at: new Date().toISOString(),
    });

    return c.json({
      success: true,
      call: {
        id: String(inserted?.id ?? crypto.randomUUID()),
        companyName: context.companyName,
        startupEmail: context.startupEmail,
        vcEmail: senderEmail,
        scheduledAt: typeof inserted?.scheduled_at === 'string' ? inserted.scheduled_at : `${startDateTime}Z`,
        timezone,
        durationMinutes: parsedDuration,
        meetLink: scheduleResult.meetLink,
        status: 'scheduled',
      },
    });
  } catch (error) {
    console.error('[SCHEDULE CALL] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// List calls for VC hub - REQUIRES AUTH
app.get("/make-server-26821bbd/communications/calls", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from('application_calls')
      .select('*')
      .eq('owner_user_id', user.id)
      .order('scheduled_at', { ascending: false });

    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    const calls = ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
      id: String(row.id ?? crypto.randomUUID()),
      companyName: typeof row.company_name === 'string' ? row.company_name : 'Startup',
      startupEmail: typeof row.startup_email === 'string' ? row.startup_email : '',
      vcEmail: typeof row.vc_email === 'string' ? row.vc_email : '',
      scheduledAt: typeof row.scheduled_at === 'string' ? row.scheduled_at : new Date().toISOString(),
      timezone: typeof row.timezone === 'string' ? row.timezone : 'UTC',
      durationMinutes: Number(row.duration_minutes ?? 30),
      meetLink: typeof row.meet_link === 'string' ? row.meet_link : '',
      status: typeof row.status === 'string' ? row.status : 'scheduled',
      notes: typeof row.notes === 'string' ? row.notes : '',
      submissionId: typeof row.submission_external_id === 'string' ? row.submission_external_id : '',
    }));

    return c.json({ success: true, calls });
  } catch (error) {
    console.error('[GET CALLS] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ========================================
// NOTETAKER BOT ENDPOINTS
// ========================================

// Send notetaker bot to join a call - REQUIRES AUTH
app.post("/make-server-26821bbd/calls/:callId/notetaker/send", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const callId = c.req.param('callId');
    const db = getServiceClient();

    // Verify the call belongs to this user and has a meet link
    const { data: callRow, error: callError } = await db
      .from('application_calls')
      .select('*')
      .eq('id', callId)
      .eq('owner_user_id', user.id)
      .single();

    if (callError || !callRow) {
      return c.json({ success: false, error: 'Call not found or not authorized.' }, 404);
    }

    if (!callRow.meet_link) {
      return c.json({ success: false, error: 'Call has no Google Meet link.' }, 400);
    }

    // Check if there's already an active session for this call
    const { data: existingSessions } = await db
      .from('call_notetaker_sessions')
      .select('id, status')
      .eq('call_id', callId)
      .in('status', ['requesting', 'joining', 'recording', 'processing']);

    if (existingSessions && existingSessions.length > 0) {
      return c.json({
        success: false,
        error: 'A notetaker is already active for this call.',
        sessionId: existingSessions[0].id,
        status: existingSessions[0].status,
      }, 409);
    }

    // Create a new notetaker session
    const sessionRow = {
      call_id: callId,
      owner_user_id: user.id,
      bot_name: 'ScreenVC Notetaker',
      status: 'requesting',
      requested_at: new Date().toISOString(),
    };

    const { data: session, error: insertError } = await db
      .from('call_notetaker_sessions')
      .insert(sessionRow)
      .select('id')
      .single();

    if (insertError || !session) {
      console.error('[NOTETAKER SEND] Insert error:', insertError);
      return c.json({ success: false, error: 'Failed to create notetaker session.' }, 500);
    }

    // Dispatch to bot service
    const botServiceUrl = Deno.env.get('BOT_SERVICE_URL');
    const botServiceSecret = Deno.env.get('BOT_SERVICE_SECRET');

    if (!botServiceUrl || !botServiceSecret) {
      // Update session to failed
      await db.from('call_notetaker_sessions').update({
        status: 'failed',
        error_message: 'Bot service not configured.',
      }).eq('id', session.id);
      return c.json({ success: false, error: 'Notetaker bot service is not configured.' }, 500);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const webhookSecret = Deno.env.get('NOTETAKER_WEBHOOK_SECRET') ?? botServiceSecret;
    const callbackUrl = `${supabaseUrl}/functions/v1/make-server-26821bbd/notetaker/webhook`;

    try {
      const botResponse = await fetch(`${botServiceUrl}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${botServiceSecret}`,
        },
        body: JSON.stringify({
          callId,
          sessionId: session.id,
          meetLink: callRow.meet_link,
          botName: 'ScreenVC Notetaker',
          callbackUrl,
          callbackSecret: webhookSecret,
        }),
      });

      if (!botResponse.ok) {
        const errText = await botResponse.text();
        console.error('[NOTETAKER SEND] Bot service error:', errText);
        await db.from('call_notetaker_sessions').update({
          status: 'failed',
          error_message: `Bot service returned ${botResponse.status}`,
        }).eq('id', session.id);
        return c.json({ success: false, error: 'Failed to dispatch notetaker bot.' }, 502);
      }
    } catch (fetchErr) {
      console.error('[NOTETAKER SEND] Bot service fetch error:', fetchErr);
      await db.from('call_notetaker_sessions').update({
        status: 'failed',
        error_message: 'Bot service unreachable.',
      }).eq('id', session.id);
      return c.json({ success: false, error: 'Notetaker bot service is unreachable.' }, 502);
    }

    return c.json({
      success: true,
      sessionId: session.id,
      status: 'requesting',
    });
  } catch (error) {
    console.error('[NOTETAKER SEND] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get notetaker status for a call - REQUIRES AUTH
app.get("/make-server-26821bbd/calls/:callId/notetaker/status", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const callId = c.req.param('callId');
    const db = getServiceClient();

    const { data: sessions, error } = await db
      .from('call_notetaker_sessions')
      .select('*')
      .eq('call_id', callId)
      .eq('owner_user_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(1);

    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    if (!sessions || sessions.length === 0) {
      return c.json({ success: true, session: null });
    }

    const row = sessions[0] as Record<string, unknown>;
    return c.json({
      success: true,
      session: {
        id: String(row.id),
        callId: String(row.call_id),
        status: typeof row.status === 'string' ? row.status : 'unknown',
        botName: typeof row.bot_name === 'string' ? row.bot_name : 'ScreenVC Notetaker',
        errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
        requestedAt: typeof row.requested_at === 'string' ? row.requested_at : null,
        joinedAt: typeof row.joined_at === 'string' ? row.joined_at : null,
        endedAt: typeof row.ended_at === 'string' ? row.ended_at : null,
      },
    });
  } catch (error) {
    console.error('[NOTETAKER STATUS] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get call transcript - REQUIRES AUTH
app.get("/make-server-26821bbd/calls/:callId/transcript", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const callId = c.req.param('callId');
    const db = getServiceClient();

    const { data: transcripts, error } = await db
      .from('call_transcripts')
      .select('*')
      .eq('call_id', callId)
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    if (!transcripts || transcripts.length === 0) {
      return c.json({ success: true, transcript: null });
    }

    const row = transcripts[0] as Record<string, unknown>;
    return c.json({
      success: true,
      transcript: {
        id: String(row.id),
        callId: String(row.call_id),
        fullText: typeof row.full_text === 'string' ? row.full_text : '',
        segments: Array.isArray(row.segments) ? row.segments : [],
        durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
        wordCount: typeof row.word_count === 'number' ? row.word_count : null,
        createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[GET TRANSCRIPT] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get call summary - REQUIRES AUTH
app.get("/make-server-26821bbd/calls/:callId/summary", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const callId = c.req.param('callId');
    const db = getServiceClient();

    const { data: summaries, error } = await db
      .from('call_summaries')
      .select('*')
      .eq('call_id', callId)
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    if (!summaries || summaries.length === 0) {
      return c.json({ success: true, summary: null });
    }

    const row = summaries[0] as Record<string, unknown>;
    return c.json({
      success: true,
      summary: {
        id: String(row.id),
        callId: String(row.call_id),
        overallSummary: typeof row.overall_summary === 'string' ? row.overall_summary : '',
        keyPoints: Array.isArray(row.key_points) ? row.key_points : [],
        actionItems: Array.isArray(row.action_items) ? row.action_items : [],
        founderImpressions: typeof row.founder_impressions === 'string' ? row.founder_impressions : '',
        concerns: Array.isArray(row.concerns) ? row.concerns : [],
        nextSteps: Array.isArray(row.next_steps) ? row.next_steps : [],
        createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[GET SUMMARY] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Notetaker webhook - receives bot results (uses shared secret, no JWT auth)
app.post("/make-server-26821bbd/notetaker/webhook", async (c) => {
  try {
    const expectedSecret = Deno.env.get('NOTETAKER_WEBHOOK_SECRET') ?? Deno.env.get('BOT_SERVICE_SECRET');
    if (!expectedSecret) {
      return c.json({ success: false, error: 'Webhook secret is not configured.' }, 500);
    }

    const providedSecret = c.req.header('x-webhook-secret');
    if (providedSecret !== expectedSecret) {
      return c.json({ success: false, error: 'Unauthorized webhook call.' }, 401);
    }

    const payload = await c.req.json();
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const eventType = typeof payload.eventType === 'string' ? payload.eventType : '';

    if (!sessionId || !eventType) {
      return c.json({ success: false, error: 'Invalid webhook payload.' }, 400);
    }

    const db = getServiceClient();

    // Look up the session
    const { data: sessionRow, error: sessionError } = await db
      .from('call_notetaker_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !sessionRow) {
      return c.json({ success: false, error: 'Session not found.' }, 404);
    }

    const callId = sessionRow.call_id;
    const ownerUserId = sessionRow.owner_user_id;

    if (eventType === 'status_update') {
      // Update session status
      const newStatus = typeof payload.status === 'string' ? payload.status : sessionRow.status;
      const updateData: Record<string, unknown> = { status: newStatus };

      if (newStatus === 'joining' || newStatus === 'recording') {
        updateData.joined_at = new Date().toISOString();
      }
      if (newStatus === 'failed') {
        updateData.error_message = typeof payload.errorMessage === 'string' ? payload.errorMessage : 'Unknown error';
        updateData.ended_at = new Date().toISOString();
      }

      await db.from('call_notetaker_sessions').update(updateData).eq('id', sessionId);
      return c.json({ success: true });
    }

    if (eventType === 'completed') {
      // Update session to completed
      await db.from('call_notetaker_sessions').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      }).eq('id', sessionId);

      // Insert transcript if provided
      if (payload.transcript && typeof payload.transcript === 'object') {
        const t = payload.transcript;
        await insertRowWithFallback(db, 'call_transcripts', {
          call_id: callId,
          notetaker_session_id: sessionId,
          owner_user_id: ownerUserId,
          full_text: typeof t.fullText === 'string' ? t.fullText : '',
          segments: Array.isArray(t.segments) ? JSON.stringify(t.segments) : '[]',
          duration_seconds: typeof t.durationSeconds === 'number' ? t.durationSeconds : null,
          word_count: typeof t.wordCount === 'number' ? t.wordCount : null,
          created_at: new Date().toISOString(),
        });
      }

      // Insert summary if provided
      if (payload.summary && typeof payload.summary === 'object') {
        const s = payload.summary;
        await insertRowWithFallback(db, 'call_summaries', {
          call_id: callId,
          notetaker_session_id: sessionId,
          owner_user_id: ownerUserId,
          overall_summary: typeof s.overallSummary === 'string' ? s.overallSummary : '',
          key_points: Array.isArray(s.keyPoints) ? JSON.stringify(s.keyPoints) : '[]',
          action_items: Array.isArray(s.actionItems) ? JSON.stringify(s.actionItems) : '[]',
          founder_impressions: typeof s.founderImpressions === 'string' ? s.founderImpressions : null,
          concerns: Array.isArray(s.concerns) ? JSON.stringify(s.concerns) : '[]',
          next_steps: Array.isArray(s.nextSteps) ? JSON.stringify(s.nextSteps) : '[]',
          created_at: new Date().toISOString(),
        });
      }

      return c.json({ success: true });
    }

    return c.json({ success: false, error: `Unknown event type: ${eventType}` }, 400);
  } catch (error) {
    console.error('[NOTETAKER WEBHOOK] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get favorite submissions for the authenticated VC on a form
app.get("/make-server-26821bbd/forms/:formId/favorites", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const formId = c.req.param('formId');
    const db = getServiceClient();
    const form = await getFormByExternalId(db, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (!isOwner(form, user.id)) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }

    const favorites = await getFavoriteExternalSubmissionIds(db, user.id, form);
    return c.json({ success: true, favorites });
  } catch (error) {
    console.error('[GET FAVORITES] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Toggle favorite state for a submission
app.post("/make-server-26821bbd/forms/:formId/favorites/toggle", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const formId = c.req.param('formId');
    const { submissionId } = await c.req.json();
    if (!submissionId || typeof submissionId !== 'string') {
      return c.json({ success: false, error: 'submissionId is required' }, 400);
    }

    const db = getServiceClient();
    const form = await getFormByExternalId(db, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (!isOwner(form, user.id)) {
      return c.json({ success: false, error: 'Forbidden' }, 403);
    }

    const submissions = await getSubmissionsForForm(db, form);
    const targetSubmission = submissions.find((row) => {
      const external = typeof row.external_submission_id === 'string' ? row.external_submission_id : '';
      const legacy = typeof row.submission_id === 'string' ? row.submission_id : '';
      const internal = String(row.id ?? '');
      return external === submissionId || legacy === submissionId || internal === submissionId;
    });

    if (!targetSubmission) {
      return c.json({ success: false, error: 'Submission not found' }, 404);
    }

    const favoriteCandidateIds = Array.from(
      new Set(
        [
          typeof targetSubmission.id === 'string' ? targetSubmission.id : '',
          typeof targetSubmission.external_submission_id === 'string' ? targetSubmission.external_submission_id : '',
          typeof targetSubmission.submission_id === 'string' ? targetSubmission.submission_id : '',
          submissionId,
        ].filter((value) => value.trim().length > 0),
      ),
    );

    const existing = await db
      .from('submission_favorites')
      .select('submission_id')
      .eq('user_id', user.id);

    if (existing.error) {
      return c.json({ success: false, error: existing.error.message }, 500);
    }

    const favoriteSet = new Set(
      ((existing.data as Record<string, unknown>[] | null) ?? [])
        .map((row) => String(row.submission_id ?? '').trim())
        .filter((value) => value.length > 0),
    );
    const currentlyFavorite = favoriteCandidateIds.some((id) => favoriteSet.has(id));

    let isFavorite = currentlyFavorite;
    if (currentlyFavorite) {
      for (const candidateId of favoriteCandidateIds) {
        const { error: deleteError } = await db
          .from('submission_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('submission_id', candidateId);

        if (deleteError) {
          const message = deleteError.message ?? '';
          if (!message.includes('invalid input syntax for type uuid')) {
            return c.json({ success: false, error: deleteError.message }, 500);
          }
        }
      }
      isFavorite = false;
    } else {
      let inserted = false;
      let insertError: string | null = null;

      for (const candidateId of favoriteCandidateIds) {
        try {
          await insertRowWithFallback(db, 'submission_favorites', {
            user_id: user.id,
            submission_id: candidateId,
            created_at: new Date().toISOString(),
          });
          inserted = true;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          insertError = message;
          if (
            message.includes('invalid input syntax for type uuid') ||
            message.includes('violates foreign key constraint')
          ) {
            continue;
          }
          return c.json({ success: false, error: message }, 500);
        }
      }

      if (!inserted) {
        return c.json({
          success: false,
          error: insertError ?? 'Failed to save favourite submission',
        }, 500);
      }

      isFavorite = true;
    }

    const favorites = await getFavoriteExternalSubmissionIds(db, user.id, form);
    return c.json({
      success: true,
      favorites,
      isFavorite,
    });
  } catch (error) {
    console.error('[TOGGLE FAVORITE] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get all forms for the authenticated user
app.get("/make-server-26821bbd/forms", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const db = getServiceClient();
    const forms = await getFormsForUser(db, user.id);

    const mappedForms = forms.map((form) => mapFormResponse(form));
    return c.json({ success: true, forms: mappedForms });
  } catch (error) {
    console.error('[GET FORMS] Error fetching forms:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ========================================
// MAILBOX OAUTH ROUTES
// ========================================

// Mailbox connection status - REQUIRES AUTH
app.get("/make-server-26821bbd/communications/mailbox/status", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const db = getServiceClient();
    const connection = await getMailboxConnection(db, user.id);

    return c.json({
      success: true,
      connected: Boolean(connection),
      provider: connection?.provider ?? null,
      email: connection?.mailbox_email ?? '',
      fallbackEmail: typeof user.email === 'string' ? user.email : '',
      lastSyncedAt: connection?.last_synced_at ?? null,
    });
  } catch (error) {
    console.error('[MAILBOX STATUS] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Create OAuth connect URL for mailbox provider - REQUIRES AUTH
app.get("/make-server-26821bbd/communications/mailbox/connect-url", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const provider = mapMailboxProvider(c.req.query('provider'));
    const config = getMailboxConfig();
    const providerConfig = provider === 'microsoft' ? config.microsoft : config.google;

    if (!providerConfig.clientId || !providerConfig.clientSecret || !config.stateSecret) {
      return c.json({
        success: false,
        error: `${provider === 'microsoft' ? 'Microsoft' : 'Google'} OAuth is not configured. Set the required environment secrets.`,
      }, 500);
    }

    const state = await buildMailboxState({
      userId: user.id,
      provider,
      appBaseUrl: config.appBaseUrl,
      secret: config.stateSecret,
    });

    if (provider === 'microsoft') {
      const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      url.searchParams.set('client_id', providerConfig.clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', config.redirectUri);
      url.searchParams.set('scope', 'Mail.Send Mail.Read User.Read offline_access');
      url.searchParams.set('state', state);
      url.searchParams.set('response_mode', 'query');
      return c.json({ success: true, url: url.toString() });
    }

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', providerConfig.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    return c.json({ success: true, url: url.toString() });
  } catch (error) {
    console.error('[MAILBOX CONNECT URL] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// OAuth callback handler (redirected from Google/Microsoft)
app.get("/make-server-26821bbd/communications/mailbox/callback", async (c) => {
  const config = getMailboxConfig();
  const redirectWithError = (appBaseUrl: string, msg: string) =>
    c.redirect(`${appBaseUrl}?view=hub&mailbox=error&message=${encodeURIComponent(msg)}`);

  try {
    const code = c.req.query('code');
    const stateParam = c.req.query('state');
    const errorParam = c.req.query('error');

    if (errorParam) {
      return redirectWithError(config.appBaseUrl, errorParam);
    }

    if (!code || !stateParam) {
      return redirectWithError(config.appBaseUrl, 'Missing code or state parameter.');
    }

    const statePayload = await parseMailboxState(stateParam, config.stateSecret);
    const { userId, provider, appBaseUrl } = statePayload;
    const providerConfig = provider === 'microsoft' ? config.microsoft : config.google;

    // Exchange code for tokens
    const tokenUrl = provider === 'microsoft'
      ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
      : 'https://oauth2.googleapis.com/token';

    const tokenParams = new URLSearchParams({
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('[MAILBOX CALLBACK] Token exchange error:', tokenResponse.status, errorBody);
      return redirectWithError(appBaseUrl, 'Failed to exchange authorization code.');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token as string;
    const refreshToken = typeof tokenData.refresh_token === 'string' ? tokenData.refresh_token : null;
    const expiresIn = typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 3600;

    // Fetch user email from provider
    let mailboxEmail = '';
    if (provider === 'microsoft') {
      const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        mailboxEmail = typeof profile.mail === 'string' ? profile.mail
          : typeof profile.userPrincipalName === 'string' ? profile.userPrincipalName
          : '';
      }
    } else {
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        mailboxEmail = typeof profile.email === 'string' ? profile.email : '';
      }
    }

    if (!mailboxEmail) {
      return redirectWithError(appBaseUrl, 'Could not retrieve email from provider.');
    }

    const db = getServiceClient();

    // Store tokens in user_mailbox_connections
    await upsertMailboxConnection(db, {
      user_id: userId,
      provider,
      mailbox_email: mailboxEmail,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      status: 'connected',
    });

    // Also update vc_email_accounts so the linked email is used for sending
    await db.from('vc_email_accounts').upsert(
      {
        user_id: userId,
        linked_email: mailboxEmail,
        provider,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    return c.redirect(`${appBaseUrl}?view=hub&mailbox=connected`);
  } catch (error) {
    console.error('[MAILBOX CALLBACK] Error:', error);
    return redirectWithError(config.appBaseUrl, String(error));
  }
});

// Disconnect mailbox provider - REQUIRES AUTH
app.post("/make-server-26821bbd/communications/mailbox/disconnect", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const db = getServiceClient();

    const { error } = await db.from('user_mailbox_connections').delete().eq('user_id', user.id);
    if (error) {
      const message = error.message ?? '';
      if (!message.includes('relation') && !message.includes('schema cache')) {
        return c.json({ success: false, error: error.message }, 500);
      }
    }

    // Also clear the vc_email_accounts row
    await db.from('vc_email_accounts').delete().eq('user_id', user.id);

    return c.json({ success: true });
  } catch (error) {
    console.error('[MAILBOX DISCONNECT] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Manually sync inbox messages from mailbox provider - REQUIRES AUTH
app.post("/make-server-26821bbd/communications/mailbox/sync", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const db = getServiceClient();
    const connection = await getMailboxConnection(db, user.id);
    if (!connection) {
      return c.json({ success: false, error: 'No connected mailbox found.' }, 400);
    }

    await syncMailboxMessages(db, user.id, connection);
    return c.json({ success: true });
  } catch (error) {
    console.error('[MAILBOX SYNC] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// ========================================
// DEAL INTELLIGENCE REPORT
// ========================================

// GET cached intelligence report for a call
app.get("/make-server-26821bbd/calls/:callId/intelligence-report", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const callId = c.req.param('callId');
    const db = getServiceClient();

    const { data: rows, error } = await db
      .from('call_intelligence_reports')
      .select('*')
      .eq('call_id', callId)
      .eq('owner_user_id', user.id)
      .limit(1);

    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    if (!rows || rows.length === 0) {
      return c.json({ success: true, report: null });
    }

    return c.json({ success: true, report: rows[0].report, cached: true });
  } catch (error) {
    console.error('[GET INTELLIGENCE REPORT] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// POST generate intelligence report for a call
app.post("/make-server-26821bbd/calls/:callId/intelligence-report/generate", async (c) => {
  try {
    const user = await getUserFromRequest(c);
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const callId = c.req.param('callId');
    const db = getServiceClient();

    // Check for cached report first
    const { data: existingRows } = await db
      .from('call_intelligence_reports')
      .select('report')
      .eq('call_id', callId)
      .eq('owner_user_id', user.id)
      .limit(1);

    if (existingRows && existingRows.length > 0 && existingRows[0].report) {
      return c.json({ success: true, report: existingRows[0].report, cached: true });
    }

    // Load call details
    const { data: callRow, error: callError } = await db
      .from('application_calls')
      .select('*')
      .eq('id', callId)
      .eq('owner_user_id', user.id)
      .single();

    if (callError || !callRow) {
      return c.json({ success: false, error: 'Call not found or not authorized.' }, 404);
    }

    // Load transcript
    const { data: transcripts } = await db
      .from('call_transcripts')
      .select('full_text, segments')
      .eq('call_id', callId)
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const transcriptText = transcripts?.[0]?.full_text || '';
    if (!transcriptText) {
      return c.json({ success: false, error: 'No transcript available for this call. Ensure the notetaker has completed.' }, 400);
    }

    // Load summary
    const { data: summaries } = await db
      .from('call_summaries')
      .select('overall_summary, key_points, action_items, concerns, next_steps, founder_impressions')
      .eq('call_id', callId)
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const summaryRow = summaries?.[0] ?? null;

    // Load VC thesis
    const { data: criteriaRow } = await db
      .from('vc_criteria')
      .select('thesis')
      .eq('user_id', user.id)
      .maybeSingle();

    const vcThesis = criteriaRow?.thesis ?? {};

    // Load submission data if call has a submission
    let submissionData: Record<string, unknown> = {};
    let fitEvaluation: Record<string, unknown> | null = null;
    const submissionId = callRow.submission_id;
    if (submissionId) {
      const { data: subRow } = await db
        .from('submissions')
        .select('data, ai_fit_evaluation')
        .eq('id', submissionId)
        .maybeSingle();

      if (subRow) {
        submissionData = (subRow.data as Record<string, unknown>) ?? {};
        fitEvaluation = (subRow.ai_fit_evaluation as Record<string, unknown>) ?? null;
      }
    }

    // Truncate transcript to ~40k chars for the prompt
    const truncatedTranscript = transcriptText.length > 40000
      ? transcriptText.slice(0, 40000) + '\n\n[TRANSCRIPT TRUNCATED]'
      : transcriptText;

    // Build the AI prompt
    const companyName = typeof callRow.company_name === 'string' ? callRow.company_name : 'Unknown Company';
    const callDate = typeof callRow.scheduled_at === 'string'
      ? new Date(callRow.scheduled_at).toLocaleDateString()
      : new Date().toLocaleDateString();

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return c.json({ success: false, error: 'OpenAI API key not configured.' }, 500);
    }

    const intelligenceSchema = {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        header: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            companyName: { type: 'string' as const },
            stage: { type: 'string' as const },
            sector: { type: 'string' as const },
            fundraisingTarget: { type: 'string' as const },
            callDate: { type: 'string' as const },
            thesisAlignmentScore: { type: 'number' as const },
          },
          required: ['companyName', 'stage', 'sector', 'fundraisingTarget', 'callDate', 'thesisAlignmentScore'],
        },
        executiveSummary: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            summary: { type: 'string' as const },
            investmentSignal: { type: 'string' as const, enum: ['Strong Pass', 'Lean Pass', 'Neutral', 'Lean Invest', 'Strong Invest'] },
            signalRationale: { type: 'string' as const },
          },
          required: ['summary', 'investmentSignal', 'signalRationale'],
        },
        founderAnalysis: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            dimensions: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                additionalProperties: false,
                properties: {
                  name: { type: 'string' as const },
                  score: { type: 'number' as const },
                  assessment: { type: 'string' as const },
                  evidence: { type: 'string' as const },
                },
                required: ['name', 'score', 'assessment', 'evidence'],
              },
            },
          },
          required: ['dimensions'],
        },
        riskDashboard: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            flags: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                additionalProperties: false,
                properties: {
                  severity: { type: 'string' as const, enum: ['red', 'yellow', 'green'] },
                  category: { type: 'string' as const },
                  description: { type: 'string' as const },
                  evidence: { type: 'string' as const },
                },
                required: ['severity', 'category', 'description', 'evidence'],
              },
            },
          },
          required: ['flags'],
        },
        competitiveIntelligence: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            competitors: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                additionalProperties: false,
                properties: {
                  name: { type: 'string' as const },
                  description: { type: 'string' as const },
                  threatLevel: { type: 'string' as const, enum: ['Low', 'Medium', 'High'] },
                },
                required: ['name', 'description', 'threatLevel'],
              },
            },
            differentiation: { type: 'string' as const },
            positioning: { type: 'string' as const },
          },
          required: ['competitors', 'differentiation', 'positioning'],
        },
        questionCoverage: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            overallCoveragePercent: { type: 'number' as const },
            areas: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                additionalProperties: false,
                properties: {
                  area: { type: 'string' as const },
                  coveragePercent: { type: 'number' as const },
                  covered: { type: 'array' as const, items: { type: 'string' as const } },
                  gaps: { type: 'array' as const, items: { type: 'string' as const } },
                },
                required: ['area', 'coveragePercent', 'covered', 'gaps'],
              },
            },
            suggestedFollowUps: { type: 'array' as const, items: { type: 'string' as const } },
          },
          required: ['overallCoveragePercent', 'areas', 'suggestedFollowUps'],
        },
        dealStrengthScore: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            overall: { type: 'number' as const },
            breakdown: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                additionalProperties: false,
                properties: {
                  dimension: { type: 'string' as const },
                  score: { type: 'number' as const },
                  weight: { type: 'number' as const },
                },
                required: ['dimension', 'score', 'weight'],
              },
            },
          },
          required: ['overall', 'breakdown'],
        },
        icMemo: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            title: { type: 'string' as const },
            sections: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                additionalProperties: false,
                properties: {
                  heading: { type: 'string' as const },
                  content: { type: 'string' as const },
                },
                required: ['heading', 'content'],
              },
            },
          },
          required: ['title', 'sections'],
        },
        transcriptAnnotations: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            additionalProperties: false,
            properties: {
              quote: { type: 'string' as const },
              type: { type: 'string' as const, enum: ['risk', 'signal', 'metric', 'competitor'] },
              label: { type: 'string' as const },
            },
            required: ['quote', 'type', 'label'],
          },
        },
      },
      required: [
        'header', 'executiveSummary', 'founderAnalysis', 'riskDashboard',
        'competitiveIntelligence', 'questionCoverage', 'dealStrengthScore',
        'icMemo', 'transcriptAnnotations',
      ],
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'deal_intelligence_report',
            strict: true,
            schema: intelligenceSchema,
          },
        },
        messages: [
          {
            role: 'system',
            content: `You are an elite VC analyst producing a Deal Intelligence Report. Given a call transcript, startup data, and VC thesis, produce a comprehensive structured analysis. Be evidence-based and cite transcript quotes where applicable. Scores should be 0-100. For founderAnalysis, evaluate dimensions: Domain Expertise, Communication Clarity, Vision & Ambition, Coachability, Technical Depth, and Market Understanding. For questionCoverage areas, evaluate: Team & Founders, Product & Technology, Market & Competition, Business Model & Unit Economics, Traction & Metrics, Fundraising & Use of Funds. Return valid JSON only.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              companyName,
              callDate,
              vcThesis,
              startupData: submissionData,
              existingFitEvaluation: fitEvaluation,
              callSummary: summaryRow ? {
                overallSummary: summaryRow.overall_summary,
                keyPoints: summaryRow.key_points,
                actionItems: summaryRow.action_items,
                concerns: summaryRow.concerns,
                nextSteps: summaryRow.next_steps,
                founderImpressions: summaryRow.founder_impressions,
              } : null,
              transcript: truncatedTranscript,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[INTELLIGENCE REPORT] OpenAI error:', response.status, errBody);
      return c.json({ success: false, error: `AI generation failed (HTTP ${response.status})` }, 500);
    }

    const aiResult = await response.json();
    const content = aiResult?.choices?.[0]?.message?.content;
    if (!content) {
      return c.json({ success: false, error: 'Empty AI response' }, 500);
    }

    let report: Record<string, unknown>;
    try {
      report = JSON.parse(content);
    } catch {
      console.error('[INTELLIGENCE REPORT] Failed to parse AI response:', content.substring(0, 500));
      return c.json({ success: false, error: 'Invalid AI response format' }, 500);
    }

    // Upsert into call_intelligence_reports
    const { error: upsertError } = await db
      .from('call_intelligence_reports')
      .upsert({
        call_id: callId,
        owner_user_id: user.id,
        report,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'call_id' });

    if (upsertError) {
      console.error('[INTELLIGENCE REPORT] Upsert error:', upsertError);
      // Still return the report even if caching failed
    }

    return c.json({ success: true, report, cached: false });
  } catch (error) {
    console.error('[INTELLIGENCE REPORT GENERATE] Error:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);
