import { Router } from 'express'
import { getOrFetch, wantsRefresh } from '../services/cache.js'
import { fetchJson, fetchText } from '../services/fetchUpstream.js'
import type { RateSeries, Rates, RatesRegion } from '../../src/types/dashboard.js'

const router = Router()

const TTL = 6 * 60 * 60 * 1000 // PMMS is weekly, the BoC series are daily
const SOURCE = 'Freddie Mac PMMS + Bank of Canada'

const WEEKS = 52

// ── United States ─────────────────────────────────────────────────────────────

/**
 * Freddie Mac's Primary Mortgage Market Survey — the weekly 30-yr and 15-yr
 * fixed averages, published as a keyless CSV. This is the same series FRED
 * republishes as MORTGAGE30US, so it needs no API key.
 *
 * Columns: date,pmms30,pmms30p,pmms15,pmms15p,pmms51,...
 */
async function unitedStates(): Promise<RatesRegion> {
  const csv = await fetchText('https://www.freddiemac.com/pmms/docs/PMMS_history.csv')

  const rows = csv
    .split(/\r?\n/)
    .slice(1) // header
    .map((line) => line.split(','))
    .filter((cols) => cols.length > 3 && cols[0]?.trim())

  if (rows.length === 0) throw new Error('Freddie Mac PMMS returned no rows')

  const recent = rows.slice(-WEEKS)
  const latest = rows[rows.length - 1]!

  const asOf = new Date(latest[0]!.trim()).toISOString().slice(0, 10)
  const column = (i: number) => recent.map((r) => Number(r[i])).filter((n) => Number.isFinite(n))

  const series: RateSeries[] = [
    {
      label: '30-year fixed mortgage',
      value: Number(latest[1]),
      asOf,
      history: column(1),
    },
    {
      label: '15-year fixed mortgage',
      value: Number(latest[3]),
      asOf,
      history: column(3),
    },
  ].filter((s) => Number.isFinite(s.value))

  if (series.length === 0) throw new Error('Freddie Mac PMMS returned no usable rates')

  // The US bank prime rate has no keyless source. If a FRED key is present in
  // .env.local we add it; otherwise the panel simply shows mortgage rates.
  const prime = await usPrimeRate().catch(() => null)
  if (prime) series.push(prime)

  return { country: 'US', source: 'Freddie Mac PMMS', series }
}

type FredResponse = { observations?: { date: string; value: string }[] }

async function usPrimeRate(): Promise<RateSeries | null> {
  const key = process.env.FRED_API_KEY
  if (!key) return null

  const url =
    'https://api.stlouisfed.org/fred/series/observations' +
    `?series_id=DPRIME&api_key=${key}&file_type=json&sort_order=desc&limit=${WEEKS * 5}`

  const raw = await fetchJson<FredResponse>(url)
  const points = (raw.observations ?? [])
    .filter((o) => o.value !== '.')
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => Number.isFinite(o.value))

  const latest = points[0]
  if (!latest) return null

  return {
    label: 'Bank prime rate',
    value: latest.value,
    asOf: latest.date,
    history: points.map((p) => p.value).reverse(),
    note: 'via FRED',
  }
}

// ── Canada ────────────────────────────────────────────────────────────────────

/**
 * Bank of Canada Valet, both series in a single call:
 *   V80691311 — prime rate
 *   V80691335 — conventional 5-year mortgage
 */
type ValetResponse = {
  observations?: ({ d: string } & Record<string, { v: string } | string>)[]
}

const BOC_SERIES: { id: string; label: string }[] = [
  { id: 'V80691311', label: 'Prime rate' },
  { id: 'V80691335', label: '5-year conventional mortgage' },
]

async function canada(): Promise<RatesRegion> {
  const ids = BOC_SERIES.map((s) => s.id).join(',')
  // Both series are weekly (Wednesdays), so 52 observations is one year —
  // matching the US window.
  const raw = await fetchJson<ValetResponse>(
    `https://www.bankofcanada.ca/valet/observations/${ids}/json?recent=${WEEKS}`,
  )

  const observations = raw.observations ?? []
  if (observations.length === 0) throw new Error('Bank of Canada returned no observations')

  const series: RateSeries[] = []

  for (const { id, label } of BOC_SERIES) {
    const points = observations
      .map((o) => {
        const cell = o[id]
        const value = typeof cell === 'object' && cell ? Number(cell.v) : NaN
        return { date: o.d, value }
      })
      .filter((p) => Number.isFinite(p.value))
      // Valet answers `recent=` newest-first, the opposite of its default
      // ascending order. Sort rather than trust either: the latest reading is
      // the headline number, and sparklines must run oldest -> newest.
      .sort((a, b) => a.date.localeCompare(b.date))

    const latest = points[points.length - 1]
    if (!latest) continue

    series.push({
      label,
      value: latest.value,
      asOf: latest.date,
      history: points.map((p) => p.value),
    })
  }

  if (series.length === 0) throw new Error('Bank of Canada returned no usable rates')

  return { country: 'CA', source: 'Bank of Canada', series }
}

// ── Route ─────────────────────────────────────────────────────────────────────

/** GET /api/rates */
router.get('/', async (req, res) => {
  const envelope = await getOrFetch<Rates>(
    { key: 'rates', ttl: TTL, source: SOURCE, force: wantsRefresh(req.query) },
    async () => {
      const [us, ca] = await Promise.allSettled([unitedStates(), canada()])

      const regions: RatesRegion[] = []

      // One country failing leaves the other rendered — same principle as the
      // Envelope, applied inside the payload.
      if (us.status === 'fulfilled') regions.push(us.value)
      else {
        regions.push({
          country: 'US',
          source: 'Freddie Mac PMMS',
          series: [],
          error: us.reason instanceof Error ? us.reason.message : String(us.reason),
        })
      }

      if (ca.status === 'fulfilled') regions.push(ca.value)
      else {
        regions.push({
          country: 'CA',
          source: 'Bank of Canada',
          series: [],
          error: ca.reason instanceof Error ? ca.reason.message : String(ca.reason),
        })
      }

      if (regions.every((r) => r.error)) {
        throw new Error('Both rate sources are unreachable')
      }

      return { regions }
    },
  )

  res.json(envelope)
})

export default router
