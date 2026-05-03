'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { spring } from '@/lib/motion'
import {
  CX, CY, R,
  polarPoint, annularArc, labelArcPath,
} from '@/lib/wheel-geometry'
import { StaticAurora, WheelDefs, CenterGlass, seasonHueFor } from './wheel-rings'
import { WheelAgendaShell, WheelAgendaSection } from './wheel-agenda'
import { StrategyEditor } from './strategy-editor'
import { useStrategyThemes } from '@/hooks/use-strategy-themes'
import { useT } from '@/lib/i18n/context'
import type { StrategyStatus, StrategyTheme } from '@/lib/supabase/types'
import type { Dictionary } from '@/lib/i18n/types'

// ─── Status palette ───────────────────────────────────────────────
// Light/dark pair per status — same shape as MONTH_HSL so the radial
// gradient on the outer band reads with depth.

export const STATUS_HSL: Record<StrategyStatus, [string, string]> = {
  on_track:  ['hsl(150, 60%, 55%)', 'hsl(150, 55%, 38%)'],
  at_risk:   ['hsl( 42, 90%, 60%)', 'hsl( 38, 85%, 42%)'],
  off_track: ['hsl(  5, 75%, 58%)', 'hsl(  2, 70%, 42%)'],
  done:      ['hsl(265, 55%, 60%)', 'hsl(260, 50%, 42%)'],
}

export const STATUS_HEX: Record<StrategyStatus, string> = {
  on_track:  '#16A362',
  at_risk:   '#E8B400',
  off_track: '#E63946',
  done:      '#8B5CF6',
}

// Empty quarter: muted gray pair so the band visually recedes.
const EMPTY_HSL: [string, string] = ['hsl(220, 8%, 56%)', 'hsl(220, 10%, 38%)']

// ─── Quarter helpers ──────────────────────────────────────────────

type Q = 1 | 2 | 3 | 4
const QUARTERS: Q[] = [1, 2, 3, 4]

function currentQuarter(d: Date): Q {
  const m = d.getMonth() // 0..11
  return (Math.floor(m / 3) + 1) as Q
}

// 0° at top, sweep clockwise. Each quarter spans 90°.
function quarterDegRange(q: Q): [number, number] {
  const start = (q - 1) * 90
  return [start, start + 90]
}

// ─── Wheel ────────────────────────────────────────────────────────

