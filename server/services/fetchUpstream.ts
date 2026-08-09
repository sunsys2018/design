/**
 * Thin fetch wrapper for the upstream sources.
 *
 * Several of them (Yahoo Finance, Google News/Trends RSS, Freddie Mac) reject
 * or throttle requests without a browser-like User-Agent, and a couple can hang
 * indefinitely — so a timeout and one retry are the baseline everywhere.
 */

const DEFAULT_TIMEOUT_MS = 12_000

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export type FetchOptions = {
  timeoutMs?: number
  /** Extra request headers, merged over the defaults. */
  headers?: Record<string, string>
  /** Retry once on failure. Default true; set false for per-symbol fan-out. */
  retry?: boolean
  /**
   * Send a browser User-Agent. Default true, which is what Google's RSS feeds
   * and Freddie Mac want. Set false for Yahoo Finance: it answers 429 to
   * browser-looking requests that carry no session cookie, but 200 to a plain
   * one. (Verified — browser UA 429, bare 200.)
   */
  browserUa?: boolean
}

async function once(url: string, opts: FetchOptions): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        ...(opts.browserUa === false
          ? {}
          : { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' }),
        Accept: '*/*',
        ...opts.headers,
      },
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} from ${hostOf(url)}`)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch a URL as text, with a timeout and (by default) one retry. */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  try {
    return await once(url, opts)
  } catch (err) {
    if (opts.retry === false) throw normalize(err, url)
    try {
      return await once(url, opts)
    } catch (retryErr) {
      throw normalize(retryErr, url)
    }
  }
}

/** Fetch a URL and parse it as JSON. */
export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const body = await fetchText(url, { ...opts, headers: { Accept: 'application/json', ...opts.headers } })
  try {
    return JSON.parse(body) as T
  } catch {
    throw new Error(`Invalid JSON from ${hostOf(url)}`)
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function normalize(err: unknown, url: string): Error {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return new Error(`Timed out contacting ${hostOf(url)}`)
    return err
  }
  return new Error(String(err))
}
