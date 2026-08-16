import type { ReactNode } from 'react'
import type { PanelState } from '../hooks/usePanel'
import { useRelativeTime } from '../lib/time'
import { ErrorBoundary } from './ErrorBoundary'

type Props = {
  title: string
  /** Controls rendered in the header, right of the title. */
  actions?: ReactNode
  /** Controls rendered above the body (tabs, search, watchlist editor). */
  toolbar?: ReactNode
  state: PanelState<unknown>
  children: ReactNode
}

/**
 * Shared shell for every panel: title, refresh, freshness, source attribution,
 * and the two degraded states.
 *
 * The distinction that matters: `stale` still renders `children` (the data is
 * old but real, and the amber flag says so), whereas a hard error with nothing
 * cached replaces the body. A failing upstream must cost one card, never the page.
 */
export function PanelCard({ title, actions, toolbar, state, children }: Props) {
  const { loading, error, stale, fetchedAt, source, data, reload } = state
  const hasData = data !== null && data !== undefined
  const timeFormatted = useRelativeTime(fetchedAt)

  return (
    <ErrorBoundary name={title}>
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {actions}
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => reload(true)}
            disabled={loading}
            aria-label={`Refresh ${title}`}
            title={`Refresh ${title}`}
          >
            <span className={loading ? 'spin' : undefined} aria-hidden="true">
              ↻
            </span>
          </button>
        </div>

        <div className="panel-body">
          {toolbar}

          {!hasData && loading && (
            <div aria-live="polite">
              <span className="sr-only">Loading {title}</span>
              <div className="skeleton" style={{ width: '70%' }} />
              <div className="skeleton" style={{ width: '90%' }} />
              <div className="skeleton" style={{ width: '55%' }} />
            </div>
          )}

          {!hasData && !loading && error && (
            <div className="panel-error" role="status">
              <strong>Couldn’t load {title.toLowerCase()}</strong>
              {error}
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn" onClick={() => reload(true)}>
                  Try again
                </button>
              </div>
            </div>
          )}

          {hasData && children}
        </div>

        <div className="panel-foot">
          {stale ? (
            <span className="stale-flag">
              <span aria-hidden="true">⚠</span> Stale
            </span>
          ) : (
            <span>Updated {timeFormatted}</span>
          )}
          {stale && <span>Last good: {timeFormatted}</span>}
          {hasData && error && (
            <span className="stale-flag" title={error} style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span aria-hidden="true">⚠</span> Refresh failed
            </span>
          )}
          <span className="source" title={source}>
            {source}
          </span>
        </div>
      </section>
    </ErrorBoundary>
  )
}
