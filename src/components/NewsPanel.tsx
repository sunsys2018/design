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
}

export function NewsPanel({ topic, onTopicChange, autoRefreshMs }: Props) {
  const state = usePanel<News>(`/api/news?topic=${topic}`, autoRefreshMs)

  return (
    <PanelCard
      title="News"
      state={state}
      toolbar={
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
      }
    >
      {state.data && (
        <ul className="feed">
          {state.data.items.map((item, i) => (
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
        </ul>
      )}
    </PanelCard>
  )
}
