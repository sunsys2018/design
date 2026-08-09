import type { Envelope } from '../../src/types/dashboard.js'

type Entry<T> = {
  value: T
  fetchedAt: string
  expiresAt: number
}

const store = new Map<string, Entry<unknown>>()

/** In-flight requests, so N simultaneous viewers cause one upstream fetch. */
const inFlight = new Map<string, Promise<unknown>>()

export type CacheOptions = {
  /** Cache key. Must include any query params that change the result. */
  key: string
  /** Time-to-live in milliseconds. */
  ttl: number
  /** Human-readable attribution passed through to the Envelope. */
  source: string
  /**
   * Ignore the TTL and re-fetch (what the refresh buttons send).
   *
   * This *bypasses* the cached entry rather than deleting it, which matters:
   * if the forced fetch fails, the old value is still there to serve as
   * `stale`. Deleting first would turn "refresh while the upstream is down"
   * into a blank panel — the opposite of what the button is for.
   */
  force?: boolean
}

/**
 * Fetch through the cache, returning a ready-to-send Envelope.
 *
 * Three outcomes:
 *   - fresh cache hit    -> cached value, `stale: false`
 *   - upstream succeeds  -> new value cached, `stale: false`
 *   - upstream fails     -> expired value if we have one (`stale: true`),
 *                           otherwise `data: null` with `error`
 *
 * The third case is the reason this wrapper exists. Callers never throw at the
 * route layer, so a dead upstream degrades one panel instead of the page.
 */
export async function getOrFetch<T>(
  { key, ttl, source, force = false }: CacheOptions,
  fetcher: () => Promise<T>,
): Promise<Envelope<T>> {
  const now = Date.now()
  const cached = store.get(key) as Entry<T> | undefined

  if (!force && cached && cached.expiresAt > now) {
    return { data: cached.value, fetchedAt: cached.fetchedAt, stale: false, source }
  }

  // Coalesce concurrent misses on the same key onto a single upstream call.
  let pending = inFlight.get(key) as Promise<T> | undefined
  if (!pending) {
    const started = fetcher()
    pending = started
    inFlight.set(key, started)

    // Clear the slot on settle. This must use two-arg `.then` rather than
    // `.finally` — `.finally` returns a *new* promise that re-throws on
    // rejection, and with nothing awaiting that branch, an upstream failure
    // becomes an unhandled rejection and takes the process down.
    const clear = () => {
      if (inFlight.get(key) === started) inFlight.delete(key)
    }
    started.then(clear, clear)
  }

  try {
    const value = await pending
    const fetchedAt = new Date().toISOString()
    store.set(key, { value, fetchedAt, expiresAt: Date.now() + ttl })
    return { data: value, fetchedAt, stale: false, source }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (cached) {
      // Expired, but better than nothing. Hold it a little longer so a flapping
      // upstream doesn't cause a retry storm on every request.
      cached.expiresAt = Date.now() + 30_000
      console.warn(`[cache] ${key} upstream failed, serving stale: ${message}`)
      return { data: cached.value, fetchedAt: cached.fetchedAt, stale: true, source }
    }

    console.error(`[cache] ${key} upstream failed with no cache: ${message}`)
    return {
      data: null,
      fetchedAt: new Date().toISOString(),
      stale: false,
      source,
      error: message,
    }
  }
}

/** Read the `?refresh=1` flag a panel's refresh button sends. */
export function wantsRefresh(query: unknown): boolean {
  return typeof query === 'object' && query !== null && (query as Record<string, unknown>).refresh === '1'
}
