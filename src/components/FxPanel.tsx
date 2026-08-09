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

type Props = {
  base: string
  onBaseChange: (base: string) => void
  autoRefreshMs: number
}

export function FxPanel({ base, onBaseChange, autoRefreshMs }: Props) {
  const state = usePanel<Fx>(`/api/fx?base=${base}`, autoRefreshMs)
  const [amount, setAmount] = useState('1')

  const multiplier = Number(amount)
  const valid = Number.isFinite(multiplier) && multiplier !== 0

  return (
    <PanelCard
      title="Currency exchange"
      state={state}
      toolbar={
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
                {c}
              </option>
            ))}
          </select>
          <span style={{ color: 'var(--ink-secondary)', fontSize: 12.5 }}>buys</span>
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
