import { Router } from 'express'
import { getOrFetch, wantsRefresh } from '../services/cache.js'
import { fetchJson } from '../services/fetchUpstream.js'
import type { Fx, FxPair } from '../../src/types/dashboard.js'

const router = Router()

const TTL = 60 * 60 * 1000 // the ECB publishes reference rates once daily, ~16:00 CET
const SOURCE = 'Frankfurter (European Central Bank)'

/** The currencies the panel tracks. The active base is filtered out of this. */
export const CURRENCIES = ['USD', 'CAD', 'CNY', 'EUR', 'GBP', 'JPY', 'AUD', 'CHF']

const CURRENCY_RE = /^[A-Z]{3}$/

type LatestResponse = { base: string; date: string; rates: Record<string, number> }
type SeriesResponse = { base: string; rates: Record<string, Record<string, number>> }

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** GET /api/fx?base=CAD */
router.get('/', async (req, res) => {
  const requested = typeof req.query.base === 'string' ? req.query.base.toUpperCase() : 'CAD'
  const base = CURRENCY_RE.test(requested) ? requested : 'CAD'

  const symbols = CURRENCIES.filter((c) => c !== base)

  const envelope = await getOrFetch<Fx>(
    { key: `fx:${base}`, ttl: TTL, source: SOURCE, force: wantsRefresh(req.query) },
    async () => {
      const query = `base=${base}&symbols=${symbols.join(',')}`

      // One call for today's rates, one for the whole 30-day window across all
      // pairs — the timeseries endpoint returns every symbol at once.
      const [latest, series] = await Promise.all([
        fetchJson<LatestResponse>(`https://api.frankfurter.dev/v1/latest?${query}`),
        fetchJson<SeriesResponse>(`https://api.frankfurter.dev/v1/${isoDaysAgo(30)}..?${query}`),
      ])

      // The timeseries object is keyed by date; sort so sparklines run left to
      // right in chronological order.
      const dates = Object.keys(series.rates).sort()

      const pairs: FxPair[] = symbols
        .filter((currency) => latest.rates[currency] !== undefined)
        .map((currency) => {
          const history = dates
            .map((d) => series.rates[d]?.[currency])
            .filter((v): v is number => typeof v === 'number')

          const first = history[0]
          const last = history[history.length - 1]
          const changePercent = first && last ? ((last - first) / first) * 100 : 0

          return { currency, rate: latest.rates[currency]!, history, changePercent }
        })

      if (pairs.length === 0) throw new Error(`No rates returned for base ${base}`)

      return { base, date: latest.date, pairs }
    },
  )

  res.json(envelope)
})

export default router
