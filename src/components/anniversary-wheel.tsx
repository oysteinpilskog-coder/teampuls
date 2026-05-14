'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { spring } from '@/lib/motion'
import {
  CX, CY,
  polarPoint, monthDayToDeg,
} from '@/lib/wheel-geometry'
import {
  StaticAurora, WheelDefs, StaticMonthRing, StaticWeekRing, CenterGlass,
  seasonHueFor, monthLabelsFor,
} from './wheel-rings'
import { WheelAgendaShell, WheelAgendaSection } from './wheel-agenda'
import { useTeamMembers, type DerivedAnniversary, type MemberSlim } from '@/hooks/use-team-members'
import { useT } from '@/lib/i18n/context'
import { getISOWeek } from '@/lib/dates'
import {
  formatDateT, weekdayFullT, weekdayAbbrT,
} from './year-wheel-shared'
import type { Dictionary } from '@/lib/i18n/types'
import { createClient } from '@/lib/supabase/client'
import type { WorkspaceSummary } from '@/lib/supabase/types'
import { WorkspaceBadge } from '@/components/workspace-switcher'

// Brand pair drives every people-marker on the wheel — pin halos, agenda
// avatar rings, month labels — so per-org `(brand_primary, brand_accent)`
// flows through automatically. Milestone gold (#E8B400) stays as the
// celebratory marker; the wheel's month ring keeps its seasonal palette.
const BRAND_HALO = 'var(--ink)'

const PIN_R = 14
const MILESTONE_PIN_R = 18
const PIN_RING_RADII = [245, 263, 281, 227, 209]