export function StrategyWheel({ orgId }: { orgId: string }) {
  const t = useT()
  const uid = useId().replace(/[^a-z0-9]/gi, '')
  const idPrefix = `sw-${uid}`

  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const [year, setYear] = useState(() => new Date().getFullYear())
  const seasonHue = useMemo(() => seasonHueFor(today), [today])

  const { themes, refetch } = useStrategyThemes(orgId, year)

  // Map quarter → theme (or null for empty quarters).
  const byQuarter = useMemo(() => {
    const map = new Map<Q, StrategyTheme>()
    for (const th of themes) map.set(th.quarter as Q, th)
    return map
  }, [themes])

  const currentQ = currentQuarter(today)
  const isCurrentYear = year === today.getFullYear()

  const [editingQuarter, setEditingQuarter] = useState<Q | null>(null)
  const editingTheme = editingQuarter ? byQuarter.get(editingQuarter) ?? null : null

  return (
    <div className="relative w-full max-w-[1180px] flex items-start gap-5 xl:gap-7 justify-center flex-wrap xl:flex-nowrap">
      <div className="relative w-full max-w-[820px] aspect-square flex-shrink-0">
        <StaticAurora seasonHue={seasonHue} />
        <motion.svg
          viewBox="-28 -28 856 856"
          className="relative w-full h-full"
          style={{ overflow: 'visible' }}
          initial={{ opacity: 0, rotate: -6, scale: 0.96 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          transition={{ ...spring.smooth, delay: 0.05 }}
        >
          <WheelDefs idPrefix={idPrefix} seasonHue={seasonHue} />
          <defs>
            {QUARTERS.map(q => {
              const th = byQuarter.get(q)
              const status = th?.status as StrategyStatus | undefined
              const [light, dark] = status ? STATUS_HSL[status] : EMPTY_HSL
              return (
                <radialGradient
                  key={q}
                  id={`${idPrefix}-q-${q}`}
                  cx={CX} cy={CY}
                  r={R.ring1Outer}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset={R.ring2Inner / R.ring1Outer} stopColor={dark} />
                  <stop offset="1" stopColor={light} />
                </radialGradient>
              )
            })}
          </defs>

          {/* Quarter sectors */}
          {QUARTERS.map((q, idx) => {
            const [s, e] = quarterDegRange(q)
            const th = byQuarter.get(q) ?? null
            const isCurrent = isCurrentYear && q === currentQ
            return (
              <QuarterSector
                key={q}
                q={q}
                startDeg={s}
                endDeg={e}
                theme={th}
                isCurrent={isCurrent}
                idPrefix={idPrefix}
                t={t}
                delay={0.18 + idx * 0.06}
                onClick={() => setEditingQuarter(q)}
              />
            )
          })}

          <CenterGlass idPrefix={idPrefix} />
          <CenterHero
            year={year}
            current={byQuarter.get(currentQ) ?? null}
            currentQ={currentQ}
            isCurrentYear={isCurrentYear}
            t={t}
          />
        </motion.svg>

        {/* Year nav — anchored to the wheel container */}
        <YearNav year={year} onChange={setYear} />
      </div>

      <WheelAgendaShell>
        <WheelAgendaSection
          title={t.wheel.strategy.themesThisYear}
          meta={String(year)}
        >
          {QUARTERS.map(q => {
            const th = byQuarter.get(q) ?? null
            return (
              <ThemeRow
                key={q}
                q={q}
                theme={th}
                isCurrent={isCurrentYear && q === currentQ}
                onClick={() => setEditingQuarter(q)}
                t={t}
              />
            )
          })}
        </WheelAgendaSection>
      </WheelAgendaShell>

      <AnimatePresence>
        {editingQuarter !== null && (
          <StrategyEditor
            open={editingQuarter !== null}
            orgId={orgId}
            year={year}
            quarter={editingQuarter}
            theme={editingTheme}
            onClose={() => setEditingQuarter(null)}
            onMutated={refetch}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sector ───────────────────────────────────────────────────────

function QuarterSector({
  q, startDeg, endDeg, theme, isCurrent, idPrefix, t, delay, onClick,
}: {
  q: Q
  startDeg: number
  endDeg: number
  theme: StrategyTheme | null
  isCurrent: boolean
  idPrefix: string
  t: Dictionary
  delay: number
  onClick: () => void
}) {
  const reduce = useReducedMotion()
  const [hovered, setHovered] = useState(false)
  const empty = !theme || !theme.title.trim()
  const status = theme?.status as StrategyStatus | undefined
  const accent = status ? STATUS_HEX[status] : 'var(--text-tertiary)'

  // Outer colored band (status color radial gradient).
  const outerPath = annularArc(R.ring1Outer, R.ring2Inner, startDeg, endDeg, 1.5)
  // Title curve: middle of the band, slightly closer to outer edge.
  const titleR = (R.ring1Outer + R.ring2Inner) / 2
  const titlePath = labelArcPath(titleR, startDeg, endDeg)
  // Quarter pill anchor: a bit outside the band, at midDeg.
  const midDeg = (startDeg + endDeg) / 2
  const pillR = R.ring1Outer + 22
  const pillPos = polarPoint(pillR, midDeg)
  // Inner hit area (full pie slice from band inwards) so the agenda click
  // and the wheel click land on the same logical region.
  const hitSlice = annularArc(R.ring1Outer, R.ring2Inner, startDeg, endDeg, 0)

  // The unique gradient id for this quarter (defined on the parent).
  const fillUrl = `url(#${idPrefix}-q-${q})`

  // Quarter label text (e.g. "Q1") + months caption.
  const qLabel = t.wheel.strategy.quarterLabel.replace('{n}', String(q))
  const monthsCaption = t.wheel.strategy.monthsLabels[q - 1] ?? ''

  // Title-arc id so <textPath> can reference it.
  const titlePathId = `${idPrefix}-title-${q}`

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring.smooth, delay }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        transformOrigin: `${CX}px ${CY}px`,
      }}
    >
      {/* Soft current-quarter glow behind the band */}
      {isCurrent && !reduce && (
        <motion.path
          d={annularArc(R.ring1Outer + 8, R.ring2Inner - 4, startDeg, endDeg, 1.5)}
          fill={accent}
          opacity={0.18}
          animate={{ opacity: [0.16, 0.28, 0.16] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ pointerEvents: 'none', filter: `url(#${idPrefix}-glow)` }}
        />
      )}

      {/* Colored band */}
      <motion.path
        d={outerPath}
        fill={fillUrl}
        opacity={empty ? 0.32 : 1}
        animate={hovered && !reduce ? { scale: 1.012 } : { scale: 1 }}
        transition={spring.gentle}
        style={{
          transformOrigin: `${CX}px ${CY}px`,
          stroke: empty ? 'var(--border-subtle)' : 'rgba(255,255,255,0.18)',
          strokeWidth: 0.75,
          strokeDasharray: empty ? '4 6' : 'none',
        }}
      />

      {/* Hit slice (transparent — keeps the cursor active over the whole band) */}
      <path d={hitSlice} fill="transparent" />

      {/* Title arc text */}
      <defs>
        <path id={titlePathId} d={titlePath} />
      </defs>
      {!empty && theme && (
        <text
          fontSize={20}
          fontWeight={500}
          fill="#ffffff"
          fillOpacity={0.96}
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 36, "SOFT" 60',
            letterSpacing: '0.005em',
            pointerEvents: 'none',
            textShadow: '0 1px 2px rgba(0,0,0,0.18)',
          }}
        >
          <textPath href={`#${titlePathId}`} startOffset="50%" textAnchor="middle">
            {clamp(theme.title, 36)}
          </textPath>
        </text>
      )}

      {/* Empty hint (only when hovered, otherwise just the dashed outline) */}
      {empty && hovered && (
        <text
          fontSize={14}
          fontWeight={600}
          fill="var(--text-secondary)"
          style={{
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.16em',
            pointerEvents: 'none',
            textTransform: 'uppercase',
          }}
        >
          <textPath href={`#${titlePathId}`} startOffset="50%" textAnchor="middle">
            {t.wheel.strategy.addTheme}
          </textPath>
        </text>
      )}

      {/* Quarter pill outside the band: "Q1 · JAN–MAR" */}
      <g
        style={{ pointerEvents: 'none' }}
        transform={`translate(${pillPos.x}, ${pillPos.y})`}
      >
        <foreignObject x={-58} y={-18} width={116} height={36} style={{ overflow: 'visible' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'color-mix(in oklab, var(--bg-elevated) 90%, transparent)',
              backdropFilter: 'blur(12px) saturate(180%)',
              WebkitBackdropFilter: 'blur(12px) saturate(180%)',
              border: `1px solid ${isCurrent ? accent : 'var(--border-subtle)'}`,
              boxShadow: isCurrent
                ? `0 0 0 2px color-mix(in oklab, ${accent} 18%, transparent), 0 6px 18px -8px ${accent}66`
                : 'var(--shadow-sm)',
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.16em',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: isCurrent ? accent : 'var(--text-secondary)' }}>{qLabel}</span>
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '0.18em', fontSize: 10 }}>·</span>
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, letterSpacing: '0.18em' }}>{monthsCaption}</span>
          </div>
        </foreignObject>
      </g>
    </motion.g>
  )
}

