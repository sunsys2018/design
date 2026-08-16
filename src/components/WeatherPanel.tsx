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
  unit?: 'C' | 'F'
  onUnitChange?: (unit: 'C' | 'F') => void
  forceTrigger?: number
}

function dayName(iso: string, index: number): string {
  if (index === 0) return 'Today'
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
}

function toDisplayTemp(celsius: number, unit: 'C' | 'F'): number {
  return unit === 'F' ? Math.round((celsius * 9) / 5 + 32) : Math.round(celsius)
}

function toDisplayWind(kmh: number, unit: 'C' | 'F'): { speed: number; unit: string } {
  return unit === 'F'
    ? { speed: Math.round(kmh * 0.621371), unit: 'mph' }
    : { speed: Math.round(kmh), unit: 'km/h' }
}

export function WeatherPanel({
  place,
  onPlaceChange,
  autoRefreshMs,
  unit = 'C',
  onUnitChange,
  forceTrigger,
}: Props) {
  const state = usePanel<Weather>(
    `/api/weather?lat=${place.latitude}&lon=${place.longitude}&name=${encodeURIComponent(place.name)}`,
    autoRefreshMs,
    forceTrigger,
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
  const tempUnitSymbol = `°${unit}`
  const windInfo = w ? toDisplayWind(w.current.windSpeed, unit) : null

  return (
    <PanelCard
      title="Weather"
      state={state}
      actions={
        onUnitChange ? (
          <div className="segmented-control" role="group" aria-label="Temperature unit">
            <button
              type="button"
              className={`btn btn-sm ${unit === 'C' ? 'is-active' : ''}`}
              onClick={() => onUnitChange('C')}
              aria-pressed={unit === 'C'}
            >
              °C
            </button>
            <button
              type="button"
              className={`btn btn-sm ${unit === 'F' ? 'is-active' : ''}`}
              onClick={() => onUnitChange('F')}
              aria-pressed={unit === 'F'}
            >
              °F
            </button>
          </div>
        ) : undefined
      }
      toolbar={
        <div className="search-box" ref={boxRef}>
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
            <ul className="search-results">
              {results.map((r, i) => (
                <li key={`${r.name}-${r.latitude}-${r.longitude}-${i}`}>
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
                {toDisplayTemp(w.current.temperature, unit)}
                {tempUnitSymbol}
              </div>
              <div className="weather-meta">
                {w.current.condition.label} · feels {toDisplayTemp(w.current.apparentTemperature, unit)}
                {tempUnitSymbol}
              </div>
              <div className="weather-meta">
                {w.location.name} · {w.current.humidity}% humidity
                {windInfo ? ` · ${windInfo.speed} ${windInfo.unit}` : ''}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Sparkline
                values={w.hourly.map((h) => toDisplayTemp(h.temperature, unit))}
                width={92}
                height={34}
                fill
                label={`Temperature over the next ${w.hourly.length} hours`}
                formatValue={(v) => `${Math.round(v)}${tempUnitSymbol}`}
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
              <div
                className="weather-day"
                key={d.date}
                title={`${d.condition.label} · ${d.precipitationChance}% precipitation`}
              >
                <div className="dow">{dayName(d.date, i)}</div>
                <div className="ico" aria-hidden="true">
                  {d.condition.icon}
                </div>
                <div className="hi">{toDisplayTemp(d.max, unit)}°</div>
                <div className="lo">{toDisplayTemp(d.min, unit)}°</div>
                {d.precipitationChance > 10 && (
                  <div className="precip-badge" title={`${d.precipitationChance}% rain/snow`}>
                    💧{d.precipitationChance}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </PanelCard>
  )
}