export function AnniversaryWheel({
  orgId,
  orgIds,
  workspaces,
  combinedView,
  initialMembers,
}: {
  orgId: string
  orgIds?: string[]
  workspaces?: WorkspaceSummary[]
  combinedView?: boolean
  /** SSR-prefetched member list — seeds useTeamMembers så pin-ene
   *  males i første frame uten flash. */
  initialMembers?: MemberSlim[]
}) {
  const t = useT()
  const uid = useId().replace(/[^a-z0-9]/gi, '')
  const idPrefix = `aw-${uid}`

  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const [orgName, setOrgName] = useState<string>('')
  useEffect(() => {
    const supabase = createClient()
    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()
      .then(({ data }) => setOrgName(data?.name ?? ''))
  }, [orgId])

  const year = today.getFullYear()
  const currentWeek = getISOWeek(today)
  const currentMonth = today.getMonth()
  const seasonHue = useMemo(() => seasonHueFor(today), [today])
  const monthLabels = monthLabelsFor(t)

  const effectiveOrgIds = orgIds ?? [orgId]
  const { anniversaries, upcomingHires, nextAnniversary, loading } = useTeamMembers(effectiveOrgIds, {
    initial: initialMembers,
  })

  const workspaceByOrgId = useMemo(() => {
    const map = new Map<string, WorkspaceSummary>()
    workspaces?.forEach((w) => map.set(w.org_id, w))
    return map
  }, [workspaces])

  const showBadges = !!combinedView && (workspaces?.length ?? 0) > 1
  const workspaceFor = (orgId: string) =>
    showBadges ? workspaceByOrgId.get(orgId) ?? null : null

  const placed = useMemo(() => {
    const byKey = new Map<string, DerivedAnniversary[]>()
    for (const a of anniversaries) {
      const m = a.nextDate.getMonth()
      const d = a.nextDate.getDate()
      byKey.set(`${m}-${d}`, [...(byKey.get(`${m}-${d}`) ?? []), a])
    }
    type Placed = DerivedAnniversary & { deg: number; pinR: number; clusterIndex: number }
    const out: Placed[] = []
    byKey.forEach((cluster) => {
      cluster.sort((a, b) => (a.member.display_name).localeCompare(b.member.display_name))
      cluster.forEach((entry, idx) => {
        const m = entry.nextDate.getMonth()
        const d = entry.nextDate.getDate()
        const { deg } = monthDayToDeg(m, d, entry.nextDate.getFullYear())
        const pinR = PIN_RING_RADII[Math.min(idx, PIN_RING_RADII.length - 1)]
        out.push({ ...entry, deg, pinR, clusterIndex: idx })
      })
    })
    return out
  }, [anniversaries])

  const sections = useMemo(() => bucketAnniversaries(anniversaries, today), [anniversaries, today])

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
            <radialGradient id={`${idPrefix}-milestone-glow`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F5C861" stopOpacity="0.7" />
              <stop offset="60%" stopColor="#F5C861" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#F5C861" stopOpacity="0" />
            </radialGradient>
          </defs>

          <StaticMonthRing year={year} currentMonth={currentMonth} idPrefix={idPrefix} monthLabels={monthLabels} />
          <StaticWeekRing year={year} currentWeek={currentWeek} today={today} idPrefix={idPrefix} />

          <circle cx={CX} cy={CY} r={245} fill="none" stroke="var(--border-subtle)" strokeOpacity={0.4} strokeWidth={0.5} />

          {placed.map((p, idx) => (
            <AnniversaryPin
              key={p.member.id}
              entry={p}
              idPrefix={idPrefix}
              delay={0.18 + idx * 0.025}
              workspace={workspaceFor(p.member.org_id)}
            />
          ))}

          <CenterGlass idPrefix={idPrefix} />
          <AnniversaryCenter
            next={nextAnniversary}
            empty={!loading && anniversaries.length === 0}
            idPrefix={idPrefix}
            orgName={orgName}
            t={t}
          />
        </motion.svg>
      </div>

      <WheelAgendaShell>
        <WheelAgendaSection
          title={t.wheel.anniversaries.sections.today}
          meta={formatAgendaMeta(today, t)}
          empty={t.wheel.anniversaries.sections.todayEmpty}
        >
          {sections.today.map(a => (
            <AnniversaryRow key={a.member.id} entry={a} t={t} workspace={workspaceFor(a.member.org_id)} />
          ))}
        </WheelAgendaSection>

        <WheelAgendaSection
          title={t.wheel.anniversaries.sections.thisWeek}
          empty={t.wheel.anniversaries.sections.weekEmpty}
        >
          {sections.week.map(a => (
            <AnniversaryRow key={a.member.id} entry={a} t={t} workspace={workspaceFor(a.member.org_id)} />
          ))}
        </WheelAgendaSection>

        <WheelAgendaSection
          title={t.wheel.anniversaries.sections.thisMonth}
          empty={t.wheel.anniversaries.sections.monthEmpty}
        >
          {sections.month.map(a => (
            <AnniversaryRow key={a.member.id} entry={a} t={t} workspace={workspaceFor(a.member.org_id)} />
          ))}
        </WheelAgendaSection>

        {sections.later.length > 0 && (
          <WheelAgendaSection title={t.wheel.anniversaries.sections.laterThisYear}>
            {sections.later.map(a => (
              <AnniversaryRow key={a.member.id} entry={a} t={t} workspace={workspaceFor(a.member.org_id)} />
            ))}
          </WheelAgendaSection>
        )}

        {upcomingHires.length > 0 && (
          <WheelAgendaSection title={t.wheel.anniversaries.sections.upcomingHires}>
            {upcomingHires.map(h => (
              <UpcomingHireRow key={h.member.id} entry={h} t={t} workspace={workspaceFor(h.member.org_id)} />
            ))}
          </WheelAgendaSection>
        )}
      </WheelAgendaShell>
    </div>
  )
}

// ─── Pin ──────────────────────────────────────────────────────────

