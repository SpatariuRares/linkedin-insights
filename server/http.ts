export type Fetcher = typeof fetch;

export const USER_AGENT = 'Mozilla/5.0 (compatible; CrescitaDashboard/1.0; personal RSS reader)';

export type HttpResult = {
  status: number;
  url: string;
  contentType: string;
  text: string;
  headers: Headers;
};

/** GET with a hard timeout and a browser-like UA; some sites refuse unknown clients. */
export async function httpGet(
  url: string,
  fetcher: Fetcher,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<HttpResult> {
  const res = await fetcher(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...opts.headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  return {
    status: res.status,
    url: res.url || url,
    contentType: res.headers.get('content-type') ?? '',
    text: res.status === 304 ? '' : await res.text(),
    headers: res.headers,
  };
}

export function describeFetchError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return 'Il sito non ha risposto entro 15 secondi.';
    return err.message;
  }
  return String(err);
}
