import { usePanel } from '../hooks/usePanel'
import { PanelCard } from './PanelCard'
import { Sparkline } from './Sparkline'
import { Delta } from './Delta'
import type { Rates } from '../types/dashboard'

const COUNTRY: Record<string, { flag: string; name: string }> = {
  US: { flag: '🇺🇸', name: 'United States' },
  CA: { flag: '🇨🇦', name: 'Canada' },
}

/**
 * Home lending rates for the US and Canada.
 *
 * Sparklines here use the neutral series hue, not a direction color: a mortgage
 * rate going up is bad for a borrower and good for a saver, so painting it green
 * or red would editorialize. The Delta chip still reports the year's movement
 * with an arrow and a sign.
 */
export function RatesPanel({ autoRefreshMs }: { autoRefreshMs: number }) {
  const state = usePanel<Rates>('/api/rates', autoRefreshMs)

  return (
    <PanelCard title="Home lending rates" state={state}>
      {state.data && (
        <div>
          {state.data.regions.map((region) => {
            const meta = COUNTRY[region.country] ?? { flag: '🏳️', name: region.country }
            return (
              <div className="region" key={region.country}>
                <div className="region-head">
                  <h3>
                    <span aria-hidden="true">{meta.flag}</span> {meta.name}
                  </h3>
                  <span className="as-of">{region.source}</span>
                </div>

                {region.error ? (
                  <p className="stat-sub" style={{ padding: '6px 0' }}>
                    Unavailable — {region.error}
                  </p>
                ) : (
                  region.series.map((s) => {
                    const first = s.history[0]
                    // Percentage POINTS, not a relative change — see the note in
                    // Delta. These figures are themselves rates.
                    const yearChange =
                      first !== undefined && s.history.length > 1 ? s.value - first : 0

                    return (
                      <div className="stat-row" key={s.label}>
                        <div className="stat-label">
                          <span className="stat-name">{s.label}</span>
                          <span className="stat-sub">
                            as of {s.asOf}
                            {s.note ? ` · ${s.note}` : ''}
                          </span>
                        </div>

                        <Sparkline
                          values={s.history}
                          label={`${meta.name} ${s.label} over the past year, currently ${s.value}%`}
                        />

                        <div className="stat-value">
                          <span className="amount">{s.value.toFixed(2)}%</span>
                          <span className="stat-sub" style={{ display: 'block' }}>
                            <Delta value={yearChange} unit="pp" /> <span>1y</span>
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )
          })}

          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-secondary)' }}>
            US figures are Freddie Mac’s weekly national averages; Canadian figures are the Bank
            of Canada’s posted series. Both are benchmarks, not quotes — your lender’s offer will
            differ.
          </p>
        </div>
      )}
    </PanelCard>
  )
}
