import { Router } from 'express'
import { XMLParser } from 'fast-xml-parser'
import { getOrFetch, wantsRefresh } from '../services/cache.js'
import { fetchText } from '../services/fetchUpstream.js'
import type { News, NewsItem } from '../../src/types/dashboard.js'

const router = Router()

const TTL = 5 * 60 * 1000 // the feed updates continuously
const SOURCE = 'Google News'

/** Tab id -> Google News section. `top` uses the root feed, which has no topic. */
export const TOPICS: Record<string, string> = {
  top: '',
  world: 'WORLD',
  business: 'BUSINESS',
  technology: 'TECHNOLOGY',
  science: 'SCIENCE',
  health: 'HEALTH',
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Publisher names and headlines are plain text; keep them as strings so a
  // headline like "2026" doesn't get coerced to a number.
  parseTagValue: false,
  parseAttributeValue: false,
})

type RssItem = {
  title?: string
  link?: string
  pubDate?: string
  source?: string | { '#text'?: string; '@_url'?: string }
}

function publisherOf(item: RssItem): string {
  const src = item.source
  if (typeof src === 'string') return src
  if (src && typeof src === 'object' && src['#text']) return src['#text']

  // Fall back to the " - Publisher" suffix Google appends to every headline.
  const title = item.title ?? ''
  const dash = title.lastIndexOf(' - ')
  return dash > 0 ? title.slice(dash + 3) : 'Google News'
}

/** Google appends " - Publisher" to titles; we show the publisher separately. */
function cleanTitle(title: string, publisher: string): string {
  const suffix = ` - ${publisher}`
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title
}

/** GET /api/news?topic=technology */
router.get('/', async (req, res) => {
  const requested = typeof req.query.topic === 'string' ? req.query.topic.toLowerCase() : 'top'
  const topic = requested in TOPICS ? requested : 'top'

  const envelope = await getOrFetch<News>(
    { key: `news:${topic}`, ttl: TTL, source: SOURCE, force: wantsRefresh(req.query) },
    async () => {
      const section = TOPICS[topic]
      const url = section
        ? `https://news.google.com/rss/headlines/section/topic/${section}?hl=en-US&gl=US&ceid=US:en`
        : 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'

      const xml = await fetchText(url)
      const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RssItem | RssItem[] } } }

      const raw = parsed.rss?.channel?.item
      if (!raw) throw new Error('Google News returned no items')
      const list = Array.isArray(raw) ? raw : [raw]

      const items: NewsItem[] = list.slice(0, 20).map((item) => {
        const publisher = publisherOf(item)
        return {
          title: cleanTitle(item.title ?? 'Untitled', publisher),
          link: item.link ?? '',
          publisher,
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : '',
        }
      })

      return { topic, items }
    },
  )

  res.json(envelope)
})

export default router
