import { useEffect, useMemo, useRef, useState } from 'react'
import { usePanel } from '../hooks/usePanel'
import { PanelCard } from './PanelCard'
import { Sparkline } from './Sparkline'
import { Delta } from './Delta'
import type { Envelope, Stocks, SymbolResult } from '../types/dashboard'

type Props = {
  symbols: string[]
  onSymbolsChange: (symbols: string[]) => void
  autoRefreshMs: number
}

type SortMode = 'custom' | 'change'

/** Mirrors SYMBOL_RE on the server, so a typed-out ticker is rejected here first. */
const TICKER_RE = /^[A-Z0-9.^=-]{1,15}$/

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
  const [sort, setSort] = useState<SortMode>('custom')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SymbolResult[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)

  const quotes = useMemo(() => {
    const list = state.data?.quotes ?? []
    if (sort !== 'change') return list
    return [...list].sort((a, b) => b.changePercent - a.changePercent)
  }, [state.data, sort])

  // Debounced company/ticker lookup. The `ignore` flag is load-bearing: without
  // it, a slow response for an abandoned query can land after a newer one and
  // overwrite it — the same out-of-order problem usePanel solves with requestId.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setHighlight(-1)
      return
    }

    let ignore = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`)
        const envelope = (await res.json()) as Envelope<SymbolResult[]>
        if (ignore) return
        setResults(envelope.data ?? [])
        setHighlight(-1)
        setOpen(true)
      } catch {
        if (!ignore) setResults([])
      }
    }, 300)

    return () => {
      ignore = true
      clearTimeout(timer)
    }
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

  const addSymbol = (symbol: string) => {
    if (!symbols.includes(symbol)) onSymbolsChange([...symbols, symbol])
    setQuery('')
    setResults([])
    setOpen(false)
    setHighlight(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setHighlight(-1)
      return
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setHighlight((h) => (h + step + results.length) % results.length)
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const picked = open && highlight >= 0 ? results[highlight] : undefined
      if (picked) {
        addSymbol(picked.symbol)
        return
      }
      // Nothing highlighted — take the raw input as a ticker, so someone who
      // already knows the symbol can still type "AMD ⏎" without waiting on a
      // lookup. This is the behaviour the old free-text Add box had.
      const raw = query.trim().toUpperCase()
      if (TICKER_RE.test(raw)) addSymbol(raw)
    }
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
          <div className="search-box" ref={boxRef}>
            <input
              className="input"
              style={{ width: '100%' }}
              type="search"
              value={query}
              placeholder="Search a company or ticker — e.g. Nvidia, BTC-USD"
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={open && results.length > 0}
              aria-controls="symbol-results"
              aria-autocomplete="list"
              aria-activedescendant={highlight >= 0 ? `symbol-result-${highlight}` : undefined}
              aria-label="Search for a company or ticker to add to the watchlist"
            />
            {open && results.length > 0 && (
              <ul className="search-results" id="symbol-results" role="listbox">
                {results.map((r, i) => (
                  <li key={`${r.symbol}-${i}`} role="none">
                    <button
                      type="button"
                      id={`symbol-result-${i}`}
                      role="option"
                      aria-selected={i === highlight}
                      onClick={() => addSymbol(r.symbol)}
                      onMouseEnter={() => setHighlight(i)}
                    >
                      {r.symbol}
                      <span style={{ color: 'var(--ink-secondary)' }}>
                        {' '}
                        — {r.name}
                        {r.exchange ? ` · ${r.exchange}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
