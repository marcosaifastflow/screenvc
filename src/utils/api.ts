import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase/client';
import type { FormQuestion, VCThesis } from '../components/FormBuilder';

const API_BASE_URL = import.meta.env.DEV
  ? '/api/functions/make-server-26821bbd'
  : `${SUPABASE_URL}/functions/v1/make-server-26821bbd`;

const buildHeaders = (authToken: string, includeJson = true) => {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'x-user-jwt': authToken,
  };

  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getErrorMessage = (result: Record<string, unknown>, fallback: string) =>
  typeof result.error === 'string' ? result.error : fallback;

const toStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const normalizeThesis = (value: unknown): VCThesis => {
  if (!isObject(value)) {
    return { stage: [], sectors: [], geography: [], customCriteria: '' };
  }

  return {
    stage: toStringArray(value.stage),
    sectors: toStringArray(value.sectors),
    geography: toStringArray(value.geography),
    minRevenue: typeof value.minRevenue === 'string' ? value.minRevenue : undefined,
    maxRevenue: typeof value.maxRevenue === 'string' ? value.maxRevenue : undefined,
    customCriteria: typeof value.customCriteria === 'string' ? value.customCriteria : '',
  };
};

const sanitizeToken = (token?: string | null) =>
  typeof token === 'string' ? token.trim() : '';

const isJwtLike = (token: string) => token.split('.').length === 3;

const isTokenValidForProject = async (token: string) => {
  if (!token || !isJwtLike(token)) {
    return false;
  }

  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data.user;
};

const getValidAccessToken = async (uiToken?: string | null) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionToken = sanitizeToken(sessionData.session?.access_token);
  if (await isTokenValidForProject(sessionToken)) {
    return sessionToken;
  }

  const trimmedUiToken = sanitizeToken(uiToken);
  if (await isTokenValidForProject(trimmedUiToken)) {
    return trimmedUiToken;
  }

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  const refreshedToken = sanitizeToken(refreshedData.session?.access_token);

  if (!refreshError && await isTokenValidForProject(refreshedToken)) {
    return refreshedToken;
  }

  return null;
};

const safeParseResponse = async (response: Response) => {
  const rawBody = await response.text();
  if (!rawBody) {
    return {} as Record<string, unknown>;
  }
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { error: rawBody } as Record<string, unknown>;
  }
};

// ========================================
// PUBLISH FORM (SERVER API WITH AUTH)
// ========================================

interface PublishFormParams {
  oldFormId?: string;
  formName: string;
  questions: FormQuestion[];
  thesis: VCThesis;
  accessToken?: string;
}

interface SaveCriteriaParams {
  thesis: VCThesis;
  accessToken?: string | null;
}

interface ToggleFavoriteParams {
  formId: string;
  submissionId: string;
  accessToken?: string | null;
}

export interface FitCriterionResult {
  criteria: string;
  status: 'Fit' | 'Partial Fit' | 'Not a Fit';
  detail: string;
}

export interface MarketReportSection {
  title: string;
  subtitle: string;
  paragraphs: string[];
  bullets: string[];
}

export interface MarketReportConclusion {
  title: string;
  paragraphs: string[];
  finalStatement: string;
}

export interface MarketReport {
  title: string;
  sections: MarketReportSection[];
  conclusion: MarketReportConclusion;
  companyName: string;
  industry: string;
  oneLiner: string;
  generatedAt: string;
}

export interface FinalConclusion {
  title: string;
  mode: 'pre_report' | 'with_report';
  verdict: string;
  confidence: string;
  paragraphs: string[];
  recommendation: string;
  generatedAt: string;
}

export interface ApplicationEmailDraft {
  toEmail: string;
  subject: string;
  body: string;
  emailType: 'rejection' | 'next_stage';
}

export interface EmailThread {
  threadId: string;
  startupEmail: string;
  companyName: string;
  submissionId: string;
  latestSubject: string;
  latestPreview: string;
  latestAt: string;
  messageCount: number;
}

export interface EmailThreadMessage {
  id: string;
  threadId: string;
  direction: 'inbound' | 'outbound';
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  createdAt: string;
  providerStatus: string;
  submissionId: string;
  companyName: string;
}

export interface ScheduledCall {
  id: string;
  companyName: string;
  startupEmail: string;
  vcEmail: string;
  scheduledAt: string;
  timezone: string;
  durationMinutes: number;
  meetLink: string;
  status: string;
  notes: string;
  submissionId: string;
}

export interface LinkedEmailAccount {
  linkedEmail: string;
  displayName: string;
  isLinked: boolean;
  fallbackEmail: string;
}

export interface MailboxStatus {
  connected: boolean;
  provider: 'google' | 'microsoft' | null;
  email: string;
  fallbackEmail: string;
  lastSyncedAt: string | null;
}

