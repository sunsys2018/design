import { useState } from 'react'
import { usePanel } from '../hooks/usePanel'
import { PanelCard } from './PanelCard'
import { relativeTime } from '../lib/time'
import type { News } from '../types/dashboard'

const TOPICS = [
  { id: 'top', label: 'Top' },
  { id: 'world', label: 'World' },
  { id: 'business', label: 'Business' },
  { id: 'technology', label: 'Tech' },
  { id: 'science', label: 'Science' },
  { id: 'health', label: 'Health' },
]

type Props = {
  topic: string
  onTopicChange: (topic: string) => void
  autoRefreshMs: number
  forceTrigger?: number
}

export function NewsPanel({ topic, onTopicChange, autoRefreshMs, forceTrigger }: Props) {
  const state = usePanel<News>(`/api/news?topic=${topic}`, autoRefreshMs, forceTrigger)
  const [filterQuery, setFilterQuery] = useState('')

  const items = (state.data?.items ?? []).filter((item) => {
    if (!filterQuery.trim()) return true
    const q = filterQuery.toLowerCase()
    return item.title.toLowerCase().includes(q) || item.publisher.toLowerCase().includes(q)
  })

  return (
    <PanelCard
      title="News"
      state={state}
      toolbar={
        <>
          <div className="tabs" role="tablist" aria-label="News topic">
            {TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={t.id === topic}
                onClick={() => onTopicChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="search-box" style={{ marginBottom: '8px' }}>
            <input
              className="input"
              style={{ width: '100%', fontSize: '12px', padding: '4px 8px' }}
              type="search"
              placeholder="Filter headlines..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              aria-label="Filter news headlines"
            />
          </div>
        </>
      }
    >
      {state.data && (
        <ul className="feed">
          {items.map((item, i) => (
            <li key={`${item.link}-${i}`}>
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
              <div className="meta">
                <span className="badge">{item.publisher}</span>
                <span>{relativeTime(item.publishedAt)}</span>
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li style={{ padding: '16px 0', textAlign: 'center' }}>
              <span className="stat-sub">No headlines matching &quot;{filterQuery}&quot;</span>
            </li>
          )}
        </ul>
      )}
    </PanelCard>
  )
}
