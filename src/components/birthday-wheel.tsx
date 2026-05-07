'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { spring } from '@/lib/motion'
import {
  CX, CY,
  polarPoint, monthDayToDeg,
} from '@/lib/wheel-geometry'

// Brand pair drives every people-marker on the wheel — pin halos, agenda
// avatar rings, month labels — so per-org `(brand_primary, brand_accent)`
// flows through automatically. The wheel's outer month ring keeps its
// seasonal palette (calendar information design).
const BRAND_HALO = 'var(--ink)'
import {
  StaticAurora, WheelDefs, StaticMonthRing, StaticWeekRing, CenterGlass,
  seasonHueFor, monthLabelsFor,
} from './wheel-rings'
import { WheelAgendaShell, WheelAgendaSection } from './wheel-agenda'
import { useTeamMembers, type DerivedBirthday } from '@/hooks/use-team-members'
import { useT } from '@/lib/i18n/context'
import { getISOWeek } from '@/lib/dates'
import {
  formatDateT, weekdayFullT, weekdayAbbrT,
} from './year-wheel-shared'
import type { Dictionary } from '@/lib/i18n/types'
import type { WorkspaceSummary } from '@/lib/supabase/types'
import { WorkspaceBadge } from '@/components/workspace-switcher'

const PIN_R = 14
const PIN_RING_RADII = [245, 263, 281, 227, 209] // ring2-mid first, then fan out/in