const normalizeMarketReport = (value: unknown): MarketReport | null => {
  if (!isObject(value)) {
    return null;
  }

  const sections = Array.isArray(value.sections)
    ? value.sections
        .filter(isObject)
        .map((section): MarketReportSection => ({
          title: typeof section.title === 'string' ? section.title : 'Section',
          subtitle: typeof section.subtitle === 'string' ? section.subtitle : '',
          paragraphs: Array.isArray(section.paragraphs)
            ? section.paragraphs.filter((line): line is string => typeof line === 'string')
            : [],
          bullets: Array.isArray(section.bullets)
            ? section.bullets.filter((line): line is string => typeof line === 'string')
            : [],
        }))
    : [];

  const conclusionRaw = isObject(value.conclusion) ? value.conclusion : {};

  return {
    title: typeof value.title === 'string' ? value.title : 'Investment Memorandum',
    sections,
    conclusion: {
      title: typeof conclusionRaw.title === 'string' ? conclusionRaw.title : 'Conclusion',
      paragraphs: Array.isArray(conclusionRaw.paragraphs)
        ? conclusionRaw.paragraphs.filter((line): line is string => typeof line === 'string')
        : [],
      finalStatement:
        typeof conclusionRaw.finalStatement === 'string' ? conclusionRaw.finalStatement : '',
    },
    companyName: typeof value.companyName === 'string' ? value.companyName : 'Company',
    industry: typeof value.industry === 'string' ? value.industry : 'Industry',
    oneLiner: typeof value.oneLiner === 'string' ? value.oneLiner : '',
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : new Date().toISOString(),
  };
};

const normalizeFinalConclusion = (value: unknown): FinalConclusion | null => {
  if (!isObject(value)) {
    return null;
  }

  const mode = value.mode === 'with_report' ? 'with_report' : 'pre_report';

  return {
    title: typeof value.title === 'string' ? value.title : 'Final Conclusions',
    mode,
    verdict: typeof value.verdict === 'string' ? value.verdict : 'Pending',
    confidence: typeof value.confidence === 'string' ? value.confidence : 'Low',
    paragraphs: Array.isArray(value.paragraphs)
      ? value.paragraphs.filter((line): line is string => typeof line === 'string')
      : [],
    recommendation: typeof value.recommendation === 'string' ? value.recommendation : '',
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : new Date().toISOString(),
  };
};

export async function publishForm(params: PublishFormParams) {
  try {
    const accessToken = await getValidAccessToken(params.accessToken);
    if (!accessToken) {
      console.error('[PUBLISH] No access token in session');
      return { success: false, error: 'No access token available' };
    }

    console.log('[PUBLISH] API URL:', `${API_BASE_URL}/forms/publish`);

    const doPublishRequest = (token: string) => fetch(`${API_BASE_URL}/forms/publish`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({
        oldFormId: params.oldFormId,
        formName: params.formName,
        questions: params.questions,
        thesis: params.thesis,
      }),
    });

    let response = await doPublishRequest(accessToken);

    if (response.status === 401) {
      console.warn('[PUBLISH] 401 received, attempting refresh');
      const refreshedToken = await getValidAccessToken(null);
      if (refreshedToken) {
        response = await doPublishRequest(refreshedToken);
      }
    }

    const result = await safeParseResponse(response);

    if (!response.ok) {
      console.error('[PUBLISH ERROR] Status:', response.status);
      console.error('[PUBLISH ERROR] Response:', JSON.stringify(result));
      const errorMessage = getErrorMessage(
        result,
        `Failed to publish form (HTTP ${response.status})`,
      );
      return { success: false, error: errorMessage };
    }

    console.log('[PUBLISH] Success:', result);
    return {
      success: true,
      formId: typeof result.formId === 'string' ? result.formId : undefined,
      message: typeof result.message === 'string' ? result.message : undefined,
    };
  } catch (error) {
    console.error('[PUBLISH EXCEPTION]', error);
    return { success: false, error: String(error) };
  }
}

export async function saveThesisCriteria(params: SaveCriteriaParams) {
  try {
    const accessToken = await getValidAccessToken(params.accessToken);
    if (!accessToken) {
      return { success: false, error: 'No access token available' };
    }

    const response = await fetch(`${API_BASE_URL}/criteria/save`, {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({ thesis: params.thesis }),
    });

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to save criteria'),
      };
    }

    return { success: true };
  } catch (error) {
    console.error('[SAVE CRITERIA EXCEPTION]', error);
    return { success: false, error: String(error) };
  }
}

export async function getSavedThesisCriteria(accessToken?: string | null) {
  try {
    const validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available', thesis: null as VCThesis | null };
    }

    const response = await fetch(`${API_BASE_URL}/criteria`, {
      method: 'GET',
      headers: buildHeaders(validToken, false),
    });

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load criteria'),
        thesis: null as VCThesis | null,
      };
    }

    return { success: true, thesis: normalizeThesis(result.thesis) };
  } catch (error) {
    console.error('[GET CRITERIA EXCEPTION]', error);
    return { success: false, error: String(error), thesis: null as VCThesis | null };
  }
}