function AnniversaryPin({
  entry, idPrefix, delay, workspace,
}: {
  entry: DerivedAnniversary & { deg: number; pinR: number }
  idPrefix: string
  delay: number
  workspace: WorkspaceSummary | null
}) {
  const { x, y } = polarPoint(entry.pinR, entry.deg)
  const halo = BRAND_HALO
  const [hovered, setHovered] = useState(false)
  const isToday = entry.daysUntil === 0
  const r = entry.isMilestone ? MILESTONE_PIN_R : PIN_R
  const initials = entry.member.initials ?? entry.member.display_name.slice(0, 2).toUpperCase()
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
      {(isToday || entry.isMilestone) && !reduce && (
        <motion.circle
          cx={x} cy={y} r={r + 14}
          fill={`url(#${idPrefix}-milestone-glow)`}
          animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: `${x}px ${y}px`, pointerEvents: 'none' }}
        />
      )}
      <motion.g
        whileHover={reduce ? undefined : { scale: 1.12 }}
        style={{ transformOrigin: `${x}px ${y}px` }}
      >
        {entry.isMilestone ? (
          <circle cx={x} cy={y} r={r + 2.5} fill={`url(#${idPrefix}-milestone-ring)`} />
        ) : (
          <circle cx={x} cy={y} r={r + 1.5} fill={halo} />
        )}
        {entry.member.avatar_url ? (
          <image
            href={entry.member.avatar_url}
            x={x - r} y={y - r}
            width={r * 2} height={r * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${idPrefix}-avatar-clip)`}
          />
        ) : (
          <>
            <circle cx={x} cy={y} r={r} fill="var(--bg-elevated)" />
            <text
              x={x} y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={entry.isMilestone ? 13 : 11}
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

      {/* Years label below the pin */}
      <text
        x={x} y={y + r + 12}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={entry.isMilestone ? 12 : 10.5}
        fontWeight={entry.isMilestone ? 700 : 600}
        fill={entry.isMilestone ? '#E8B400' : 'var(--text-secondary)'}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          letterSpacing: '0.06em',
          fontVariantNumeric: 'tabular-nums',
          pointerEvents: 'none',
          userSelect: 'none',
          textShadow: entry.isMilestone ? '0 1px 2px rgba(0,0,0,0.45)' : '0 1px 1px rgba(0,0,0,0.35)',
        }}
      >
        {entry.yearsOnDate}
      </text>

      <AnimatePresence>
        {hovered && (
          <motion.foreignObject
            x={x - 100} y={y + r + 18}
            width={200} height={60}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                whiteSpace: 'nowrap',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>{entry.member.full_name ?? entry.member.display_name}</span>
                {workspace && <WorkspaceBadge workspace={workspace} size="sm" />}
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 2 }}>
                {entry.yearsOnDate} år · {entry.daysUntil === 0 ? 'i dag' : entry.daysUntil === 1 ? 'i morgen' : `om ${entry.daysUntil} dager`}
              </div>
            </div>
          </motion.foreignObject>
        )}
      </AnimatePresence>
    </motion.g>
  )
}

// ─── Center hero ──────────────────────────────────────────────────

function AnniversaryCenter({
  next, empty, idPrefix, orgName, t,
}: {
  next: DerivedAnniversary | null
  empty: boolean
  idPrefix: string
  orgName: string
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
          {t.wheel.anniversaries.empty}
        </text>
      </g>
    )
  }
  if (!next) return null

  const { member, nextDate, daysUntil, yearsOnDate, isMilestone, startDate } = next
  const initials = member.initials ?? member.display_name.slice(0, 2).toUpperCase()
  const avatarSize = 64
  const ax = CX - avatarSize / 2
  const ay = CY - avatarSize - 14
  const haloColor = isMilestone ? '#E8B400' : BRAND_HALO

  return (
    <g style={{ pointerEvents: 'none' }}>
      <text
        x={CX} y={CY - 100}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        fill={isMilestone ? '#E8B400' : 'var(--text-tertiary)'}
        style={{
          fontFamily: 'var(--font-manrope), system-ui, sans-serif',
          letterSpacing: '0.32em',
        }}
      >
        {(isMilestone ? t.wheel.anniversaries.milestone : t.wheel.anniversaries.nextAnniversary).toUpperCase()}
      </text>

      {member.avatar_url ? (
        <>
          <circle cx={CX} cy={ay + avatarSize / 2} r={avatarSize / 2 + 2} fill={haloColor} opacity={0.8} />
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
          <circle cx={CX} cy={ay + avatarSize / 2} r={avatarSize / 2 + 2} fill={haloColor} opacity={0.8} />
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

      <text
        x={CX} y={CY + 46}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={14}
        fill={isMilestone ? '#E8B400' : 'var(--ember, var(--accent-color))'}
        style={{
          fontFamily: 'var(--font-fraunces), Georgia, serif',
          fontStyle: 'italic',
          fontVariationSettings: '"opsz" 24, "SOFT" 60',
          fontWeight: 450,
        }}
      >
        {orgName
          ? t.wheel.anniversaries.yearsAt.replace('{years}', String(yearsOnDate)).replace('{org}', orgName)
          : t.wheel.anniversaries.yearsLabel.replace('{years}', String(yearsOnDate))}
      </text>

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

      <text
        x={CX} y={CY + 92}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9.5}
        fontWeight={500}
        fill="var(--text-tertiary)"
        fillOpacity={0.78}
        style={{
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.14em',
        }}
      >
        {t.wheel.anniversaries.startedOn.replace('{date}', formatDateT(startDate, t))}
      </text>
    </g>
  )
}

// ─── Agenda rows ──────────────────────────────────────────────────

function AnniversaryRow({ entry, t, workspace }: { entry: DerivedAnniversary; t: Dictionary; workspace: WorkspaceSummary | null }) {
  const m = entry.nextDate.getMonth()
  const halo = entry.isMilestone ? '#E8B400' : BRAND_HALO
  const initials = entry.member.initials ?? entry.member.display_name.slice(0, 2).toUpperCase()

  return (
    <motion.li
      whileHover={{ x: 2 }}
      className="flex items-start gap-3 px-2 py-2 -mx-2 rounded-xl cursor-default transition-colors hover:bg-[var(--bg-subtle)]"
    >
      <div className="flex flex-col items-center justify-center w-10 flex-shrink-0 pt-0.5 gap-0.5">
        <span
          className="text-[17px] font-semibold tabular-nums leading-none"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)', letterSpacing: '-0.02em' }}
        >
          {entry.nextDate.getDate()}
        </span>
        <span
          className="text-[9px] uppercase font-semibold"
          style={{ color: halo, fontFamily: 'var(--font-body)', letterSpacing: '0.14em' }}
        >
          {t.dates.monthsShort[m]}
        </span>
        <span
          className="text-[9px] uppercase mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', fontWeight: 600, letterSpacing: '0.14em' }}
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
          className="text-[10.5px] font-medium tabular-nums"
          style={{ color: entry.isMilestone ? '#E8B400' : 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
        >
          {t.wheel.anniversaries.yearsLabel.replace('{years}', String(entry.yearsOnDate))}
          {entry.isMilestone ? ' · ' + t.wheel.anniversaries.milestone : ''}
        </span>
      </div>
    </motion.li>
  )
}

function UpcomingHireRow({
  entry, t, workspace,
}: {
  entry: { member: { id: string; display_name: string; full_name: string | null; initials: string | null; avatar_url: string | null }; startDate: Date; daysUntil: number }
  t: Dictionary
  workspace: WorkspaceSummary | null
}) {
  const m = entry.startDate.getMonth()
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
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-fraunces)', letterSpacing: '-0.02em' }}
        >
          {entry.startDate.getDate()}
        </span>
        <span
          className="text-[9px] uppercase font-semibold"
          style={{ color: halo, fontFamily: 'var(--font-body)', letterSpacing: '0.14em' }}
        >
          {t.dates.monthsShort[m]}
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
          {t.wheel.anniversaries.startedOn.replace('{date}', formatDateT(entry.startDate, t))}
        </span>
      </div>
    </motion.li>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

function bucketAnniversaries(anniversaries: DerivedAnniversary[], today: Date): {
  today: DerivedAnniversary[]
  week: DerivedAnniversary[]
  month: DerivedAnniversary[]
  later: DerivedAnniversary[]
} {
  const todayBucket: DerivedAnniversary[] = []
  const week: DerivedAnniversary[] = []
  const month: DerivedAnniversary[] = []
  const later: DerivedAnniversary[] = []
  const cy = today.getFullYear()
  const cm = today.getMonth()
  for (const a of anniversaries) {
    if (a.daysUntil === 0) { todayBucket.push(a); continue }
    if (a.daysUntil > 0 && a.daysUntil <= 7) { week.push(a); continue }
    if (a.nextDate.getFullYear() === cy && a.nextDate.getMonth() === cm) { month.push(a); continue }
    later.push(a)
  }
  return { today: todayBucket, week, month, later }
}

function formatAgendaMeta(d: Date, t: Dictionary): string {
  const day = d.getDate()
  const wd = weekdayAbbrT(d, t)
  return `${day}. ${wd}.`
}

function formatCountdown(date: Date, days: number, t: Dictionary): string {
  const wd = weekdayFullT(date, t)
  const dt = formatDateT(date, t)
  if (days === 0) return `${t.wheel.birthdays.daysUntil.zero} · ${wd} ${dt}`
  if (days === 1) return `${t.wheel.birthdays.daysUntil.one} · ${wd} ${dt}`
  return `${t.wheel.birthdays.daysUntil.other.replace('{n}', String(days))} · ${wd} ${dt}`
}
