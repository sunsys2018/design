import { useEffect, useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { WeatherPanel, type Place } from '../components/WeatherPanel'
import { NewsPanel } from '../components/NewsPanel'
import { TrendsPanel } from '../components/TrendsPanel'
import { StocksPanel } from '../components/StocksPanel'
import { FxPanel } from '../components/FxPanel'
import { RatesPanel } from '../components/RatesPanel'

/** Fallback when geolocation is denied or unavailable. */
const VANCOUVER: Place = { name: 'Vancouver, British Columbia', latitude: 49.28, longitude: -123.12 }

const DEFAULT_SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BTC-USD', 'ETH-USD']

const AUTO_REFRESH_MS = 5 * 60 * 1000

type Theme = 'system' | 'light' | 'dark'

export function DashboardPage() {
  const [place, setPlace] = useLocalStorage<Place>('dash.place', VANCOUVER)
  const [symbols, setSymbols] = useLocalStorage<string[]>('dash.symbols', DEFAULT_SYMBOLS)
  const [fxBase, setFxBase] = useLocalStorage<string>('dash.fxBase', 'CAD')
  const [topic, setTopic] = useLocalStorage<string>('dash.topic', 'top')
  const [theme, setTheme] = useLocalStorage<Theme>('dash.theme', 'system')
  const [autoRefresh, setAutoRefresh] = useLocalStorage<boolean>('dash.autoRefresh', true)

  // Bumping this key remounts every panel, which re-runs each usePanel fetch
  // with `refresh=1`. Simpler and less error-prone than threading a ref to
  // each panel's reload.
  const [refreshKey, setRefreshKey] = useState(0)

  const [askedForLocation, setAskedForLocation] = useLocalStorage<boolean>('dash.askedLocation', false)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  // Offer geolocation once. If it's denied we keep the Vancouver default and
  // never ask again — the city search is always there as the manual path.
  useEffect(() => {
    if (askedForLocation || !navigator.geolocation) return
    setAskedForLocation(true)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPlace({
          name: 'Current location',
          latitude: Number(pos.coords.latitude.toFixed(4)),
          longitude: Number(pos.coords.longitude.toFixed(4)),
        })
      },
      () => {
        /* Denied or unavailable — the Vancouver fallback already stands. */
      },
      { timeout: 8000, maximumAge: 30 * 60 * 1000 },
    )
  }, [askedForLocation, setAskedForLocation, setPlace])

  const autoMs = autoRefresh ? AUTO_REFRESH_MS : 0

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>Today, at a glance</h1>
          <p className="subtitle">
            News, trends, weather, markets, currencies and home lending rates — refreshed from
            public sources.
          </p>
        </div>

        <div className="masthead-actions">
          <button
            type="button"
            className="btn"
            aria-pressed={autoRefresh}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title="Re-fetch every panel every 5 minutes"
          >
            <span aria-hidden="true">⏱</span> Auto-refresh {autoRefresh ? 'on' : 'off'}
          </button>

          <button type="button" className="btn" onClick={() => setRefreshKey((k) => k + 1)}>
            <span aria-hidden="true">↻</span> Refresh all
          </button>

          <select
            className="select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            aria-label="Color theme"
          >
            <option value="system">Theme: system</option>
            <option value="light">Theme: light</option>
            <option value="dark">Theme: dark</option>
          </select>
        </div>
      </header>

      <main className="grid" key={refreshKey}>
        <WeatherPanel place={place} onPlaceChange={setPlace} autoRefreshMs={autoMs} />
        <NewsPanel topic={topic} onTopicChange={setTopic} autoRefreshMs={autoMs} />
        <TrendsPanel autoRefreshMs={autoMs} />
        <StocksPanel symbols={symbols} onSymbolsChange={setSymbols} autoRefreshMs={autoMs} />
        <FxPanel base={fxBase} onBaseChange={setFxBase} autoRefreshMs={autoMs} />
        <RatesPanel autoRefreshMs={autoMs} />
      </main>
    </div>
  )
}
