import { useCallback, useState } from 'react'

/**
 * useState backed by localStorage, so the watchlist, chosen city, FX base and
 * theme survive a reload. Falls back to in-memory state when storage is
 * unavailable (private windows, disabled cookies) rather than throwing.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Storage unavailable — session-only is an acceptable degradation.
      }
    },
    [key],
  )

  return [value, update]
}
