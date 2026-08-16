import { useEffect, useState } from 'react'

/**
 * "just now" / "3m ago" / "2h ago" — the only time format the dashboard shows.
 *
 * Freshness is what matters on every panel (how old is this number?), not the
 * wall-clock time it was fetched, so relative is the right default everywhere.
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'

  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/**
 * React hook that returns live-updating relative time string (re-calculated every 30 seconds).
 */
export function useRelativeTime(iso: string | null | undefined): string {
  const [formatted, setFormatted] = useState(() => relativeTime(iso))

  useEffect(() => {
    setFormatted(relativeTime(iso))
    if (!iso) return

    const timer = setInterval(() => {
      setFormatted(relativeTime(iso))
    }, 30_000)

    return () => clearInterval(timer)
  }, [iso])

  return formatted
}
