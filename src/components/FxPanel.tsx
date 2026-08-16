import { useState } from 'react'
import { usePanel } from '../hooks/usePanel'
import { PanelCard } from './PanelCard'
import { Sparkline } from './Sparkline'
import { Delta } from './Delta'
import type { Fx } from '../types/dashboard'

const BASES = ['CAD', 'USD', 'CNY', 'EUR', 'GBP', 'JPY', 'AUD', 'CHF']

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', CAD: '🇨🇦', CNY: '🇨🇳', EUR: '🇪🇺',
  GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺', CHF: '🇨🇭',
}

const NAMES: Record<string, string> = {
  USD: 'US dollar', CAD: 'Canadian dollar', CNY: 'Chinese yuan', EUR: 'Euro',
  GBP: 'British pound', JPY: 'Japanese yen', AUD: 'Australian dollar', CHF: 'Swiss franc',
}

const PRESETS = ['1', '100', '1000', '10000']

type Props = {
  base: string
  onBaseChange: (base: string) => void
  autoRefreshMs: number
  forceTrigger?: number
}

export function FxPanel({ base, onBaseChange, autoRefreshMs, forceTrigger }: Props) {
  const state = usePanel<Fx>(`/api/fx?base=${base}`, autoRefreshMs, forceTrigger)
  const [amount, setAmount] = useState('1')

  const multiplier = Number(amount)
  const valid = Number.isFinite(multiplier) && multiplier > 0

  const swapWithDefault = () => {
    // If current is CAD, swap to USD; if USD, swap to CAD; otherwise swap to USD
    if (base === 'CAD') onBaseChange('USD')
    else if (base === 'USD') onBaseChange('CAD')
    else onBaseChange('USD')
  }

  return (
    <PanelCard
      title="Currency exchange"
      state={state}
      actions={
        <button
          type="button"
          className="btn btn-sm"
          onClick={swapWithDefault}
          title={`Swap base between CAD and USD`}
          aria-label="Swap base currency"
        >
          ⇄ Swap ({base === 'CAD' ? 'USD' : 'CAD'})
        </button>
      }
      toolbar={
        <div className="fx-toolbar">
          <div className="fx-controls">
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount to convert"
            />
            <select
              className="select"
              value={base}
              onChange={(e) => onBaseChange(e.target.value)}
              aria-label="Base currency"
            >
              {BASES.map((c) => (
                <option key={c} value={c}>
                  {FLAGS[c] ?? ''} {c}
                </option>
              ))}
            </select>
            <span style={{ color: 'var(--ink-secondary)', fontSize: 12.5 }}>buys</span>
          </div>

          <div className="fx-presets" role="group" aria-label="Quick amount presets">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`tab ${amount === p ? 'is-active' : ''}`}
                onClick={() => setAmount(p)}
                style={{ padding: '2px 8px', fontSize: '11px' }}
              >
                {Number(p).toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {state.data && (
        <div>
          {state.data.pairs.map((p) => (
            <div className="stat-row" key={p.currency}>
              <div className="stat-label">
                <span className="stat-name">
                  <span aria-hidden="true">{FLAGS[p.currency] ?? '🏳️'}</span> {p.currency}
                </span>
                <span className="stat-sub">{NAMES[p.currency] ?? p.currency}</span>
              </div>

              <Sparkline
                values={p.history}
                label={`${state.data!.base} to ${p.currency} over the past 30 days, ${p.changePercent >= 0 ? 'up' : 'down'} ${Math.abs(p.changePercent).toFixed(1)}%`}
                formatValue={(v) =>
                  `1 ${base} = ${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 4 : 2 })} ${p.currency}`
                }
              />

              <div className="stat-value">
                <span className="amount">
                  {valid
                    ? (p.rate * multiplier).toLocaleString(undefined, {
                        maximumFractionDigits: p.rate < 10 ? 4 : 2,
                      })
                    : '—'}
                </span>
                <Delta value={p.changePercent} />
              </div>
            </div>
          ))}
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-secondary)' }}>
            European Central Bank reference rates for {state.data.date}. Published once each
            business day — not live dealing rates.
          </p>
        </div>
      )}
    </PanelCard>
  )
}
