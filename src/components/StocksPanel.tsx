import { useMemo, useState } from 'react'
import { usePanel } from '../hooks/usePanel'
import { PanelCard } from './PanelCard'
import { Sparkline } from './Sparkline'
import { Delta } from './Delta'
import type { Stocks } from '../types/dashboard'

type Props = {
  symbols: string[]
  onSymbolsChange: (symbols: string[]) => void
  autoRefreshMs: number
}

type SortMode = 'custom' | 'change'

function formatPrice(value: number, currency: string): string {
  const digits = value < 10 ? 4 : 2
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: digits,
    }).format(value)
  } catch {
    return value.toFixed(digits)
  }
}

export function StocksPanel({ symbols, onSymbolsChange, autoRefreshMs }: Props) {
  const state = usePanel<Stocks>(`/api/stocks?symbols=${symbols.join(',')}`, autoRefreshMs)
  const [draft, setDraft] = useState('')
  const [sort, setSort] = useState<SortMode>('custom')

  const quotes = useMemo(() => {
    const list = state.data?.quotes ?? []
    if (sort !== 'change') return list
    return [...list].sort((a, b) => b.changePercent - a.changePercent)
  }, [state.data, sort])

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const symbol = draft.trim().toUpperCase()
    if (!symbol || symbols.includes(symbol)) {
      setDraft('')
      return
    }
    onSymbolsChange([...symbols, symbol])
    setDraft('')
  }

  return (
    <PanelCard
      title="Markets"
      state={state}
      actions={
        <select
          className="select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          aria-label="Sort watchlist"
        >
          <option value="custom">My order</option>
          <option value="change">Top movers</option>
        </select>
      }
      toolbar={
        <>
          <div className="chip-row">
            {symbols.map((s) => (
              <span className="chip" key={s}>
                {s}
                <button
                  type="button"
                  onClick={() => onSymbolsChange(symbols.filter((x) => x !== s))}
                  aria-label={`Remove ${s} from watchlist`}
                  title={`Remove ${s}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form className="inline-form" onSubmit={add}>
            <input
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a ticker — e.g. AMD, BTC-USD"
              aria-label="Add a ticker to the watchlist"
            />
            <button type="submit" className="btn">
              Add
            </button>
          </form>
        </>
      }
    >
      <div>
        {quotes.map((q) => (
          <div className={`stat-row${q.error ? ' is-error' : ''}`} key={q.symbol}>
            <div className="stat-label">
              <span className="stat-name">{q.symbol}</span>
              <span className="stat-sub">{q.error ? q.error : q.name}</span>
            </div>

            {!q.error && (
              <Sparkline
                values={q.history}
                label={`${q.symbol} closing prices over the past month, ${q.monthChangePercent >= 0 ? 'up' : 'down'} ${Math.abs(q.monthChangePercent).toFixed(1)}%`}
              />
            )}

            <div className="stat-value">
              {q.error ? (
                <span className="stat-sub">unavailable</span>
              ) : (
                <>
                  <span className="amount">{formatPrice(q.price, q.currency)}</span>
                  <Delta value={q.changePercent} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </PanelCard>
  )
}