export async function getFormFavorites(formId: string, accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available', favorites: [] as string[] };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/forms/${formId}/favorites`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }
    if (response.status === 404) {
      return {
        success: false,
        error: 'Favorites endpoint not deployed. Deploy function make-server-26821bbd.',
        favorites: [] as string[],
      };
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load favorites'),
        favorites: [] as string[],
      };
    }

    const favorites = Array.isArray(result.favorites)
      ? result.favorites.filter((id): id is string => typeof id === 'string')
      : [];
    return { success: true, favorites };
  } catch (error) {
    console.error('[GET FAVORITES EXCEPTION]', error);
    return { success: false, error: String(error), favorites: [] as string[] };
  }
}

export async function toggleFavoriteSubmission(params: ToggleFavoriteParams) {
  try {
    let validToken = await getValidAccessToken(params.accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        favorites: [] as string[],
        isFavorite: false,
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/forms/${params.formId}/favorites/toggle`, {
        method: 'POST',
        headers: buildHeaders(token),
        body: JSON.stringify({ submissionId: params.submissionId }),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }
    if (response.status === 404) {
      return {
        success: false,
        error: 'Favorites endpoint not deployed. Deploy function make-server-26821bbd.',
        favorites: [] as string[],
        isFavorite: false,
      };
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to update favorite'),
        favorites: [] as string[],
        isFavorite: false,
      };
    }

    const favorites = Array.isArray(result.favorites)
      ? result.favorites.filter((id): id is string => typeof id === 'string')
      : [];

    return {
      success: true,
      favorites,
      isFavorite: Boolean(result.isFavorite),
    };
  } catch (error) {
    console.error('[TOGGLE FAVORITE EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      favorites: [] as string[],
      isFavorite: false,
    };
  }
}

export async function evaluateApplicationFit(
  formId: string,
  submissionId: string,
  accessToken?: string | null,
) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        results: [] as FitCriterionResult[],
        summary: '',
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/forms/${formId}/submissions/${submissionId}/evaluate-fit`, {
        method: 'POST',
        headers: buildHeaders(token),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    if (response.status === 404) {
      return {
        success: false,
        error: 'AI fit endpoint not deployed. Deploy function make-server-26821bbd.',
        results: [] as FitCriterionResult[],
        summary: '',
      };
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to evaluate application fit'),
        results: [] as FitCriterionResult[],
        summary: '',
      };
    }

    const results = Array.isArray(result.results)
      ? result.results
          .filter(isObject)
          .map((item): FitCriterionResult => ({
            criteria: typeof item.criteria === 'string' ? item.criteria : 'Criteria',
            status:
              item.status === 'Fit' || item.status === 'Partial Fit' || item.status === 'Not a Fit'
                ? item.status
                : 'Partial Fit',
            detail: typeof item.detail === 'string' ? item.detail : '',
          }))
      : [];

    return {
      success: true,
      results,
      summary: typeof result.summary === 'string' ? result.summary : '',
    };
  } catch (error) {
    console.error('[EVALUATE FIT EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      results: [] as FitCriterionResult[],
      summary: '',
    };
  }
}

export async function getApplicationMarketReport(
  formId: string,
  submissionId: string,
  accessToken?: string | null,
) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        report: null as MarketReport | null,
        cached: false,
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/forms/${formId}/submissions/${submissionId}/market-report`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load market report'),
        report: null as MarketReport | null,
        cached: false,
      };
    }

    return {
      success: true,
      report: normalizeMarketReport(result.report),
      cached: Boolean(result.cached),
    };
  } catch (error) {
    console.error('[GET MARKET REPORT EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      report: null as MarketReport | null,
      cached: false,
    };
  }
}

export async function generateApplicationMarketReport(
  formId: string,
  submissionId: string,
  accessToken?: string | null,
) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        report: null as MarketReport | null,
        cached: false,
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/forms/${formId}/submissions/${submissionId}/market-report/generate`, {
        method: 'POST',
        headers: buildHeaders(token),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to generate market report'),
        report: null as MarketReport | null,
        cached: false,
      };
    }

    return {
      success: true,
      report: normalizeMarketReport(result.report),
      cached: Boolean(result.cached),
    };
  } catch (error) {
    console.error('[GENERATE MARKET REPORT EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      report: null as MarketReport | null,
      cached: false,
    };
  }
}

