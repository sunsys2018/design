import { useCallback, useEffect, useRef, useState } from 'react'
import type { Envelope } from '../types/dashboard'

export type PanelState<T> = {
  data: T | null
  loading: boolean
  /** Set when the panel has nothing to show. */
  error: string | null
  /** True when the server served an expired cache entry after an upstream failure. */
  stale: boolean
  fetchedAt: string | null
  source: string
  reload: (force?: boolean) => void
}

/**
 * Fetches one panel's Envelope and exposes it as UI state.
 *
 * `path` must be a stable string (build it with a template literal in the
 * caller); it doubles as the effect dependency, so a changing query string
 * re-fetches on its own.
 */
export function usePanel<T>(path: string, autoRefreshMs = 0): PanelState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [source, setSource] = useState('')

  // Guards against a slow earlier request landing after a newer one.
  const requestId = useRef(0)

  const load = useCallback(
    async (force = false) => {
      const id = ++requestId.current
      setLoading(true)

      const url = force ? `${path}${path.includes('?') ? '&' : '?'}refresh=1` : path

      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`)

        const envelope = (await res.json()) as Envelope<T>
        if (id !== requestId.current) return

        setData(envelope.data)
        setStale(envelope.stale)
        setFetchedAt(envelope.fetchedAt)
        setSource(envelope.source)
        setError(envelope.error ?? null)
      } catch (err) {
        if (id !== requestId.current) return
        // Keep whatever is already on screen; only the message changes.
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [path],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (autoRefreshMs <= 0) return
    const timer = setInterval(() => void load(), autoRefreshMs)
    return () => clearInterval(timer)
  }, [autoRefreshMs, load])

  const reload = useCallback((force = true) => void load(force), [load])

  return { data, loading, error, stale, fetchedAt, source, reload }
}
