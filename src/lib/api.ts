import type { AppState, GoalSettings } from './storage';
import type { CalendarState } from './calendar';
import type { History } from './history';
import type { LinkedInExport } from './linkedin-export';
import type {
  Article,
  ArticleState,
  DiscoveredFeed,
  Feed,
  FeedStatus,
  RefreshSummary,
  TriageStatus,
} from './news';
import type { ModelInfo, Profile, ProfileInput, ProfileTest } from './profiles';
import type { Voice } from './voice';
import type { Draft } from './drafts';
import type { TopicGraph } from './topic-graph';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Il server locale non risponde. È avviato con npm run dev?', 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Errore del server (${res.status}).`, res.status);
  }
  return data as T;
}

export const api = {
  getState: () => request<AppState>('GET', '/state'),
  putState: (state: AppState) => request<AppState>('PUT', '/state', state),
  migrate: (state: AppState) => request<AppState>('POST', '/migrate', state),
  resetState: () => request<AppState>('DELETE', '/state'),
  putGoal: (goal: GoalSettings) => request<GoalSettings>('PUT', '/state/goal', goal),
  putCalendar: (calendar: CalendarState) =>
    request<CalendarState>('PUT', '/state/calendar', calendar),
  importExport: (fileName: string, data: LinkedInExport) =>
    request<History>('POST', '/history/import', { fileName, data }),

  discoverFeeds: (url: string) =>
    request<{ feeds: DiscoveredFeed[] }>('POST', '/feeds/discover', { url }),
  importOpml: (opml: string) =>
    request<{ added: number; existing: number; invalid: number }>('POST', '/feeds/opml', { opml }),
  listFeeds: () => request<Feed[]>('GET', '/feeds'),
  addFeed: (url: string, title: string) =>
    request<{ feed: Feed; added: number; error: string | null }>('POST', '/feeds', { url, title }),
  updateFeed: (id: number, patch: { title?: string; enabled?: boolean }) =>
    request<Feed>('PATCH', `/feeds/${id}`, patch),
  deleteFeed: (id: number) => request<null>('DELETE', `/feeds/${id}`),
  refreshFeed: (id: number) =>
    request<{ added: number; error: string | null; feed: Feed }>('POST', `/feeds/${id}/refresh`),
  feedStatus: () => request<FeedStatus>('GET', '/feeds/status'),
  refreshAllFeeds: () => request<RefreshSummary>('POST', '/feeds/refresh'),
  topicGraph: ({ days, archived }: { days: number; archived: boolean }) =>
    request<TopicGraph>('GET', `/articles/graph?days=${days}&archived=${archived}`),
  relatedArticles: (id: number) => request<Article[]>('GET', `/articles/${id}/related`),
  articleCounts: () => request<Record<ArticleState, number>>('GET', '/articles/counts'),
  setArticleState: (id: number, state: Exclude<ArticleState, 'archived'>) =>
    request<Article>('PATCH', `/articles/${id}`, { state }),
  createDraft: (input: { articleIds: number[]; thought: string; profileId?: number }) =>
    request<Draft>('POST', '/drafts', input),
  reviseDraft: (id: number, input: { instruction: string; text: string; profileId?: number }) =>
    request<Draft>('POST', `/drafts/${id}/revise`, input),
  saveDraftToCalendar: (
    id: number,
    input: { text: string; pillarId: string | null; day?: string | null },
  ) => request<Draft>('POST', `/drafts/${id}/save`, input),
  getDraft: (id: number) => request<Draft>('GET', `/drafts/${id}`),
  saveDraftText: (id: number, text: string) =>
    request<{ ok: true }>('PATCH', `/drafts/${id}`, { text }),
  getVoice: () => request<Voice>('GET', '/voice'),
  putVoice: (voice: Voice) => request<Voice>('PUT', '/voice', voice),
  listProfiles: () => request<Profile[]>('GET', '/profiles'),
  createProfile: (input: ProfileInput) => request<Profile>('POST', '/profiles', input),
  updateProfile: (id: number, input: ProfileInput) =>
    request<Profile>('PUT', `/profiles/${id}`, input),
  setDefaultProfile: (id: number) => request<Profile[]>('POST', `/profiles/${id}/default`),
  deleteProfile: (id: number) => request<null>('DELETE', `/profiles/${id}`),
  testProfile: (id: number) => request<ProfileTest>('POST', `/profiles/${id}/test`),
  listModels: (baseUrl: string) =>
    request<{ models: ModelInfo[] }>('GET', `/models?baseUrl=${encodeURIComponent(baseUrl)}`),
  triageStatus: () => request<TriageStatus>('GET', '/triage/status'),
  runTriage: () => request<TriageStatus & { scored: number }>('POST', '/triage/run'),
  listArticles: (
    query: {
      state?: ArticleState;
      limit?: number;
      sort?: 'date' | 'relevance';
      minRelevance?: number;
      pillarId?: string;
      feedId?: number;
      postWorthy?: boolean;
      q?: string;
    } = {},
  ) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') params.set(k, String(v));
    }
    return request<Article[]>('GET', `/articles?${params}`);
  },
};