export async function generateApplicationFinalConclusion(
  formId: string,
  submissionId: string,
  accessToken?: string | null,
) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        conclusion: null as FinalConclusion | null,
        mode: 'pre_report' as const,
        cached: false,
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/forms/${formId}/submissions/${submissionId}/final-conclusion/generate`, {
        method: 'POST',
        headers: buildHeaders(token),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to generate final conclusion'),
        conclusion: null as FinalConclusion | null,
        mode: 'pre_report' as const,
        cached: false,
      };
    }

    return {
      success: true,
      conclusion: normalizeFinalConclusion(result.conclusion),
      mode: result.mode === 'with_report' ? 'with_report' : 'pre_report',
      cached: Boolean(result.cached),
    };
  } catch (error) {
    console.error('[GENERATE FINAL CONCLUSION EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      conclusion: null as FinalConclusion | null,
      mode: 'pre_report' as const,
      cached: false,
    };
  }
}

export async function generateApplicationEmailDraft(
  formId: string,
  submissionId: string,
  accessToken?: string | null,
) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        draft: null as ApplicationEmailDraft | null,
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/forms/${formId}/submissions/${submissionId}/email/generate`, {
        method: 'POST',
        headers: buildHeaders(token),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success || !isObject(result.draft)) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to generate email draft'),
        draft: null as ApplicationEmailDraft | null,
      };
    }

    const draft: ApplicationEmailDraft = {
      toEmail: typeof result.draft.toEmail === 'string' ? result.draft.toEmail : '',
      subject: typeof result.draft.subject === 'string' ? result.draft.subject : '',
      body: typeof result.draft.body === 'string' ? result.draft.body : '',
      emailType: result.draft.emailType === 'rejection' ? 'rejection' : 'next_stage',
    };

    return { success: true, draft };
  } catch (error) {
    console.error('[GENERATE EMAIL DRAFT EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      draft: null as ApplicationEmailDraft | null,
    };
  }
}

export async function sendApplicationEmail(params: {
  formId: string;
  submissionId: string;
  subject: string;
  body: string;
  threadId?: string;
  accessToken?: string | null;
}) {
  try {
    let validToken = await getValidAccessToken(params.accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        threadId: '',
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/forms/${params.formId}/submissions/${params.submissionId}/email/send`, {
        method: 'POST',
        headers: buildHeaders(token),
        body: JSON.stringify({
          subject: params.subject,
          body: params.body,
          threadId: params.threadId,
        }),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to send email'),
        threadId: '',
      };
    }

    return {
      success: true,
      threadId: typeof result.threadId === 'string' ? result.threadId : '',
    };
  } catch (error) {
    console.error('[SEND APPLICATION EMAIL EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      threadId: '',
    };
  }
}

export async function getEmailThreads(accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        threads: [] as EmailThread[],
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/emails`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load email threads'),
        threads: [] as EmailThread[],
      };
    }

    const threads = Array.isArray(result.threads)
      ? result.threads.filter(isObject).map((thread): EmailThread => ({
          threadId: typeof thread.threadId === 'string' ? thread.threadId : crypto.randomUUID(),
          startupEmail: typeof thread.startupEmail === 'string' ? thread.startupEmail : '',
          companyName: typeof thread.companyName === 'string' ? thread.companyName : 'Startup',
          submissionId: typeof thread.submissionId === 'string' ? thread.submissionId : '',
          latestSubject: typeof thread.latestSubject === 'string' ? thread.latestSubject : '',
          latestPreview: typeof thread.latestPreview === 'string' ? thread.latestPreview : '',
          latestAt: typeof thread.latestAt === 'string' ? thread.latestAt : new Date().toISOString(),
          messageCount: typeof thread.messageCount === 'number' ? thread.messageCount : 0,
        }))
      : [];

    return { success: true, threads };
  } catch (error) {
    console.error('[GET EMAIL THREADS EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      threads: [] as EmailThread[],
    };
  }
}

export async function getEmailThreadMessages(threadId: string, accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        messages: [] as EmailThreadMessage[],
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/emails/${encodeURIComponent(threadId)}/messages`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load thread messages'),
        messages: [] as EmailThreadMessage[],
      };
    }

    const messages = Array.isArray(result.messages)
      ? result.messages.filter(isObject).map((message): EmailThreadMessage => ({
          id: typeof message.id === 'string' ? message.id : crypto.randomUUID(),
          threadId: typeof message.threadId === 'string' ? message.threadId : threadId,
          direction: message.direction === 'inbound' ? 'inbound' : 'outbound',
          fromEmail: typeof message.fromEmail === 'string' ? message.fromEmail : '',
          toEmail: typeof message.toEmail === 'string' ? message.toEmail : '',
          subject: typeof message.subject === 'string' ? message.subject : '',
          body: typeof message.body === 'string' ? message.body : '',
          createdAt: typeof message.createdAt === 'string' ? message.createdAt : new Date().toISOString(),
          providerStatus: typeof message.providerStatus === 'string' ? message.providerStatus : '',
          submissionId: typeof message.submissionId === 'string' ? message.submissionId : '',
          companyName: typeof message.companyName === 'string' ? message.companyName : 'Startup',
        }))
      : [];

    return { success: true, messages };
  } catch (error) {
    console.error('[GET EMAIL THREAD MESSAGES EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      messages: [] as EmailThreadMessage[],
    };
  }
}

export async function replyToEmailThread(params: {
  threadId: string;
  subject: string;
  body: string;
  accessToken?: string | null;
}) {
  try {
    let validToken = await getValidAccessToken(params.accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available' };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/emails/${encodeURIComponent(params.threadId)}/reply`, {
        method: 'POST',
        headers: buildHeaders(token),
        body: JSON.stringify({ subject: params.subject, body: params.body }),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return { success: false, error: getErrorMessage(result, 'Failed to send reply') };
    }

    return { success: true };
  } catch (error) {
    console.error('[REPLY EMAIL THREAD EXCEPTION]', error);
    return { success: false, error: String(error) };
  }
}

