import { useState } from 'react'
import { usePanel } from '../hooks/usePanel'
import { PanelCard } from './PanelCard'
import { relativeTime } from '../lib/time'
import type { Trends } from '../types/dashboard'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'google', label: 'Google' },
  { id: 'hackernews', label: 'Hacker News' },
]

const GEOS = [
  { id: 'US', label: 'United States' },
  { id: 'CA', label: 'Canada' },
  { id: 'GB', label: 'United Kingdom' },
  { id: 'JP', label: 'Japan' },
  { id: 'DE', label: 'Germany' },
  { id: 'AU', label: 'Australia' },
  { id: 'IN', label: 'India' },
]

export function TrendsPanel({ autoRefreshMs }: { autoRefreshMs: number }) {
  const [geo, setGeo] = useState('US')
  const [filter, setFilter] = useState('all')
  const state = usePanel<Trends>(`/api/trends?geo=${geo}`, autoRefreshMs)

  const items = (state.data?.items ?? []).filter((i) => filter === 'all' || i.origin === filter)

  return (
    <PanelCard
      title="Trending now"
      state={state}
      actions={
        <select
          className="select"
          value={geo}
          onChange={(e) => setGeo(e.target.value)}
          aria-label="Trending region"
        >
          {GEOS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      }
      toolbar={
        <div className="tabs" role="tablist" aria-label="Trend source">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={f.id === filter}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {state.data && (
        <ul className="feed">
          {items.map((item, i) => (
            <li key={`${item.origin}-${item.title}-${i}`}>
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                <span className="rank">{i + 1}.</span> {item.title}
              </a>
              <div className="meta">
                <span className="badge">{item.origin === 'google' ? 'Google Trends' : 'HN'}</span>
                {item.metric && <span>{item.metric}</span>}
                {item.context && (
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                  >
                    {item.context}
                  </span>
                )}
                {item.publishedAt && <span>{relativeTime(item.publishedAt)}</span>}
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li>
              <span className="stat-sub">Nothing from this source right now.</span>
            </li>
          )}
        </ul>
      )}
    </PanelCard>
  )
}
