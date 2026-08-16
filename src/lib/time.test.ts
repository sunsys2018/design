import { describe, it, expect } from 'vitest'
import { relativeTime } from './time'

describe('src/lib/time - relativeTime', () => {
  it('handles null, undefined and invalid timestamps', () => {
    expect(relativeTime(null)).toBe('—')
    expect(relativeTime(undefined)).toBe('—')
    expect(relativeTime('')).toBe('—')
    expect(relativeTime('invalid-date')).toBe('—')
  })

  it('formats seconds as "just now"', () => {
    const now = new Date().toISOString()
    expect(relativeTime(now)).toBe('just now')

    const tenSecsAgo = new Date(Date.now() - 10_000).toISOString()
    expect(relativeTime(tenSecsAgo)).toBe('just now')
  })

  it('formats minutes ago', () => {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(relativeTime(fiveMinsAgo)).toBe('5m ago')

    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    expect(relativeTime(thirtyMinsAgo)).toBe('30m ago')
  })

  it('formats hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    expect(relativeTime(twoHoursAgo)).toBe('2h ago')
  })

  it('formats days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString()
    expect(relativeTime(threeDaysAgo)).toBe('3d ago')
  })
})