export function BirthdayWheel({
  orgId,
  orgIds,
  workspaces,
  combinedView,
}: {
  orgId: string
  orgIds?: string[]
  workspaces?: WorkspaceSummary[]
  combinedView?: boolean
}) {
  const t = useT()
  const uid = useId().replace(/[^a-z0-9]/gi, '')
  const idPrefix = `bw-${uid}`

  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const year = today.getFullYear()
  const currentWeek = getISOWeek(today)
  const currentMonth = today.getMonth()
  const seasonHue = useMemo(() => seasonHueFor(today), [today])
  const monthLabels = monthLabelsFor(t)

  const effectiveOrgIds = orgIds ?? [orgId]
  const { birthdays, nextBirthday, loading } = useTeamMembers(effectiveOrgIds)

  const workspaceByOrgId = useMemo(() => {
    const map = new Map<string, WorkspaceSummary>()
    workspaces?.forEach((w) => map.set(w.org_id, w))
    return map
  }, [workspaces])

  const showBadges = !!combinedView && (workspaces?.length ?? 0) > 1
  const workspaceFor = (orgId: string) =>
    showBadges ? workspaceByOrgId.get(orgId) ?? null : null

  // Cluster birthdays by month-day → assign each pin a slot in the cluster.
  const placed = useMemo(() => {
    const byKey = new Map<string, DerivedBirthday[]>()
    for (const b of birthdays) {
      const m = b.nextDate.getMonth()
      const d = b.nextDate.getDate()
      const k = `${m}-${d}`
      const arr = byKey.get(k) ?? []
      arr.push(b)
      byKey.set(k, arr)
    }
    type Placed = DerivedBirthday & { deg: number; pinR: number; clusterSize: number; clusterIndex: number }
    const out: Placed[] = []
    byKey.forEach((cluster) => {
      cluster.sort((a, b) => (a.member.display_name).localeCompare(b.member.display_name))
      cluster.forEach((entry, idx) => {
        const m = entry.nextDate.getMonth()
        const d = entry.nextDate.getDate()
        const { deg } = monthDayToDeg(m, d, entry.nextDate.getFullYear())
        const pinR = PIN_RING_RADII[Math.min(idx, PIN_RING_RADII.length - 1)]
        out.push({ ...entry, deg, pinR, clusterSize: cluster.length, clusterIndex: idx })
      })
    })
    return out
  }, [birthdays])

  // Bucket the agenda into the four sections.
  const sections = useMemo(() => bucketBirthdays(birthdays, today, t), [birthdays, today, t])

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
            <clipPath id={`${idPrefix}-avatar-clip`} clipPathUnits="objectBoundingBox">
              <circle cx="0.5" cy="0.5" r="0.5" />
            </clipPath>
            <radialGradient id={`${idPrefix}-pin-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F5C861" stopOpacity="0.7" />
              <stop offset="60%" stopColor="#F5C861" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#F5C861" stopOpacity="0" />
            </radialGradient>
          </defs>

          <StaticMonthRing year={year} currentMonth={currentMonth} idPrefix={idPrefix} monthLabels={monthLabels} />
          <StaticWeekRing year={year} currentWeek={currentWeek} today={today} idPrefix={idPrefix} />

          {/* Subtle ghost-ring outline for the pin track */}
          <circle cx={CX} cy={CY} r={245} fill="none" stroke="var(--border-subtle)" strokeOpacity={0.4} strokeWidth={0.5} />

          {/* Pins */}
          {placed.map((p, idx) => (
            <BirthdayPin
              key={p.member.id}
              entry={p}
              idPrefix={idPrefix}
              delay={0.18 + idx * 0.025}
              workspace={workspaceFor(p.member.org_id)}
            />
          ))}

          <CenterGlass idPrefix={idPrefix} />
          <BirthdayCenter
            next={nextBirthday}
            empty={!loading && birthdays.length === 0}
            idPrefix={idPrefix}
            t={t}
          />
        </motion.svg>
      </div>

      <WheelAgendaShell>
        <WheelAgendaSection
          title={t.wheel.birthdays.sections.today}
          meta={formatAgendaMeta(today, t)}
          empty={t.wheel.birthdays.sections.todayEmpty}
        >
          {sections.today.map(b => (
            <BirthdayRow key={b.member.id} entry={b} t={t} workspace={workspaceFor(b.member.org_id)} />
          ))}
        </WheelAgendaSection>

        <WheelAgendaSection
          title={t.wheel.birthdays.sections.thisWeek}
          empty={t.wheel.birthdays.sections.weekEmpty}
        >
          {sections.week.map(b => (
            <BirthdayRow key={b.member.id} entry={b} t={t} workspace={workspaceFor(b.member.org_id)} />
          ))}
        </WheelAgendaSection>

        <WheelAgendaSection
          title={t.wheel.birthdays.sections.thisMonth}
          empty={t.wheel.birthdays.sections.monthEmpty}
        >
          {sections.month.map(b => (
            <BirthdayRow key={b.member.id} entry={b} t={t} workspace={workspaceFor(b.member.org_id)} />
          ))}
        </WheelAgendaSection>

        {sections.later.length > 0 && (
          <WheelAgendaSection title={t.wheel.birthdays.sections.laterThisYear}>
            {sections.later.map(b => (
              <BirthdayRow key={b.member.id} entry={b} t={t} workspace={workspaceFor(b.member.org_id)} />
            ))}
          </WheelAgendaSection>
        )}
      </WheelAgendaShell>
    </div>
  )
}

// ─── Pin ──────────────────────────────────────────────────────────

function BirthdayPin({
  entry, idPrefix, delay, workspace,
}: {
  entry: { member: { id: string; display_name: string; full_name: string | null; initials: string | null; avatar_url: string | null }
    nextDate: Date; daysUntil: number; ageOnDate: number | null; deg: number; pinR: number }
  idPrefix: string
  delay: number
  workspace: WorkspaceSummary | null
}) {
  const { x, y } = polarPoint(entry.pinR, entry.deg)
  const halo = BRAND_HALO
  const isToday = entry.daysUntil === 0
  const initials = entry.member.initials ?? entry.member.display_name.charAt(0).toUpperCase()
  const [hovered, setHovered] = useState(false)
  const reduce = useReducedMotion()

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring.gentle, delay }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {isToday && !reduce && (
        <motion.circle
          cx={x} cy={y} r={28}
          fill={`url(#${idPrefix}-pin-glow)`}
          animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.95, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: `${x}px ${y}px`, pointerEvents: 'none' }}
        />
      )}
      <motion.g
        animate={isToday && !reduce ? { scale: [1, 1.06, 1] } : undefined}
        transition={isToday && !reduce ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : undefined}
        style={{ transformOrigin: `${x}px ${y}px` }}
        whileHover={reduce ? undefined : { scale: 1.12 }}
      >
        <circle cx={x} cy={y} r={PIN_R + 1.5} fill={halo} />
        {entry.member.avatar_url ? (
          <image
            href={entry.member.avatar_url}
            x={x - PIN_R} y={y - PIN_R}
            width={PIN_R * 2} height={PIN_R * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${idPrefix}-avatar-clip)`}
          />
        ) : (
          <>
            <circle cx={x} cy={y} r={PIN_R} fill="var(--bg-elevated)" />
            <text
              x={x} y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight={700}
              fill="var(--text-primary)"
              style={{
                fontFamily: 'var(--font-body)',
                letterSpacing: '0.04em',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {initials.slice(0, 2)}
            </text>
          </>
        )}
      </motion.g>

      <AnimatePresence>
        {hovered && (
          <motion.foreignObject
            x={x - 90} y={y + PIN_R + 8}
            width={180} height={60}
            initial={{ opacity: 0, y: y + PIN_R + 4 }}
            animate={{ opacity: 1, y: y + PIN_R + 8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            style={{ overflow: 'visible', pointerEvents: 'none' }}
          >
            <div
              style={{
                background: 'color-mix(in oklab, var(--bg-elevated) 92%, transparent)',
                backdropFilter: 'blur(14px) saturate(180%)',
                WebkitBackdropFilter: 'blur(14px) saturate(180%)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '8px 10px',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-primary)',
                boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,0.12))',
                whiteSpace: 'nowrap',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>{entry.member.full_name ?? entry.member.display_name}</span>
                {workspace && <WorkspaceBadge workspace={workspace} size="sm" />}
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 2 }}>
                {entry.ageOnDate !== null ? `${entry.ageOnDate} år` : ''}
                {entry.ageOnDate !== null ? ' · ' : ''}
                {entry.daysUntil === 0 ? 'i dag' : entry.daysUntil === 1 ? 'i morgen' : `om ${entry.daysUntil} dager`}
              </div>
            </div>
          </motion.foreignObject>
        )}
      </AnimatePresence>
    </motion.g>
  )
}

// ─── Center hero ──────────────────────────────────────────────────

function BirthdayCenter({
  next, empty, idPrefix, t,
}: {
  next: DerivedBirthday | null
  empty: boolean
  idPrefix: string
  t: Dictionary
}) {
  if (empty) {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <text
          x={CX} y={CY - 6}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={20}
          fill="var(--text-secondary)"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 36, "SOFT" 80',
          }}
        >
          {t.wheel.birthdays.empty}
        </text>
      </g>
    )
  }
  if (!next) return null

  const { member, nextDate, daysUntil, ageOnDate } = next
  const isToday = daysUntil === 0
  const labelText = isToday
    ? t.wheel.birthdays.congrats.replace('{name}', member.display_name.split(' ')[0])
    : t.wheel.birthdays.nextBirthday.toUpperCase()
  const initials = member.initials ?? member.display_name.slice(0, 2).toUpperCase()
  const avatarSize = 64
  const ax = CX - avatarSize / 2
  const ay = CY - avatarSize - 14

  return (
    <g style={{ pointerEvents: 'none' }}>
      <text
        x={CX} y={CY - 100}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        fill={isToday ? 'var(--ember, var(--accent-color))' : 'var(--text-tertiary)'}
        style={{
          fontFamily: 'var(--font-manrope), system-ui, sans-serif',
          letterSpacing: '0.32em',
        }}
      >
        {labelText}
      </text>

      {member.avatar_url ? (
        <>
          <circle cx={CX} cy={ay + avatarSize / 2} r={avatarSize / 2 + 2} fill={BRAND_HALO} opacity={0.65} />
          <image
            href={member.avatar_url}
            x={ax} y={ay}
            width={avatarSize} height={avatarSize}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${idPrefix}-avatar-clip)`}
          />
        </>
      ) : (
        <>
          <circle cx={CX} cy={ay + avatarSize / 2} r={avatarSize / 2 + 2} fill={BRAND_HALO} opacity={0.65} />
          <circle cx={CX} cy={ay + avatarSize / 2} r={avatarSize / 2} fill="var(--bg-elevated)" />
          <text
            x={CX} y={ay + avatarSize / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={22}
            fontWeight={500}
            fill="var(--text-primary)"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              letterSpacing: '0.04em',
            }}
          >
            {initials.slice(0, 2)}
          </text>
        </>
      )}

      <text
        x={CX} y={CY + 18}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={26}
        fontWeight={500}
        fill="var(--text-primary)"
        style={{
          fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
          fontStyle: 'italic',
          fontVariationSettings: '"opsz" 60, "SOFT" 80',
          letterSpacing: '-0.02em',
        }}
      >
        {member.full_name ?? member.display_name}
      </text>

      {ageOnDate !== null && (
        <text
          x={CX} y={CY + 46}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={14}
          fill="var(--ember, var(--accent-color))"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 24, "SOFT" 60',
            fontWeight: 450,
          }}
        >
          {t.wheel.birthdays.turnsAge.replace('{age}', String(ageOnDate))}
        </text>
      )}

      <text
        x={CX} y={CY + 72}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10.5}
        fontWeight={600}
        fill="var(--text-secondary)"
        fillOpacity={0.85}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
          letterSpacing: '0.18em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatCountdown(nextDate, daysUntil, t).toUpperCase()}
      </text>
    </g>
  )
}

