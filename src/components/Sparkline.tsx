import { useId, useState, useRef } from 'react'

type Props = {
  values: number[]
  width?: number
  height?: number
  /** Accessible description; the SVG is labelled with it. */
  label: string
  /** Draw the ~10% wash under the line. */
  fill?: boolean
  /** Optional custom value formatter for the hover tooltip. */
  formatValue?: (v: number) => string
}

/**
 * A single-series sparkline: 2px line, round caps, an end-dot with a 2px
 * surface ring, an optional 10% wash, and interactive hover tooltip tracking.
 *
 * Deliberately one neutral hue (--series-1) regardless of whether the series is
 * rising or falling. Direction is carried by the `<Delta>` chip beside it, which
 * always pairs its color with an arrow and a sign — status red and green measure
 * CVD ΔE 4.1 (deutan), so color alone cannot be the direction channel.
 */
export function Sparkline({
  values,
  width = 72,
  height = 24,
  label,
  fill = false,
  formatValue,
}: Props) {
  const clipId = useId()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

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

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const relativeX = e.clientX - rect.left
    // Calculate nearest data point index
    const ratio = Math.max(0, Math.min(1, (relativeX - pad) / w))
    const index = Math.round(ratio * (values.length - 1))
    setHoverIndex(index)
  }

  const handlePointerLeave = () => {
    setHoverIndex(null)
  }

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null
  const activeValue = hoverIndex !== null ? values[hoverIndex] : null
  const displayValue =
    activeValue !== null && activeValue !== undefined
      ? formatValue
        ? formatValue(activeValue)
        : activeValue.toFixed(activeValue < 10 && activeValue > -10 ? 2 : 1)
      : ''

  return (
    <div className="sparkline-wrap" style={{ position: 'relative', display: 'inline-block' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        style={{ display: 'block', overflow: 'visible', cursor: 'crosshair', touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
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

        {/* Static End-dot when not hovering */}
        {hoverIndex === null && (
          <circle cx={lastX} cy={lastY} r="3.5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
        )}

        {/* Hover tracker */}
        {activePoint && (
          <>
            <line
              x1={activePoint[0]}
              y1={0}
              x2={activePoint[0]}
              y2={height}
              stroke="var(--ink-secondary)"
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.6"
            />
            <circle
              cx={activePoint[0]}
              cy={activePoint[1]}
              r="4.5"
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          </>
        )}
      </svg>

      {hoverIndex !== null && displayValue && (
        <div
          className="sparkline-tooltip"
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: `${activePoint ? activePoint[0] : width / 2}px`,
            transform: 'translate(-50%, -4px)',
            pointerEvents: 'none',
            zIndex: 30,
          }}
        >
          {displayValue}
        </div>
      )}
    </div>
  )
}
