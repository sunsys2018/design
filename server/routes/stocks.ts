import { Router } from 'express'
import { getOrFetch, wantsRefresh } from '../services/cache.js'
import { fetchJson } from '../services/fetchUpstream.js'
import type { Quote, Stocks } from '../../src/types/dashboard.js'

const router = Router()

const TTL = 60 * 1000 // intraday quotes; also keeps request volume to Yahoo sane
const SOURCE = 'Yahoo Finance'

export const DEFAULT_SYMBOLS = [
  'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BTC-USD', 'ETH-USD',
]

/** Guard against arbitrary path injection into the upstream URL. */
const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,15}$/

type YahooChart = {
  chart: {
    result?: {
      meta: {
        symbol: string
        longName?: string
        shortName?: string
        regularMarketPrice: number
        chartPreviousClose?: number
        currency: string
        fiftyTwoWeekHigh?: number
        fiftyTwoWeekLow?: number
        marketState?: string
      }
      indicators: { quote: { close: (number | null)[] }[] }
    }[]
    error?: { description?: string } | null
  }
}

async function quoteFor(symbol: string): Promise<Quote> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    '?range=1mo&interval=1d'

  // No retry per symbol: with up to ~20 in flight, a retry storm against an
  // unofficial endpoint is a good way to get rate-limited. `browserUa: false`
  // is required here — see the note in fetchUpstream.
  const raw = await fetchJson<YahooChart>(url, {
    retry: false,
    timeoutMs: 8000,
    browserUa: false,
  })

  const result = raw.chart.result?.[0]
  if (!result) {
    throw new Error(raw.chart.error?.description ?? `No data for ${symbol}`)
  }

  const meta = result.meta
  const history = (result.indicators.quote[0]?.close ?? []).filter(
    (c): c is number => typeof c === 'number',
  )

  // The daily baseline is the previous *session's* close, i.e. the second-to-last
  // bar in the daily series. Do NOT use meta.chartPreviousClose here: on a 1mo
  // range that is the close before the whole window, so it would report a
  // one-month move as if it were today's. (meta.previousClose is absent on this
  // endpoint.) chartPreviousClose is still the right baseline for the month.
  const previousClose = history.length >= 2
    ? history[history.length - 2]!
    : (meta.chartPreviousClose ?? meta.regularMarketPrice)

  const change = meta.regularMarketPrice - previousClose
  const monthBase = meta.chartPreviousClose ?? history[0] ?? previousClose

  return {
    symbol: meta.symbol,
    name: meta.longName ?? meta.shortName ?? meta.symbol,
    price: meta.regularMarketPrice,
    previousClose,
    change,
    changePercent: previousClose ? (change / previousClose) * 100 : 0,
    monthChangePercent: monthBase
      ? ((meta.regularMarketPrice - monthBase) / monthBase) * 100
      : 0,
    currency: meta.currency,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? 0,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? 0,
    marketState: meta.marketState ?? 'UNKNOWN',
    history,
  }
}

/** GET /api/stocks?symbols=NVDA,AAPL,BTC-USD */
router.get('/', async (req, res) => {
  const requested =
    typeof req.query.symbols === 'string' && req.query.symbols.trim()
      ? req.query.symbols.split(',').map((s) => s.trim().toUpperCase())
      : DEFAULT_SYMBOLS

  const symbols = [...new Set(requested.filter((s) => SYMBOL_RE.test(s)))].slice(0, 20)
  if (symbols.length === 0) {
    res.status(400).json({ error: 'No valid symbols supplied' })
    return
  }

  const envelope = await getOrFetch<Stocks>(
    { key: `stocks:${symbols.join(',')}`, ttl: TTL, source: SOURCE, force: wantsRefresh(req.query) },
    async () => {
      const settled = await Promise.allSettled(symbols.map(quoteFor))

      // A single bad ticker must not fail the batch — it comes back as a row
      // carrying an `error`, which the UI renders greyed out.
      const quotes: Quote[] = settled.map((outcome, i) => {
        if (outcome.status === 'fulfilled') return outcome.value
        return {
          symbol: symbols[i]!,
          name: symbols[i]!,
          price: 0,
          previousClose: 0,
          change: 0,
          changePercent: 0,
          monthChangePercent: 0,
          currency: '',
          fiftyTwoWeekHigh: 0,
          fiftyTwoWeekLow: 0,
          marketState: 'UNKNOWN',
          history: [],
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        }
      })

      if (quotes.every((q) => q.error)) {
        throw new Error('Yahoo Finance is unreachable for every symbol')
      }

      return { quotes }
    },
  )

  res.json(envelope)
})

export default router
