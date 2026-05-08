'use client'

import { Fragment } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  CX, CY, R, MONTH_HSL, monthSweepStops,
  polarPoint, f, annularArc, labelArcPath,
  getMonthSegments, getWeekSegments,
} from '@/lib/wheel-geometry'
import { getWeekdayIdx } from './year-wheel-shared'
import type { Dictionary } from '@/lib/i18n/types'

// Aurora-bakgrunn — tre saktekrytsende fargeglow-flekker, samme språk som
// hendelseshjulet men uten parallax (de andre hjulene reagerer ikke på mus).

export function StaticAurora({ seasonHue }: { seasonHue: number }) {
  const reduce = useReducedMotion()
  return (
    <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none" aria-hidden>
      <motion.div
        className="absolute inset-[-18%] rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 30%, hsla(${seasonHue}, 88%, 66%, 0.30), transparent 58%)`,
          filter: 'blur(44px)',
        }}
        animate={reduce ? undefined : { x: [0, 20, -10, 0], y: [0, -15, 10, 0] }}
        transition={reduce ? undefined : { duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-[-18%] rounded-full"
        style={{
          background: `radial-gradient(circle at 75% 40%, hsla(${(seasonHue + 60) % 360}, 92%, 62%, 0.22), transparent 58%)`,
          filter: 'blur(44px)',
        }}
        animate={reduce ? undefined : { x: [0, -18, 12, 0], y: [0, 14, -8, 0] }}
        transition={reduce ? undefined : { duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-[-18%] rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 80%, hsla(${(seasonHue + 300) % 360}, 65%, 62%, 0.24), transparent 58%)`,
          filter: 'blur(46px)',
        }}
        animate={reduce ? undefined : { x: [0, 14, -16, 0], y: [0, -10, 12, 0] }}
        transition={reduce ? undefined : { duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-0 mix-blend-overlay"
        style={{
          opacity: 0.08,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>\")",
          backgroundSize: '240px 240px',
        }}
      />
    </div>
  )
}

// SVG `<defs>` for de delte gradientene (måneder, uke-aktiv, senter, beam).
// Tar et `idPrefix` så flere hjul kan side-om-side uten id-kollisjon.

export function WheelDefs({
  idPrefix, seasonHue,
}: { idPrefix: string; seasonHue: number }) {
  return (
    <defs>
      <filter id={`${idPrefix}-bloom`} x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="6" result="b1" />
        <feGaussianBlur stdDeviation="2" in="SourceGraphic" result="b2" />
        <feMerge>
          <feMergeNode in="b1" />
          <feMergeNode in="b2" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={`${idPrefix}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={`${idPrefix}-soft`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.12" />
      </filter>

      {Array.from({ length: 12 }, (_, i) => {
        const { dark, light } = monthSweepStops(i)
        return (
          <radialGradient
            key={i}
            id={`${idPrefix}-month-${i}`}
            cx={CX} cy={CY}
            r={R.monthOuter}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset={R.monthInner / R.monthOuter} stopColor={dark} />
            <stop offset="1" stopColor={light} />
          </radialGradient>
        )
      })}

      <linearGradient id={`${idPrefix}-week-active`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#00F5A0" />
        <stop offset="55%" stopColor="#00D9F5" />
        <stop offset="100%" stopColor="#7C3AED" />
      </linearGradient>

      <radialGradient id={`${idPrefix}-aurora`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.28" />
        <stop offset="55%" stopColor="var(--accent-color)" stopOpacity="0.08" />
        <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0" />
      </radialGradient>

      <radialGradient id={`${idPrefix}-center-bg`} cx="50%" cy="35%" r="80%">
        <stop offset="0%" stopColor="var(--bg-elevated)" stopOpacity="0.98" />
        <stop offset="65%" stopColor={`hsla(${seasonHue}, 70%, 88%, 0.38)`} stopOpacity="0.95" />
        <stop offset="100%" stopColor="var(--bg-elevated)" stopOpacity="0.82" />
      </radialGradient>

      {/* Gylden milestone-ring for jubileumshjulet */}
      <linearGradient id={`${idPrefix}-milestone-ring`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F5C861" />
        <stop offset="50%" stopColor="#E8B400" />
        <stop offset="100%" stopColor="#B98700" />
      </linearGradient>
    </defs>
  )
}

// Statisk månedsring — tolv segmenter, gjeldende måned får glow-filter.
// Etiketter ligger på en arc-path så bokstavene følger ringen.

export function StaticMonthRing({
  year, currentMonth, idPrefix, monthLabels,
}: {
  year: number
  currentMonth: number
  idPrefix: string
  monthLabels: readonly string[]
}) {
  const monthSegs = getMonthSegments(year)

  return (
    <>
      {/* textPath-targets */}
      {monthSegs.map(m => (
        <path
          key={`mp-${m.idx}`}
          id={`${idPrefix}-month-path-${m.idx}`}
          d={labelArcPath((R.monthOuter + R.monthInner) / 2, m.start, m.end)}
          fill="none"
        />
      ))}
      {monthSegs.map(m => {
        const isCurrent = m.idx === currentMonth
        const path = annularArc(R.monthOuter, R.monthInner, m.start, m.end, 0.5)
        return (
          <g key={m.name}>
            <path
              d={path}
              fill={`url(#${idPrefix}-month-${m.idx})`}
              stroke="var(--bg-primary)"
              strokeWidth={1}
              style={isCurrent ? { filter: `url(#${idPrefix}-glow)` } : undefined}
            />
            <text
              fontSize={isCurrent ? 13.5 : 12.5}
              fontWeight={isCurrent ? 800 : 700}
              fill="white"
              fillOpacity={0.98}
              style={{
                fontFamily: 'var(--font-body)',
                letterSpacing: '0.12em',
                userSelect: 'none',
                pointerEvents: 'none',
                textShadow: '0 1px 2px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.5)',
              }}
            >
              <textPath href={`#${idPrefix}-month-path-${m.idx}`} startOffset="50%" textAnchor="middle">
                {monthLabels[m.idx].toUpperCase()}
              </textPath>
            </text>
          </g>
        )
      })}
    </>
  )
}

// Statisk ukering — alle uker, gjeldende uke i Nordlys-gradient, dagens
// ukedag fremhevet med en lysere kile.

export function StaticWeekRing({
  year, currentWeek, today, idPrefix,
}: {
  year: number
  currentWeek: number
  today: Date
  idPrefix: string
}) {
  const weekSegs = getWeekSegments(year)
  const reduce = useReducedMotion()

  return (
    <>
      {weekSegs.map(w => {
        const isCurrent = w.weekNum === currentWeek
        const path = annularArc(R.weekOuter, R.weekInner, w.start, w.end, isCurrent ? 0.4 : 0.25)
        const mid = (w.start + w.end) / 2
        const showLabel = w.weekNum % 4 === 0 || w.weekNum === 1 || isCurrent
        const lblPoint = showLabel ? polarPoint((R.weekOuter + R.weekInner) / 2, mid) : null
        return (
          <g key={w.weekNum}>
            {isCurrent && (
              <motion.path
                d={annularArc(R.weekOuter + 6, R.weekInner - 6, w.start, w.end, 0.2)}
                fill="#00D9F5"
                style={{ filter: `url(#${idPrefix}-bloom)` }}
                initial={{ opacity: 0.3 }}
                animate={reduce ? { opacity: 0.5 } : { opacity: [0.35, 0.7, 0.35] }}
                transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            <path
              d={path}
              fill={isCurrent ? `url(#${idPrefix}-week-active)` : 'var(--bg-subtle)'}
              fillOpacity={isCurrent ? 1 : 0.5}
              stroke="var(--bg-primary)"
              strokeWidth={0.8}
            />
            {isCurrent && (() => {
              const dayWidth = (w.end - w.start) / 7
              const todayIdx = getWeekdayIdx(today)
              const todayStart = w.start + dayWidth * todayIdx
              const todayEnd = todayStart + dayWidth
              return (
                <Fragment>
                  {Array.from({ length: 6 }, (_, i) => {
                    const deg = w.start + dayWidth * (i + 1)
                    const o = polarPoint(R.weekOuter - 0.5, deg)
                    const n = polarPoint(R.weekInner + 0.5, deg)
                    return (
                      <line
                        key={`wd-div-${i}`}
                        x1={f(o.x)} y1={f(o.y)}
                        x2={f(n.x)} y2={f(n.y)}
                        stroke="white" strokeOpacity={0.28} strokeWidth={0.5}
                        style={{ pointerEvents: 'none' }}
                      />
                    )
                  })}
                  <path
                    d={annularArc(R.weekOuter - 1, R.weekInner + 1, todayStart, todayEnd, 0.05)}
                    fill="white"
                    fillOpacity={0.38}
                    style={{ pointerEvents: 'none' }}
                  />
                </Fragment>
              )
            })()}
            {lblPoint && (
              <text
                x={lblPoint.x} y={lblPoint.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={isCurrent ? 11.5 : 10}
                fontWeight={isCurrent ? 800 : 600}
                fill={isCurrent ? 'white' : 'var(--text-secondary)'}
                style={{
                  fontFamily: 'var(--font-body)',
                  letterSpacing: isCurrent ? '0.06em' : '0.04em',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  textShadow: isCurrent ? '0 1px 2px rgba(0,0,0,0.45)' : undefined,
                }}
              >
                {w.weekNum}
              </text>
            )}
          </g>
        )
      })}
    </>
  )
}

// Senter-glass — bakgrunns-sirkel som gir senter-innholdet et matt glasslag.

export function CenterGlass({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <circle cx={CX} cy={CY} r={R.centerRing + 24} fill={`url(#${idPrefix}-aurora)`} />
      <circle
        cx={CX} cy={CY}
        r={R.centerGlass}
        fill={`url(#${idPrefix}-center-bg)`}
        stroke="var(--border-subtle)"
        strokeWidth={1}
        style={{ filter: `url(#${idPrefix}-soft)` }}
      />
    </>
  )
}

// Convenience: utled `seasonHue` fra dagens dato (samme palett som hendelseshjulet).
export function seasonHueFor(date: Date): number {
  const month = date.getMonth()
  const [light] = MONTH_HSL[month]
  const m = light.match(/hsl\((\d+)/)
  return m ? Number(m[1]) : 220
}

// Lokalisert måneds-/ukenavn for label-laget.
export function monthLabelsFor(t: Dictionary): readonly string[] {
  return t.dates.monthsShort
}
