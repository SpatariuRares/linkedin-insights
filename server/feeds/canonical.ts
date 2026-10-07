const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;

/**
 * Same article, same key: two feeds (or one feed twice) often link the same page with different
 * tracking parameters, a fragment or a trailing slash. Host case and `www.` don't matter either.
 */
export function canonicalUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  const s = url.toString();
  return url.search ? s : s.replace(/\/$/, '');
}