export async function scheduleApplicationCall(params: {
  formId: string;
  submissionId: string;
  date: string;
  time: string;
  timezone: string;
  durationMinutes?: number;
  notes?: string;
  accessToken?: string | null;
}) {
  try {
    let validToken = await getValidAccessToken(params.accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        call: null as ScheduledCall | null,
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/forms/${params.formId}/submissions/${params.submissionId}/calls/schedule`, {
        method: 'POST',
        headers: buildHeaders(token),
        body: JSON.stringify({
          date: params.date,
          time: params.time,
          timezone: params.timezone,
          durationMinutes: params.durationMinutes,
          notes: params.notes,
        }),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success || !isObject(result.call)) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to schedule call'),
        call: null as ScheduledCall | null,
      };
    }

    const call: ScheduledCall = {
      id: typeof result.call.id === 'string' ? result.call.id : crypto.randomUUID(),
      companyName: typeof result.call.companyName === 'string' ? result.call.companyName : 'Startup',
      startupEmail: typeof result.call.startupEmail === 'string' ? result.call.startupEmail : '',
      vcEmail: typeof result.call.vcEmail === 'string' ? result.call.vcEmail : '',
      scheduledAt: typeof result.call.scheduledAt === 'string' ? result.call.scheduledAt : new Date().toISOString(),
      timezone: typeof result.call.timezone === 'string' ? result.call.timezone : 'UTC',
      durationMinutes: typeof result.call.durationMinutes === 'number' ? result.call.durationMinutes : 30,
      meetLink: typeof result.call.meetLink === 'string' ? result.call.meetLink : '',
      status: typeof result.call.status === 'string' ? result.call.status : 'scheduled',
      notes: typeof result.call.notes === 'string' ? result.call.notes : '',
      submissionId: typeof result.call.submissionId === 'string' ? result.call.submissionId : params.submissionId,
    };

    return { success: true, call };
  } catch (error) {
    console.error('[SCHEDULE CALL EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      call: null as ScheduledCall | null,
    };
  }
}

export async function getCalls(accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        calls: [] as ScheduledCall[],
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/calls`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load calls'),
        calls: [] as ScheduledCall[],
      };
    }

    const calls = Array.isArray(result.calls)
      ? result.calls.filter(isObject).map((call): ScheduledCall => ({
          id: typeof call.id === 'string' ? call.id : crypto.randomUUID(),
          companyName: typeof call.companyName === 'string' ? call.companyName : 'Startup',
          startupEmail: typeof call.startupEmail === 'string' ? call.startupEmail : '',
          vcEmail: typeof call.vcEmail === 'string' ? call.vcEmail : '',
          scheduledAt: typeof call.scheduledAt === 'string' ? call.scheduledAt : new Date().toISOString(),
          timezone: typeof call.timezone === 'string' ? call.timezone : 'UTC',
          durationMinutes: typeof call.durationMinutes === 'number' ? call.durationMinutes : 30,
          meetLink: typeof call.meetLink === 'string' ? call.meetLink : '',
          status: typeof call.status === 'string' ? call.status : 'scheduled',
          notes: typeof call.notes === 'string' ? call.notes : '',
          submissionId: typeof call.submissionId === 'string' ? call.submissionId : '',
        }))
      : [];

    return { success: true, calls };
  } catch (error) {
    console.error('[GET CALLS EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      calls: [] as ScheduledCall[],
    };
  }
}

export async function getLinkedEmailAccount(accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        account: null as LinkedEmailAccount | null,
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/email-account`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load linked email account'),
        account: null as LinkedEmailAccount | null,
      };
    }

    return {
      success: true,
      account: {
        linkedEmail: typeof result.linkedEmail === 'string' ? result.linkedEmail : '',
        displayName: typeof result.displayName === 'string' ? result.displayName : '',
        isLinked: Boolean(result.isLinked),
        fallbackEmail: typeof result.fallbackEmail === 'string' ? result.fallbackEmail : '',
      },
    };
  } catch (error) {
    console.error('[GET LINKED EMAIL ACCOUNT EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      account: null as LinkedEmailAccount | null,
    };
  }
}

export async function getMailboxStatus(accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return {
        success: false,
        error: 'No access token available',
        status: null as MailboxStatus | null,
      };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/mailbox/status`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load mailbox status'),
        status: null as MailboxStatus | null,
      };
    }

    return {
      success: true,
      status: {
        connected: Boolean(result.connected),
        provider: (result.provider === 'microsoft' ? 'microsoft' : result.provider === 'google' ? 'google' : null) as MailboxStatus['provider'],
        email: typeof result.email === 'string' ? result.email : '',
        fallbackEmail: typeof result.fallbackEmail === 'string' ? result.fallbackEmail : '',
        lastSyncedAt: typeof result.lastSyncedAt === 'string' ? result.lastSyncedAt : null,
      } satisfies MailboxStatus,
    };
  } catch (error) {
    console.error('[GET MAILBOX STATUS EXCEPTION]', error);
    return {
      success: false,
      error: String(error),
      status: null as MailboxStatus | null,
    };
  }
}