// ─── Center hero ──────────────────────────────────────────────────

function CenterHero({
  year, current, currentQ, isCurrentYear, t,
}: {
  year: number
  current: StrategyTheme | null
  currentQ: Q
  isCurrentYear: boolean
  t: Dictionary
}) {
  const titleText = t.wheel.strategy.title.replace('{year}', String(year))
  const hasCurrent = !!(current && current.title.trim())

  return (
    <g style={{ pointerEvents: 'none' }}>
      <text
        x={CX} y={CY - 70}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={700}
        fill="var(--text-tertiary)"
        style={{
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
        }}
      >
        {titleText}
      </text>

      {isCurrentYear ? (
        <>
          <text
            x={CX} y={CY - 32}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={600}
            fill="var(--text-tertiary)"
            style={{
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
            }}
          >
            {t.wheel.strategy.currentQuarter}
          </text>

          <text
            x={CX} y={CY + 4}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={42}
            fontWeight={500}
            fill="var(--text-primary)"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 60, "SOFT" 80',
              letterSpacing: '-0.02em',
            }}
          >
            {t.wheel.strategy.quarterLabel.replace('{n}', String(currentQ))}
          </text>

          {hasCurrent ? (
            <foreignObject x={CX - 130} y={CY + 30} width={260} height={64}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  textAlign: 'center',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-fraunces), Georgia, serif',
                    fontStyle: 'italic',
                  }}
                >
                  {clamp(current!.title, 28)}
                </span>
                <StatusPill status={current!.status} t={t} />
              </div>
            </foreignObject>
          ) : (
            <text
              x={CX} y={CY + 50}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={13}
              fill="var(--text-tertiary)"
              style={{
                fontFamily: 'var(--font-body)',
                fontStyle: 'italic',
              }}
            >
              {t.wheel.strategy.empty}
            </text>
          )}
        </>
      ) : (
        <text
          x={CX} y={CY + 6}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={48}
          fontWeight={500}
          fill="var(--text-primary)"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 60, "SOFT" 80',
            letterSpacing: '-0.02em',
          }}
        >
          {String(year)}
        </text>
      )}
    </g>
  )
}

