import { describe, it, expect, beforeEach } from 'vitest'
import { getOrFetch, wantsRefresh, pruneExpiredCache, _clearStore } from './cache.js'

describe('server/services/cache', () => {
  beforeEach(() => {
    _clearStore()
  })

  it('fetches fresh data and caches it within TTL', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return { msg: 'hello' }
    }

    const res1 = await getOrFetch({ key: 'test:1', ttl: 1000, source: 'Test' }, fetcher)
    expect(res1.data).toEqual({ msg: 'hello' })
    expect(res1.stale).toBe(false)
    expect(res1.source).toBe('Test')
    expect(calls).toBe(1)

    // Second call before TTL expiry hits cache without calling fetcher again
    const res2 = await getOrFetch({ key: 'test:1', ttl: 1000, source: 'Test' }, fetcher)
    expect(res2.data).toEqual({ msg: 'hello' })
    expect(res2.stale).toBe(false)
    expect(calls).toBe(1)
  })

  it('bypasses cache when force is true', async () => {
    let count = 0
    const fetcher = async () => {
      count++
      return { count }
    }

    const res1 = await getOrFetch({ key: 'test:force', ttl: 5000, source: 'Test' }, fetcher)
    expect(res1.data).toEqual({ count: 1 })

    const res2 = await getOrFetch({ key: 'test:force', ttl: 5000, source: 'Test', force: true }, fetcher)
    expect(res2.data).toEqual({ count: 2 })
  })

  it('serves stale cache on upstream failure', async () => {
    let shouldFail = false
    const fetcher = async () => {
      if (shouldFail) throw new Error('Upstream timeout')
      return { status: 'ok' }
    }

    // Prime cache with TTL 10ms
    const res1 = await getOrFetch({ key: 'test:stale', ttl: 10, source: 'Test' }, fetcher)
    expect(res1.data).toEqual({ status: 'ok' })

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 20))

    // Next fetch fails, should return expired value with stale: true
    shouldFail = true
    const res2 = await getOrFetch({ key: 'test:stale', ttl: 10, source: 'Test' }, fetcher)
    expect(res2.data).toEqual({ status: 'ok' })
    expect(res2.stale).toBe(true)
  })

  it('returns data: null with error when upstream fails and no cache exists', async () => {
    const fetcher = async () => {
      throw new Error('Connection refused')
    }

    const res = await getOrFetch({ key: 'test:empty', ttl: 1000, source: 'Test' }, fetcher)
    expect(res.data).toBeNull()
    expect(res.stale).toBe(false)
    expect(res.error).toBe('Connection refused')
  })

  it('coalesces concurrent requests for the same key', async () => {
    let calls = 0
    const slowFetcher = async () => {
      calls++
      await new Promise((r) => setTimeout(r, 50))
      return 'shared-result'
    }

    const [r1, r2, r3] = await Promise.all([
      getOrFetch({ key: 'test:coalesce', ttl: 1000, source: 'Test' }, slowFetcher),
      getOrFetch({ key: 'test:coalesce', ttl: 1000, source: 'Test' }, slowFetcher),
      getOrFetch({ key: 'test:coalesce', ttl: 1000, source: 'Test' }, slowFetcher),
    ])

    expect(calls).toBe(1)
    expect(r1.data).toBe('shared-result')
    expect(r2.data).toBe('shared-result')
    expect(r3.data).toBe('shared-result')
  })

  it('identifies wantsRefresh query flag', () => {
    expect(wantsRefresh({ refresh: '1' })).toBe(true)
    expect(wantsRefresh({ refresh: '0' })).toBe(false)
    expect(wantsRefresh({})).toBe(false)
    expect(wantsRefresh(null)).toBe(false)
  })

  it('prunes expired entries', async () => {
    const fetcher = async () => 'sample'
    await getOrFetch({ key: 'expire-me', ttl: 5, source: 'Test' }, fetcher)
    await new Promise((r) => setTimeout(r, 15))
    const pruned = pruneExpiredCache()
    expect(pruned).toBeGreaterThanOrEqual(1)
  })
})