export async function getMailboxConnectUrl(
  provider: 'google' | 'microsoft',
  accessToken?: string | null,
) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available', url: '' };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/mailbox/connect-url?provider=${provider}`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success || typeof result.url !== 'string') {
      return { success: false, error: getErrorMessage(result, 'Failed to create mailbox connect URL'), url: '' };
    }

    return { success: true, url: result.url };
  } catch (error) {
    console.error('[GET MAILBOX CONNECT URL EXCEPTION]', error);
    return { success: false, error: String(error), url: '' };
  }
}

export async function disconnectMailbox(accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available' };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/mailbox/disconnect`, {
        method: 'POST',
        headers: buildHeaders(token),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return { success: false, error: getErrorMessage(result, 'Failed to disconnect mailbox') };
    }

    return { success: true };
  } catch (error) {
    console.error('[DISCONNECT MAILBOX EXCEPTION]', error);
    return { success: false, error: String(error) };
  }
}

export async function syncMailbox(accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available' };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/mailbox/sync`, {
        method: 'POST',
        headers: buildHeaders(token),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return { success: false, error: getErrorMessage(result, 'Failed to sync mailbox') };
    }

    return { success: true };
  } catch (error) {
    console.error('[SYNC MAILBOX EXCEPTION]', error);
    return { success: false, error: String(error) };
  }
}

export async function linkEmailAccount(params: {
  email: string;
  displayName?: string;
  accessToken?: string | null;
}) {
  try {
    let validToken = await getValidAccessToken(params.accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available' };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/email-account/link`, {
        method: 'POST',
        headers: buildHeaders(token),
        body: JSON.stringify({
          email: params.email,
          displayName: params.displayName,
        }),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return { success: false, error: getErrorMessage(result, 'Failed to link email account') };
    }

    return { success: true };
  } catch (error) {
    console.error('[LINK EMAIL ACCOUNT EXCEPTION]', error);
    return { success: false, error: String(error) };
  }
}

export async function unlinkEmailAccount(accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available' };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/communications/email-account/unlink`, {
        method: 'POST',
        headers: buildHeaders(token),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return { success: false, error: getErrorMessage(result, 'Failed to unlink email account') };
    }

    return { success: true };
  } catch (error) {
    console.error('[UNLINK EMAIL ACCOUNT EXCEPTION]', error);
    return { success: false, error: String(error) };
  }
}

// ========================================
// NOTETAKER BOT
// ========================================

export interface NotetakerSession {
  id: string;
  callId: string;
  status: 'requesting' | 'joining' | 'recording' | 'processing' | 'completed' | 'failed';
  botName: string;
  errorMessage: string | null;
  requestedAt: string | null;
  joinedAt: string | null;
  endedAt: string | null;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface CallTranscript {
  id: string;
  callId: string;
  fullText: string;
  segments: TranscriptSegment[];
  durationSeconds: number | null;
  wordCount: number | null;
  createdAt: string;
}

export interface CallSummary {
  id: string;
  callId: string;
  overallSummary: string;
  keyPoints: string[];
  actionItems: string[];
  founderImpressions: string;
  concerns: string[];
  nextSteps: string[];
  createdAt: string;
}

export async function sendNotetaker(callId: string, accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available', sessionId: '', status: '' };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/calls/${encodeURIComponent(callId)}/notetaker/send`, {
        method: 'POST',
        headers: buildHeaders(token),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to send notetaker'),
        sessionId: typeof result.sessionId === 'string' ? result.sessionId : '',
        status: typeof result.status === 'string' ? result.status : '',
      };
    }

    return {
      success: true,
      sessionId: typeof result.sessionId === 'string' ? result.sessionId : '',
      status: typeof result.status === 'string' ? result.status : 'requesting',
    };
  } catch (error) {
    console.error('[SEND NOTETAKER EXCEPTION]', error);
    return { success: false, error: String(error), sessionId: '', status: '' };
  }
}

