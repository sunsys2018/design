/**
 * Shared contract between the Express proxy and the React panels.
 *
 * Every route answers with an Envelope, and every panel reads one through the
 * `usePanel` hook. The point is graceful degradation: six unofficial upstreams
 * means something is occasionally down, and one dead source must never blank
 * the page. A route that fails still answers HTTP 200 — either with the last
 * good payload flagged `stale`, or with `data: null` and an `error` string.
 */
export type Envelope<T> = {
  data: T | null
  /** ISO timestamp of when `data` was actually fetched from upstream. */
  fetchedAt: string
  /** True when upstream failed and this is an expired cache entry. */
  stale: boolean
  /** Human-readable attribution, shown in the card footer. */
  source: string
  /** Set only when upstream failed and there was no cache to fall back on. */
  error?: string
}

// ── Weather ───────────────────────────────────────────────────────────────────

export type WeatherCondition = {
  code: number
  label: string
  icon: string
}

export type WeatherDay = {
  date: string
  min: number
  max: number
  condition: WeatherCondition
  precipitationChance: number
}

export type Weather = {
  location: { name: string; latitude: number; longitude: number; timezone: string }
  current: {
    temperature: number
    apparentTemperature: number
    humidity: number
    windSpeed: number
    isDay: boolean
    condition: WeatherCondition
  }
  /** Next 24 hours of temperatures, for the sparkline. */
  hourly: { time: string; temperature: number }[]
  daily: WeatherDay[]
  units: { temperature: string; wind: string }
}

export type GeoResult = {
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
}

// ── News ──────────────────────────────────────────────────────────────────────

export type NewsItem = {
  title: string
  link: string
  publisher: string
  publishedAt: string
}

export type News = {
  topic: string
  items: NewsItem[]
}

// ── Trends ────────────────────────────────────────────────────────────────────

export type TrendItem = {
  title: string
  origin: 'google' | 'hackernews'
  link: string
  /** Google: approximate search volume ("200K+"). HN: point score. */
  metric?: string
  /** Google only: a representative related headline. */
  context?: string
  publishedAt?: string
}

export type Trends = {
  geo: string
  items: TrendItem[]
}

// ── Stocks ────────────────────────────────────────────────────────────────────

export type Quote = {
  symbol: string
  name: string
  price: number
  previousClose: number
  change: number
  /** Change vs the previous session's close. */
  changePercent: number
  /** Change across the ~1 month the sparkline covers. */
  monthChangePercent: number
  currency: string
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  marketState: string
  /** ~1 month of daily closes, for the sparkline. */
  history: number[]
  /** Present when this one symbol failed; the rest of the batch still returns. */
  error?: string
}

export type Stocks = {
  quotes: Quote[]
}

/** One hit from the watchlist symbol search. */
export type SymbolResult = {
  symbol: string
  name: string
  /** Exchange short name, e.g. "NasdaqGS", "NYSE". Absent on SEC fallback results. */
  exchange?: string
  /** "EQUITY" | "ETF" | "CRYPTOCURRENCY" | "INDEX" | … */
  quoteType?: string
}

// ── FX ────────────────────────────────────────────────────────────────────────

export type FxPair = {
  currency: string
  rate: number
  /** ~30 days of daily rates, for the sparkline. */
  history: number[]
  /** Percent change across the history window. */
  changePercent: number
}

export type Fx = {
  base: string
  date: string
  pairs: FxPair[]
}

// ── Rates ─────────────────────────────────────────────────────────────────────

export type RateSeries = {
  label: string
  value: number
  asOf: string
  /** Recent observations, oldest first, for the sparkline. */
  history: number[]
  note?: string
}

export type RatesRegion = {
  country: 'US' | 'CA'
  source: string
  series: RateSeries[]
  error?: string
}

export type Rates = {
  regions: RatesRegion[]
}