// ─── Agenda row ───────────────────────────────────────────────────

function BirthdayRow({
  entry, t, workspace,
}: {
  entry: DerivedBirthday
  t: Dictionary
  workspace: WorkspaceSummary | null
}) {
  const m = entry.nextDate.getMonth()
  const halo = BRAND_HALO
  const initials = entry.member.initials ?? entry.member.display_name.slice(0, 2).toUpperCase()

  return (
    <motion.li
      whileHover={{ x: 2 }}
      className="flex items-start gap-3 px-2 py-2 -mx-2 rounded-xl cursor-default transition-colors hover:bg-[var(--bg-subtle)]"
    >
      <div className="flex flex-col items-center justify-center w-10 flex-shrink-0 pt-0.5 gap-0.5">
        <span
          className="text-[17px] font-semibold tabular-nums leading-none"
          style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-fraunces)',
            letterSpacing: '-0.02em',
          }}
        >
          {entry.nextDate.getDate()}
        </span>
        <span
          className="text-[9px] uppercase font-semibold"
          style={{
            color: halo,
            fontFamily: 'var(--font-body)',
            letterSpacing: '0.14em',
          }}
        >
          {t.dates.monthsShort[m]}
        </span>
        <span
          className="text-[9px] uppercase mt-0.5"
          style={{
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            letterSpacing: '0.14em',
          }}
        >
          {weekdayAbbrT(entry.nextDate, t)}
        </span>
      </div>

      <div
        className="w-[2px] rounded-full flex-shrink-0 self-stretch"
        style={{ background: `linear-gradient(180deg, ${halo}ee, ${halo}55)` }}
      />

      <div className="flex-shrink-0 self-center">
        {entry.member.avatar_url ? (
          <img
            src={entry.member.avatar_url}
            alt=""
            className="w-7 h-7 rounded-full object-cover"
            style={{ boxShadow: `0 0 0 1.5px ${halo}` }}
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold"
            style={{
              background: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              boxShadow: `0 0 0 1.5px ${halo}`,
              fontFamily: 'var(--font-body)',
            }}
          >
            {initials.slice(0, 2)}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5 self-center">
        <div className="flex items-center gap-1.5 min-w-0">
          <p
            className="text-[13.5px] font-medium truncate leading-snug"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          >
            {entry.member.full_name ?? entry.member.display_name}
          </p>
          {workspace && (
            <span className="flex-shrink-0">
              <WorkspaceBadge workspace={workspace} size="sm" />
            </span>
          )}
        </div>
        <span
          className="text-[10.5px] font-medium"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {entry.ageOnDate !== null
            ? t.wheel.birthdays.turnsAge.replace('{age}', String(entry.ageOnDate))
            : ''}
          {entry.daysUntil > 0 ? ` · ${formatRelative(entry.daysUntil, t)}` : ''}
        </span>
      </div>
    </motion.li>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

function bucketBirthdays(birthdays: DerivedBirthday[], today: Date, t: Dictionary): {
  today: DerivedBirthday[]
  week: DerivedBirthday[]
  month: DerivedBirthday[]
  later: DerivedBirthday[]
} {
  void t
  const todayBucket: DerivedBirthday[] = []
  const week: DerivedBirthday[] = []
  const month: DerivedBirthday[] = []
  const later: DerivedBirthday[] = []
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  for (const b of birthdays) {
    if (b.daysUntil === 0) { todayBucket.push(b); continue }
    if (b.daysUntil > 0 && b.daysUntil <= 7) { week.push(b); continue }
    if (b.nextDate.getFullYear() === currentYear && b.nextDate.getMonth() === currentMonth) {
      month.push(b); continue
    }
    if (b.nextDate.getFullYear() === currentYear) { later.push(b); continue }
    later.push(b)
  }
  return { today: todayBucket, week, month, later }
}

function formatAgendaMeta(d: Date, t: Dictionary): string {
  const day = d.getDate()
  const wd = weekdayAbbrT(d, t)
  return `${day}. ${wd}.`
}

function formatRelative(days: number, t: Dictionary): string {
  if (days === 0) return t.wheel.birthdays.daysUntil.zero
  if (days === 1) return t.wheel.birthdays.daysUntil.one
  return t.wheel.birthdays.daysUntil.other.replace('{n}', String(days))
}

function formatCountdown(date: Date, days: number, t: Dictionary): string {
  const wd = weekdayFullT(date, t)
  const dt = formatDateT(date, t)
  if (days === 0) return `${t.wheel.birthdays.daysUntil.zero} · ${wd} ${dt}`
  if (days === 1) return `${t.wheel.birthdays.daysUntil.one} · ${wd} ${dt}`
  return `${t.wheel.birthdays.daysUntil.other.replace('{n}', String(days))} · ${wd} ${dt}`
}
