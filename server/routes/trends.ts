import { Router } from 'express'
import { XMLParser } from 'fast-xml-parser'
import { getOrFetch, wantsRefresh } from '../services/cache.js'
import { fetchJson, fetchText } from '../services/fetchUpstream.js'
import type { TrendItem, Trends } from '../../src/types/dashboard.js'

const router = Router()

const TTL = 10 * 60 * 1000 // Trends RSS refreshes slowly; HN churns a bit faster
const SOURCE = 'Google Trends + Hacker News'

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  // The feed uses the `ht:` namespace on every interesting field; dropping the
  // prefix turns <ht:approx_traffic> into a plain `approx_traffic` key.
  removeNSPrefix: true,
})

type TrendsNewsItem = {
  news_item_title?: string
  news_item_url?: string
  news_item_source?: string
}

type TrendsRssItem = {
  title?: string
  approx_traffic?: string
  pubDate?: string
  news_item?: TrendsNewsItem | TrendsNewsItem[]
}

async function googleTrends(geo: string): Promise<TrendItem[]> {
  const xml = await fetchText(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`)
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: TrendsRssItem | TrendsRssItem[] } } }

  const raw = parsed.rss?.channel?.item
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]

  return list.slice(0, 12).map((item) => {
    const news = item.news_item
    const first = Array.isArray(news) ? news[0] : news

    return {
      title: item.title ?? 'Unknown',
      origin: 'google' as const,
      // The feed's own <link> just points back at the feed, so link to the
      // representative article when there is one, else to Trends explore.
      link:
        first?.news_item_url ??
        `https://trends.google.com/trends/explore?q=${encodeURIComponent(item.title ?? '')}&geo=${geo}`,
      metric: item.approx_traffic,
      context: first?.news_item_title,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
    }
  })
}

type HnItem = {
  title?: string
  url?: string
  score?: number
  id: number
  time?: number
}

async function hackerNews(): Promise<TrendItem[]> {
  const ids = await fetchJson<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json')

  // 15 small parallel requests. This sits inside the cached function, so it
  // happens once per TTL rather than once per viewer.
  const stories = await Promise.all(
    ids.slice(0, 15).map((id) =>
      fetchJson<HnItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
        retry: false,
        timeoutMs: 6000,
      }).catch(() => null),
    ),
  )

  return stories.filter((s): s is HnItem => s !== null && Boolean(s.title)).map((s) => ({
    title: s.title!,
    origin: 'hackernews' as const,
    link: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
    metric: s.score !== undefined ? `${s.score} pts` : undefined,
    context: s.url ? new URL(s.url).host.replace(/^www\./, '') : 'news.ycombinator.com',
    publishedAt: s.time ? new Date(s.time * 1000).toISOString() : undefined,
  }))
}

/** GET /api/trends?geo=US */
router.get('/', async (req, res) => {
  const geo = typeof req.query.geo === 'string' && /^[A-Z]{2}$/i.test(req.query.geo)
    ? req.query.geo.toUpperCase()
    : 'US'

  const envelope = await getOrFetch<Trends>(
    { key: `trends:${geo}`, ttl: TTL, source: SOURCE, force: wantsRefresh(req.query) },
    async () => {
      // Settle rather than all: if one of the two sources is down we still
      // render the other, which is the whole point of merging them.
      const [google, hn] = await Promise.allSettled([googleTrends(geo), hackerNews()])

      const items: TrendItem[] = []
      if (google.status === 'fulfilled') items.push(...google.value)
      if (hn.status === 'fulfilled') items.push(...hn.value)

      if (items.length === 0) {
        throw new Error('Both Google Trends and Hacker News are unreachable')
      }

      return { geo, items }
    },
  )

  res.json(envelope)
})

export default router