export async function getNotetakerStatus(callId: string, accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available', session: null as NotetakerSession | null };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/calls/${encodeURIComponent(callId)}/notetaker/status`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to get notetaker status'),
        session: null as NotetakerSession | null,
      };
    }

    if (!result.session || !isObject(result.session)) {
      return { success: true, session: null as NotetakerSession | null };
    }

    const s = result.session;
    return {
      success: true,
      session: {
        id: typeof s.id === 'string' ? s.id : '',
        callId: typeof s.callId === 'string' ? s.callId : callId,
        status: (['requesting', 'joining', 'recording', 'processing', 'completed', 'failed'].includes(s.status as string)
          ? s.status
          : 'requesting') as NotetakerSession['status'],
        botName: typeof s.botName === 'string' ? s.botName : 'ScreenVC Notetaker',
        errorMessage: typeof s.errorMessage === 'string' ? s.errorMessage : null,
        requestedAt: typeof s.requestedAt === 'string' ? s.requestedAt : null,
        joinedAt: typeof s.joinedAt === 'string' ? s.joinedAt : null,
        endedAt: typeof s.endedAt === 'string' ? s.endedAt : null,
      } satisfies NotetakerSession,
    };
  } catch (error) {
    console.error('[GET NOTETAKER STATUS EXCEPTION]', error);
    return { success: false, error: String(error), session: null as NotetakerSession | null };
  }
}

export async function getCallTranscript(callId: string, accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available', transcript: null as CallTranscript | null };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/calls/${encodeURIComponent(callId)}/transcript`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load transcript'),
        transcript: null as CallTranscript | null,
      };
    }

    if (!result.transcript || !isObject(result.transcript)) {
      return { success: true, transcript: null as CallTranscript | null };
    }

    const t = result.transcript;
    return {
      success: true,
      transcript: {
        id: typeof t.id === 'string' ? t.id : '',
        callId: typeof t.callId === 'string' ? t.callId : callId,
        fullText: typeof t.fullText === 'string' ? t.fullText : '',
        segments: Array.isArray(t.segments)
          ? t.segments.filter(isObject).map((seg): TranscriptSegment => ({
              start: typeof seg.start === 'number' ? seg.start : 0,
              end: typeof seg.end === 'number' ? seg.end : 0,
              text: typeof seg.text === 'string' ? seg.text : '',
              speaker: typeof seg.speaker === 'string' ? seg.speaker : undefined,
            }))
          : [],
        durationSeconds: typeof t.durationSeconds === 'number' ? t.durationSeconds : null,
        wordCount: typeof t.wordCount === 'number' ? t.wordCount : null,
        createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      } satisfies CallTranscript,
    };
  } catch (error) {
    console.error('[GET TRANSCRIPT EXCEPTION]', error);
    return { success: false, error: String(error), transcript: null as CallTranscript | null };
  }
}

export async function getCallSummary(callId: string, accessToken?: string | null) {
  try {
    let validToken = await getValidAccessToken(accessToken);
    if (!validToken) {
      return { success: false, error: 'No access token available', summary: null as CallSummary | null };
    }

    const doRequest = (token: string) =>
      fetch(`${API_BASE_URL}/calls/${encodeURIComponent(callId)}/summary`, {
        method: 'GET',
        headers: buildHeaders(token, false),
      });

    let response = await doRequest(validToken);
    if (response.status === 401) {
      validToken = await getValidAccessToken(null);
      if (validToken) {
        response = await doRequest(validToken);
      }
    }

    const result = await safeParseResponse(response);
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load summary'),
        summary: null as CallSummary | null,
      };
    }

    if (!result.summary || !isObject(result.summary)) {
      return { success: true, summary: null as CallSummary | null };
    }

    const s = result.summary;
    const toStringArr = (val: unknown) =>
      Array.isArray(val) ? val.filter((item): item is string => typeof item === 'string') : [];

    return {
      success: true,
      summary: {
        id: typeof s.id === 'string' ? s.id : '',
        callId: typeof s.callId === 'string' ? s.callId : callId,
        overallSummary: typeof s.overallSummary === 'string' ? s.overallSummary : '',
        keyPoints: toStringArr(s.keyPoints),
        actionItems: toStringArr(s.actionItems),
        founderImpressions: typeof s.founderImpressions === 'string' ? s.founderImpressions : '',
        concerns: toStringArr(s.concerns),
        nextSteps: toStringArr(s.nextSteps),
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
      } satisfies CallSummary,
    };
  } catch (error) {
    console.error('[GET SUMMARY EXCEPTION]', error);
    return { success: false, error: String(error), summary: null as CallSummary | null };
  }
}

// ========================================
// AUTH USER FORM LOAD (ONE FORM PER USER)
// ========================================

interface StoredUserForm {
  formId: string;
  formName: string;
  questions: FormQuestion[];
  thesis: VCThesis;
  status?: 'active' | 'inactive';
  updatedAt?: string;
  publishedAt?: string;
}

interface FormSubmission {
  submissionId: string;
  formId: string;
  data: Record<string, string | string[]>;
  isHighLevel: boolean;
  isHighValue?: boolean;
  submittedAt: string;
}

const normalizeSubmissionData = (value: unknown): Record<string, string | string[]> => {
  if (!isObject(value)) {
    return {};
  }

  const result: Record<string, string | string[]> = {};
  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'string') {
      result[key] = item;
      return;
    }

    if (Array.isArray(item)) {
      result[key] = item.filter((entry): entry is string => typeof entry === 'string');
    }
  });

  return result;
};

