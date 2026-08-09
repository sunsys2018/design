type Props = {
  /** The change. Interpreted according to `unit`. */
  value: number
  /**
   * '%'  — a relative change, e.g. a stock moving +2.27% of its price.
   * 'pp' — a percentage-POINT change, for figures that are themselves rates.
   *
   * Rates must use 'pp'. A 30-year mortgage going 6.58 → 6.69 is +0.11
   * percentage points; rendering that as its relative change (+1.67%) reads
   * as though the rate rose by 1.67 points, which is off by a factor of 15.
   */
  unit?: '%' | 'pp'
  /** Optional absolute change shown before the figure. */
  absolute?: string
  /** Treat |value| below this as flat rather than up/down. */
  epsilon?: number
}

/**
 * The direction cue used everywhere in the dashboard.
 *
 * Status red and green measure CVD ΔE 4.1 under deuteranopia — for a red-green
 * colorblind reader they are the same color. So this component never leans on
 * hue: it always renders an arrow glyph AND a signed number, with color as the
 * third, redundant channel. The arrow is aria-hidden because the sign in the
 * number already conveys direction to a screen reader.
 */
export function Delta({ value, unit = '%', absolute, epsilon = 0.005 }: Props) {
  const flat = !Number.isFinite(value) || Math.abs(value) < epsilon
  const up = value > 0

  const cls = flat ? 'delta-flat' : up ? 'delta-up' : 'delta-down'
  const arrow = flat ? '→' : up ? '▲' : '▼'
  const sign = flat ? '' : up ? '+' : '−'
  const magnitude = Math.abs(value).toFixed(2)

  return (
    <span className={`delta ${cls}`}>
      <span aria-hidden="true">{arrow}</span>
      <span>
        {absolute !== undefined && `${sign}${absolute} `}
        {sign}
        {magnitude}
        {unit === 'pp' ? ' pp' : '%'}
      </span>
    </span>
  )
}
