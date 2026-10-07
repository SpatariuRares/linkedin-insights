import fs from 'node:fs';
import path from 'node:path';
import type { Fetcher } from './http.ts';

type Route = { status?: number; body: string; type?: string; headers?: Record<string, string> };

export const fixture = (name: string) =>
  fs.readFileSync(path.join(import.meta.dirname, 'feeds/__fixtures__', name), 'utf8');

/** A fetch that answers from a URL → response map, and records what was requested. */
export function fakeFetch(routes: Record<string, Route | (() => Route)>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetcher: Fetcher = async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const entry = routes[url];
    if (!entry) return new Response('not found', { status: 404 });
    const r = typeof entry === 'function' ? entry() : entry;
    const res = new Response(r.body, {
      status: r.status ?? 200,
      headers: { 'content-type': r.type ?? 'text/html', ...r.headers },
    });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  };
  return { fetcher, calls };
}
