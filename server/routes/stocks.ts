import { Router } from 'express'
import { getOrFetch, wantsRefresh } from '../services/cache.js'
import { fetchJson } from '../services/fetchUpstream.js'
import type { Quote, Stocks, SymbolResult } from '../../src/types/dashboard.js'

const router = Router()

const TTL = 60 * 1000 // intraday quotes; also keeps request volume to Yahoo sane
const SOURCE = 'Yahoo Finance'

/** Symbol search: listings barely move, and this caps keystroke fan-out. */
const SEARCH_TTL = 6 * 60 * 60 * 1000
const SEARCH_SOURCE = 'Yahoo Finance · SEC company tickers'
const SEC_TTL = 24 * 60 * 60 * 1000
const MAX_RESULTS = 8

/**
 * SEC's fair-access policy wants a descriptive User-Agent carrying a contact
 * address; they throttle anonymous clients. Override with SEC_CONTACT.
 */
const SEC_UA = `design-dashboard (${process.env.SEC_CONTACT ?? 'admin@dashboard.local'})`

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
  if (req.query.symbols === '') {
    res.json({
      data: { quotes: [] },
      fetchedAt: new Date().toISOString(),
      stale: false,
      source: SOURCE,
    })
    return
  }

  const requested =
    typeof req.query.symbols === 'string' && req.query.symbols.trim()
      ? req.query.symbols.split(',').map((s) => s.trim().toUpperCase())
      : DEFAULT_SYMBOLS

  const symbols = [...new Set(requested.filter((s) => SYMBOL_RE.test(s)))].slice(0, 20)
  if (symbols.length === 0) {
    res.json({
      data: { quotes: [] },
      fetchedAt: new Date().toISOString(),
      stale: false,
      source: SOURCE,
    })
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

// ── Symbol search ─────────────────────────────────────────────────────────────

type YahooSearch = {
  quotes?: {
    symbol?: string
    shortname?: string
    longname?: string
    exchDisp?: string
    quoteType?: string
    /** False for the "lookup" rows Yahoo mixes in that have no quote behind them. */
    isYahooFinance?: boolean
  }[]
}

/** Name/ticker lookup against Yahoo. Covers equities, ETFs, crypto and indices. */
async function yahooSearch(q: string): Promise<SymbolResult[]> {
  const url =
    'https://query1.finance.yahoo.com/v1/finance/search' +
    `?q=${encodeURIComponent(q)}&quotesCount=${MAX_RESULTS * 2}&newsCount=0&listsCount=0`

  // `browserUa: false` for the same reason as the chart endpoint above. No retry
  // and a short timeout because a failure here falls through to the SEC index —
  // sitting through a second attempt only delays a result we can already produce.
  const raw = await fetchJson<YahooSearch>(url, {
    retry: false,
    timeoutMs: 6000,
    browserUa: false,
  })

  const hits: SymbolResult[] = []
  for (const r of raw.quotes ?? []) {
    if (r.isYahooFinance === false) continue

    // Anything that would be rejected by the guard on `/api/stocks` must not be
    // offered — picking it would silently add a row that can never load.
    const symbol = r.symbol?.toUpperCase()
    if (!symbol || !SYMBOL_RE.test(symbol)) continue

    hits.push({
      symbol,
      name: r.longname ?? r.shortname ?? symbol,
      exchange: r.exchDisp,
      quoteType: r.quoteType,
    })
    if (hits.length === MAX_RESULTS) break
  }
  return hits
}

type SecTickers = Record<string, { cik_str: number; ticker: string; title: string }>

/**
 * The SEC's full registrant list (~10k US companies), cached for a day.
 *
 * This exists because Yahoo throttles hard and without warning — when it 429s,
 * a name lookup still works here even though the quote rows themselves are
 * erroring out. Keyless, and an official source. US equities only: no crypto,
 * no foreign listings.
 *
 * Going through getOrFetch buys in-flight coalescing and stale-on-error for the
 * ~800KB payload for free. It never throws, so a dead SEC yields an empty index.
 */
async function secIndex(): Promise<SymbolResult[]> {
  const envelope = await getOrFetch<SymbolResult[]>(
    { key: 'sec:tickers', ttl: SEC_TTL, source: 'SEC' },
    async () => {
      const raw = await fetchJson<SecTickers>('https://www.sec.gov/files/company_tickers.json', {
        headers: { 'User-Agent': SEC_UA },
        timeoutMs: 20_000,
      })
      const rows: SymbolResult[] = []
      for (const r of Object.values(raw)) {
        const symbol = r.ticker?.toUpperCase()
        if (!symbol || !SYMBOL_RE.test(symbol)) continue
        // Titles are left as SEC writes them ("NVIDIA CORP"). Title-casing would
        // mangle the acronyms that make up most of the list.
        rows.push({ symbol, name: r.title, quoteType: 'EQUITY' })
      }
      return rows
    },
  )
  return envelope.data ?? []
}

/**
 * Rank the SEC index against a query. The source list arrives roughly in
 * market-cap order, so holding that order inside each tier is what puts Apple
 * Inc. above the other companies whose names merely start with "apple".
 */
function secSearch(index: SymbolResult[], q: string): SymbolResult[] {
  const needle = q.toLowerCase()
  const exact: SymbolResult[] = []
  const symbolPrefix: SymbolResult[] = []
  const namePrefix: SymbolResult[] = []
  const nameSubstring: SymbolResult[] = []

  for (const r of index) {
    const symbol = r.symbol.toLowerCase()
    const name = r.name.toLowerCase()
    if (symbol === needle) exact.push(r)
    else if (symbol.startsWith(needle)) symbolPrefix.push(r)
    else if (name.startsWith(needle)) namePrefix.push(r)
    else if (name.includes(needle)) nameSubstring.push(r)
  }

  return [...exact, ...symbolPrefix, ...namePrefix, ...nameSubstring].slice(0, MAX_RESULTS)
}

/** GET /api/stocks/search?q=nvidia — resolve a company name or ticker. */
router.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (q.length < 2) {
    res.json({ data: [], fetchedAt: new Date().toISOString(), stale: false, source: SEARCH_SOURCE })
    return
  }

  const envelope = await getOrFetch<SymbolResult[]>(
    { key: `symsearch:${q.toLowerCase()}`, ttl: SEARCH_TTL, source: SEARCH_SOURCE },
    async () => {
      try {
        return await yahooSearch(q)
      } catch (err) {
        const index = await secIndex()
        // Only report the Yahoo failure if the fallback is unavailable too.
        // Otherwise an index that simply has no match is a real "no results",
        // and must not be dressed up as a broken search.
        if (index.length === 0) throw err
        return secSearch(index, q)
      }
    },
  )

  res.json(envelope)
})

export default router
