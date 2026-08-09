# Today, at a glance

A single interactive page that aggregates live public data: news, trending topics, weather, tech
stock movement, global currency rates, and US/Canadian home lending rates.

**No API keys are required.** Every source is keyless.

```bash
npm install
cp .env.local.example .env.local
npm run dev:all          # client on :5173, API on :3001
```

## Why there is a server

Almost none of these sources allow direct browser access — Yahoo Finance, Google News/Trends,
Freddie Mac and the Bank of Canada all block cross-origin requests. So a thin Express proxy fetches,
normalizes and caches upstream data, and the React app only ever talks to `/api/*`.

The proxy also lets us cache: a single upstream fetch serves every viewer for the length of that
route's TTL, which keeps request volume to the unofficial endpoints low and courteous.

## Data sources

| Panel | Source | Notes |
|---|---|---|
| Weather | Open-Meteo | Forecast + geocoding for city search |
| News | Google News RSS | Six topic feeds |
| Trending | Google Trends RSS + Hacker News API | Merged and badged by origin |
| Markets | Yahoo Finance chart API | Equities and crypto via one endpoint |
| Currency | Frankfurter (European Central Bank) | Daily reference rates, ~30 currencies |
| Rates — US | Freddie Mac PMMS | Weekly 30-yr and 15-yr fixed averages |
| Rates — Canada | Bank of Canada Valet | Prime rate and 5-yr conventional mortgage |

**Yahoo Finance and Google's RSS feeds are unofficial** — they are not contractual APIs and can
change without notice. Each lives behind its own adapter in `server/routes/` so a break is contained
to one file and one panel.

Two upstream quirks are load-bearing and documented at their call sites:

- **Yahoo rejects a browser User-Agent.** It answers `429` to browser-looking requests with no
  session cookie, and `200` to a plain one — hence `browserUa: false` in `server/routes/stocks.ts`.
- **Bank of Canada returns `recent=` newest-first**, the opposite of its default ascending order.
  `server/routes/rates.ts` sorts by date rather than trusting either.

### The one thing that needs a key

The **US bank prime rate** has no keyless source. Everything else in the rates panel works without
one. Add a free [FRED key](https://fred.stlouisfed.org/docs/api/api_key.html) to `.env.local` as
`FRED_API_KEY` and it appears automatically — the adapter is already wired, gated on the variable
being present.

## Architecture

```
server/
  index.ts              Express :3001
  services/cache.ts     TTL cache + stale-on-error fallback
  services/fetchUpstream.ts
  routes/               one adapter per panel
src/
  pages/DashboardPage.tsx
  components/           PanelCard shell + six panels + Sparkline + Delta
  hooks/usePanel.ts     fetch/refresh/stale state machine
  types/dashboard.ts    the Envelope contract, shared with the server
```

### One dead source costs one card, never the page

Every route answers with the same envelope:

```ts
type Envelope<T> = { data: T | null; fetchedAt: string; stale: boolean; source: string; error?: string }
```

A failing upstream still returns HTTP 200 — with the last good payload flagged `stale`, or with
`data: null` and an `error` the card renders alongside a retry button. Six unofficial sources means
something is periodically down, and the page has to stay useful when it is.

Note that `?refresh=1` **bypasses** a cache entry rather than deleting it. Deleting first would turn
"refresh while the upstream is down" into a blank panel — the opposite of what the button is for.

## Design notes

Colors come from a validated data-viz palette, checked with a validator rather than by eye. Two
measurements shaped the UI:

- **Status red vs green measure CVD ΔE 4.1 (deutan)** — indistinguishable to red-green colorblind
  readers. So direction is never carried by color alone: every `<Delta>` renders an arrow *and* a
  signed number, and sparklines use one neutral blue regardless of direction.
- **`#d03b3b` is only 3.62:1 on the dark surface**, below AA for small text, so dark mode uses
  `#e66767` for the down-delta ink.

Interest rates report **percentage points**, not relative change. A 30-year mortgage going
6.58 → 6.69 is +0.11pp; rendering its relative change (+1.67%) reads as though the rate rose by 1.67
points, which is off by a factor of fifteen.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:all` | Client and API together |
| `npm run dev` / `npm run dev:server` | Either half alone |
| `npm run build` | Typecheck and build the client |
| `npm run typecheck:server` | Typecheck the server |
| `npm run lint` | oxlint |
