import { useEffect, useRef, useState } from 'react'
import { usePanel } from '../hooks/usePanel'
import { PanelCard } from './PanelCard'
import { Sparkline } from './Sparkline'
import type { Envelope, GeoResult, Weather } from '../types/dashboard'

export type Place = { name: string; latitude: number; longitude: number }

type Props = {
  place: Place
  onPlaceChange: (place: Place) => void
  autoRefreshMs: number
}

function dayName(iso: string, index: number): string {
  if (index === 0) return 'Today'
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
}

export function WeatherPanel({ place, onPlaceChange, autoRefreshMs }: Props) {
  const state = usePanel<Weather>(
    `/api/weather?lat=${place.latitude}&lon=${place.longitude}&name=${encodeURIComponent(place.name)}`,
    autoRefreshMs,
  )

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounced city lookup.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/weather/search?q=${encodeURIComponent(query)}`)
        const envelope = (await res.json()) as Envelope<GeoResult[]>
        setResults(envelope.data ?? [])
        setOpen(true)
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const choose = (r: GeoResult) => {
    onPlaceChange({
      name: r.admin1 ? `${r.name}, ${r.admin1}` : `${r.name}, ${r.country}`,
      latitude: r.latitude,
      longitude: r.longitude,
    })
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const w = state.data

  return (
    <PanelCard
      title="Weather"
      state={state}
      toolbar={
        <div className="city-search" ref={boxRef}>
          <input
            className="input"
            style={{ width: '100%' }}
            type="search"
            value={query}
            placeholder={`Search a city — showing ${place.name}`}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            aria-label="Search for a city"
          />
          {open && results.length > 0 && (
            <ul className="city-results">
              {results.map((r) => (
                <li key={`${r.latitude},${r.longitude}`}>
                  <button type="button" onClick={() => choose(r)}>
                    {r.name}
                    <span style={{ color: 'var(--ink-secondary)' }}>
                      {' '}
                      — {r.admin1 ? `${r.admin1}, ` : ''}
                      {r.country}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    >
      {w && (
        <>
          <div className="weather-now">
            <span className="weather-icon" aria-hidden="true">
              {w.current.condition.icon}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="weather-temp">
                {Math.round(w.current.temperature)}
                {w.units.temperature}
              </div>
              <div className="weather-meta">
                {w.current.condition.label} · feels {Math.round(w.current.apparentTemperature)}
                {w.units.temperature}
              </div>
              <div className="weather-meta">
                {w.location.name} · {w.current.humidity}% humidity ·{' '}
                {Math.round(w.current.windSpeed)} {w.units.wind}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Sparkline
                values={w.hourly.map((h) => h.temperature)}
                width={92}
                height={34}
                fill
                label={`Temperature over the next ${w.hourly.length} hours`}
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--ink-secondary)',
                  textAlign: 'right',
                  marginTop: 2,
                }}
              >
                next 24h
              </div>
            </div>
          </div>

          <div className="weather-days">
            {w.daily.slice(0, 7).map((d, i) => (
              <div className="weather-day" key={d.date} title={`${d.condition.label} · ${d.precipitationChance}% precipitation`}>
                <div className="dow">{dayName(d.date, i)}</div>
                <div className="ico" aria-hidden="true">
                  {d.condition.icon}
                </div>
                <div className="hi">{Math.round(d.max)}°</div>
                <div className="lo">{Math.round(d.min)}°</div>
              </div>
            ))}
          </div>
        </>
      )}
    </PanelCard>
  )
}
