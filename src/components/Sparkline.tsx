import { useId } from 'react'

type Props = {
  values: number[]
  width?: number
  height?: number
  /** Accessible description; the SVG is labelled with it. */
  label: string
  /** Draw the ~10% wash under the line. */
  fill?: boolean
}

/**
 * A single-series sparkline: 2px line, round caps, an end-dot with a 2px
 * surface ring, and an optional 10% wash.
 *
 * Deliberately one neutral hue (--series-1) regardless of whether the series is
 * rising or falling. Direction is carried by the `<Delta>` chip beside it, which
 * always pairs its color with an arrow and a sign — status red and green measure
 * CVD ΔE 4.1 (deutan), so color alone cannot be the direction channel.
 *
 * One series means no legend: the surrounding row label says what is plotted.
 */
export function Sparkline({ values, width = 72, height = 24, label, fill = false }: Props) {
  const clipId = useId()

  if (values.length < 2) {
    return <svg width={width} height={height} role="img" aria-label={`${label}: not enough data`} />
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  // Inset by the mark radius so the 2px stroke and end-dot never clip.
  const pad = 4
  const w = width - pad * 2
  const h = height - pad * 2

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w
    const y = pad + h - ((v - min) / span) * h
    return [x, y] as const
  })

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const [lastX, lastY] = points[points.length - 1]!

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {fill && (
        <>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={width} height={height} />
          </clipPath>
          <path
            d={`${path} L${lastX.toFixed(2)},${height} L${pad},${height} Z`}
            fill="var(--series-1)"
            opacity="0.1"
            clipPath={`url(#${clipId})`}
          />
        </>
      )}

      <path
        d={path}
        fill="none"
        stroke="var(--series-1)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* End-dot with a 2px ring in the surface color, so it stays legible
          where it sits against the line or a neighbouring mark. */}
      <circle cx={lastX} cy={lastY} r="3.5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  )
}