export async function getUserPrimaryForm(accessToken?: string | null) {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const validToken = await getValidAccessToken(accessToken ?? session?.access_token ?? null);

    if (sessionError || !session?.user || !validToken) {
      return { success: false, error: 'Not authenticated', form: null as StoredUserForm | null };
    }

    const doFormsRequest = (token: string) => fetch(`${API_BASE_URL}/forms`, {
      method: 'GET',
      headers: buildHeaders(token, false),
    });

    let response: Response = await doFormsRequest(validToken);

    if (response.status === 401) {
      const refreshedToken = await getValidAccessToken(null);
      if (refreshedToken) {
        response = await doFormsRequest(refreshedToken);
      }
    }

    const result = await safeParseResponse(response);

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load forms'),
        form: null as StoredUserForm | null,
      };
    }

    const forms = Array.isArray(result.forms) ? (result.forms as StoredUserForm[]) : [];

    if (forms.length === 0) {
      return { success: true, form: null as StoredUserForm | null };
    }

    const sortedForms = [...forms].sort((a, b) => {
      const aDate = new Date(a.updatedAt || a.publishedAt || 0).getTime();
      const bDate = new Date(b.updatedAt || b.publishedAt || 0).getTime();
      return bDate - aDate;
    });

    return { success: true, form: sortedForms[0] };
  } catch (error) {
    console.error('[GET USER FORM EXCEPTION]', error);
    return { success: false, error: String(error), form: null as StoredUserForm | null };
  }
}

// ========================================
// PUBLIC FORM LOAD (ANON SAFE)
// ========================================

export async function getForm(formId: string, accessToken?: string | null) {
  try {
    const validToken = await getValidAccessToken(accessToken);
    const headers: Record<string, string> = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };

    if (validToken) {
      headers['x-user-jwt'] = validToken;
    }

    const response = await fetch(`${API_BASE_URL}/forms/${formId}`, {
      method: 'GET',
      headers,
    });

    const result = await safeParseResponse(response);
    const formPayload = isObject(result.form) ? result.form : null;

    if (!response.ok || !result.success || !formPayload) {
      console.error('[GET FORM ERROR]', result);
      return { success: false, error: getErrorMessage(result, 'Form not found') };
    }

    const questions = Array.isArray(formPayload.questions)
      ? (formPayload.questions as FormQuestion[]).map((question) => ({
          ...question,
          allowMultiple: question.type === 'select' ? Boolean(question.allowMultiple) : false,
          locked: Boolean(question.locked),
        }))
      : [];
    const thesis = normalizeThesis(formPayload.thesis);

    return {
      success: true,
      form: {
        formId: typeof formPayload.formId === 'string' ? formPayload.formId : formId,
        formName: typeof formPayload.formName === 'string' ? formPayload.formName : 'Application Form',
        questions,
        thesis,
      },
    };
  } catch (error) {
    console.error('[GET FORM EXCEPTION]', error);
    return { success: false, error: String(error) };
  }
}

// ========================================
// PUBLIC SUBMISSION
// ========================================

export async function submitForm(
  formId: string,
  formData: Record<string, string | string[]>
) {
  try {
    const response = await fetch(`${API_BASE_URL}/forms/${formId}/submit`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: formData }),
    });

    const result = await safeParseResponse(response);

    if (!response.ok) {
      console.error('[SUBMIT ERROR]', result);
      return { success: false, error: getErrorMessage(result, 'Failed to submit form') };
    }

    return {
      success: true,
      submissionId: typeof result.submissionId === 'string' ? result.submissionId : '',
    };
  } catch (error) {
    console.error('[SUBMIT EXCEPTION]', error);
    return { success: false, error: String(error) };
  }
}

export async function getFormSubmissions(formId: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/forms/${formId}/submissions`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    const result = await safeParseResponse(response);

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: getErrorMessage(result, 'Failed to load submissions'),
        submissions: [] as FormSubmission[],
      };
    }

    const rawSubmissions = Array.isArray(result.submissions) ? result.submissions : [];
    const submissions: FormSubmission[] = rawSubmissions
      .filter(isObject)
      .map((submission) => ({
        submissionId:
          typeof submission.submissionId === 'string' ? submission.submissionId : crypto.randomUUID(),
        formId: typeof submission.formId === 'string' ? submission.formId : formId,
        data: normalizeSubmissionData(submission.data),
        isHighLevel:
          typeof submission.isHighLevel === 'boolean'
            ? submission.isHighLevel
            : submission.isHighValue !== false,
        isHighValue:
          typeof submission.isHighValue === 'boolean'
            ? submission.isHighValue
            : submission.isHighLevel !== false,
        submittedAt:
          typeof submission.submittedAt === 'string'
            ? submission.submittedAt
            : new Date().toISOString(),
      }))
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    return { success: true, submissions };
  } catch (error) {
    console.error('[GET SUBMISSIONS EXCEPTION]', error);
    return { success: false, error: String(error), submissions: [] as FormSubmission[] };
  }
}