// ─── Year nav ─────────────────────────────────────────────────────

function YearNav({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 -bottom-1 sm:-bottom-2 flex items-center gap-1 px-1 py-1 rounded-full"
      style={{
        background: 'color-mix(in oklab, var(--bg-elevated) 80%, transparent)',
        backdropFilter: 'blur(14px) saturate(180%)',
        WebkitBackdropFilter: 'blur(14px) saturate(180%)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <button
        type="button"
        onClick={() => onChange(year - 1)}
        className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-subtle)]"
        aria-label={`Forrige år (${year - 1})`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
      </button>
      <span
        className="px-2 text-[12.5px] font-semibold tabular-nums"
        style={{
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.04em',
          minWidth: 48,
          textAlign: 'center',
        }}
      >
        {year}
      </span>
      <button
        type="button"
        onClick={() => onChange(year + 1)}
        className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-subtle)]"
        aria-label={`Neste år (${year + 1})`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}

// ─── Agenda row ───────────────────────────────────────────────────

function ThemeRow({
  q, theme, isCurrent, onClick, t,
}: {
  q: Q
  theme: StrategyTheme | null
  isCurrent: boolean
  onClick: () => void
  t: Dictionary
}) {
  const empty = !theme || !theme.title.trim()
  const status = theme?.status as StrategyStatus | undefined
  const accent = status ? STATUS_HEX[status] : 'var(--text-tertiary)'
  const qLabel = t.wheel.strategy.quarterLabel.replace('{n}', String(q))
  const months = t.wheel.strategy.monthsLabels[q - 1] ?? ''

  return (
    <motion.li
      whileHover={{ x: 2 }}
      onClick={onClick}
      className="flex items-start gap-3 px-2 py-2 -mx-2 rounded-xl cursor-pointer transition-colors hover:bg-[var(--bg-subtle)]"
    >
      <div className="flex flex-col items-center justify-center w-12 flex-shrink-0 pt-0.5 gap-0.5">
        <span
          className="text-[16px] font-semibold tabular-nums leading-none"
          style={{
            color: isCurrent ? accent : 'var(--text-primary)',
            fontFamily: 'var(--font-fraunces)',
            letterSpacing: '-0.02em',
            fontStyle: 'italic',
          }}
        >
          {qLabel}
        </span>
        <span
          className="text-[9px] uppercase font-semibold"
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.16em',
          }}
        >
          {months}
        </span>
      </div>

      <div
        className="w-[2px] rounded-full flex-shrink-0 self-stretch"
        style={{ background: `linear-gradient(180deg, ${accent}ee, ${accent}55)` }}
      />

      <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
        {empty ? (
          <p
            className="text-[13.5px] flex items-center gap-1.5"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', fontStyle: 'italic' }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
            {t.wheel.strategy.addTheme}
          </p>
        ) : (
          <>
            <p
              className="text-[13.5px] font-medium truncate leading-snug"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            >
              {theme!.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusPill status={theme!.status} t={t} />
              {theme!.goal && (
                <span
                  className="text-[11px] truncate"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                >
                  {clamp(theme!.goal, 48)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </motion.li>
  )
}

// ─── Status pill ──────────────────────────────────────────────────

export function StatusPill({ status, t }: { status: StrategyStatus; t: Dictionary }) {
  const color = STATUS_HEX[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase"
      style={{
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color,
        fontFamily: 'var(--font-body)',
        letterSpacing: '0.14em',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 6px ${color}88`,
        }}
      />
      {t.wheel.strategy.statuses[status]}
    </span>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

function clamp(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

