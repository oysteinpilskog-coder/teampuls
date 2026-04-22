'use client'

import { motion } from 'framer-motion'
import { EuropeMapCanvas, MAP_WIDTH, MAP_HEIGHT } from './europe-map-canvas'
import { project, resolveLocation } from '@/lib/geo'
import { placeLabels, textAnchorFor } from '@/lib/map-labels'
import { STATUS_COLORS } from '@/components/icons/status-icons'
import { spring } from '@/lib/motion'
import type { Member, Entry } from '@/lib/supabase/types'
import { getISOWeek } from '@/lib/dates'
import { useResolvedLocations } from '@/hooks/use-resolved-locations'
import { useMemo } from 'react'

interface CustomerMapViewProps {
  members: Member[]
  entries: Entry[]       // full week
  todayEntries: Entry[]  // deduped to one per member
  orgName: string
  time: Date
}

function pad(n: number) { return String(n).padStart(2, '0') }

interface CustomerCluster {
  id: string
  x: number
  y: number
  radius: number
  display: string
  memberIdsToday: Set<string>
  memberIdsWeek: Set<string>
  daysThisWeek: number
}

export function CustomerMapView({
  members,
  entries,
  todayEntries,
  orgName,
  time,
}: CustomerMapViewProps) {
  const hours = pad(time.getHours())
  const minutes = pad(time.getMinutes())
  const weekNum = getISOWeek(time)

  const memberById = new Map(members.map(m => [m.id, m]))
  const customerColor = STATUS_COLORS.customer.icon  // #FF7A1A

  // Collect free-text labels that the static dictionary can't resolve.
  // These get sent to Nominatim (cached in localStorage) and placed live.
  const unknownLabels = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) {
      if (e.status !== 'customer' && e.status !== 'travel') continue
      const label = (e.location_label ?? '').trim()
      if (!label || resolveLocation(label)) continue
      set.add(label)
    }
    return Array.from(set)
  }, [entries])
  const dynamicResolved = useResolvedLocations(unknownLabels)

  // Cluster by resolved lat/lng. Unresolved labels are collected for a sidebar.
  const byKey = new Map<string, CustomerCluster & { lat: number; lng: number }>()
  const unresolved = new Map<string, Set<string>>()  // label → member ids

  for (const e of entries) {
    if (e.status !== 'customer' && e.status !== 'travel') continue
    if (!memberById.has(e.member_id)) continue

    const label = (e.location_label ?? '').trim()
    let resolved = resolveLocation(label)
    if (!resolved && label) {
      const dyn = dynamicResolved.get(label)
      if (dyn) resolved = { lat: dyn.lat, lng: dyn.lng, display: dyn.display }
    }
    if (!resolved) {
      if (!label) continue
      const set = unresolved.get(label) ?? new Set<string>()
      set.add(e.member_id)
      unresolved.set(label, set)
      continue
    }

    const key = `${resolved.lat.toFixed(3)},${resolved.lng.toFixed(3)}`
    let cluster = byKey.get(key)
    if (!cluster) {
      const { x, y } = project(resolved.lat, resolved.lng, MAP_WIDTH, MAP_HEIGHT)
      cluster = {
        id: key,
        x, y,
        radius: 10,
        lat: resolved.lat,
        lng: resolved.lng,
        display: resolved.display,
        memberIdsToday: new Set(),
        memberIdsWeek: new Set(),
        daysThisWeek: 0,
      }
      byKey.set(key, cluster)
    }
    cluster.memberIdsWeek.add(e.member_id)
    cluster.daysThisWeek += 1
    if (todayEntries.some(te => te.id === e.id)) {
      cluster.memberIdsToday.add(e.member_id)
    }
  }

  const clusters = Array.from(byKey.values())
    .map<CustomerCluster>(c => ({
      id: c.id,
      x: c.x,
      y: c.y,
      radius: 12 + Math.sqrt(c.memberIdsWeek.size) * 7,
      display: c.display,
      memberIdsToday: c.memberIdsToday,
      memberIdsWeek: c.memberIdsWeek,
      daysThisWeek: c.daysThisWeek,
    }))
    .sort((a, b) => b.memberIdsWeek.size - a.memberIdsWeek.size)

  const visitorsToday = clusters.reduce((s, c) => s + c.memberIdsToday.size, 0)
  const visitorsWeek = new Set<string>()
  clusters.forEach(c => c.memberIdsWeek.forEach(id => visitorsWeek.add(id)))

  const placedLabels = placeLabels(clusters, { gap: 14, collisionRadius: 90 })

  return (
    <div className="relative h-full flex flex-col px-10 pt-6 pb-4 gap-4">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-shrink-0">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.05 }}
        >
          <p
            className="text-[13px] font-medium tracking-[0.22em] uppercase"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
          >
            {orgName}
          </p>
          <p
            className="text-[30px] font-semibold tracking-tight leading-none mt-1"
            style={{
              fontFamily: 'var(--font-sora)',
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.7) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Hos kunde
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-widest uppercase"
              style={{
                background: 'rgba(255,122,26,0.12)',
                border: '1px solid rgba(255,122,26,0.28)',
                color: '#FFB380',
                fontFamily: 'var(--font-body)',
              }}
            >
              <motion.span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: customerColor }}
                animate={{ opacity: [1, 0.35, 1], scale: [1, 1.25, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              Live · Uke {weekNum}
            </span>
            <span
              className="text-[12px]"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
            >
              {visitorsToday} ute hos kunde nå · {visitorsWeek.size} denne uken
            </span>
          </div>
        </motion.div>

        <motion.div
          className="tabular-nums text-right"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.12 }}
          style={{
            fontSize: '64px',
            fontWeight: 700,
            fontFamily: 'var(--font-sora)',
            letterSpacing: '-0.04em',
            background: 'linear-gradient(180deg, #ffffff 0%, #ffd4bb 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 24px rgba(255,122,26,0.22))',
          }}
        >
          {hours}:{minutes}
        </motion.div>
      </div>

      {/* ── Main area: map + side list ────────────────────────────── */}
      <div className="flex-1 grid grid-cols-[1fr_340px] gap-5 min-h-0">
        <motion.div
          className="relative rounded-3xl overflow-hidden min-h-0"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring.gentle, delay: 0.18 }}
          style={{
            background:
              'radial-gradient(ellipse at 50% 45%, rgba(255,120,40,0.08) 0%, rgba(5,5,7,0) 70%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.06), 0 40px 80px -40px rgba(0,0,0,0.5)',
          }}
        >
          <EuropeMapCanvas accent="#FF8A3D">
            {clusters.map((c, i) => {
              const countWeek = c.memberIdsWeek.size
              const activeToday = c.memberIdsToday.size > 0
              const radius = c.radius

              return (
                <g key={c.id} transform={`translate(${c.x} ${c.y})`}>
                  {activeToday && (
                    <>
                      <motion.circle
                        r={radius + 6}
                        fill="none"
                        stroke={customerColor}
                        strokeWidth={1.5}
                        opacity={0.45}
                        animate={{
                          r: [radius + 6, radius + 34, radius + 6],
                          opacity: [0.45, 0, 0.45],
                        }}
                        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeOut' }}
                      />
                      <motion.circle
                        r={radius + 12}
                        fill="none"
                        stroke={customerColor}
                        strokeWidth={1}
                        opacity={0.3}
                        animate={{
                          r: [radius + 12, radius + 54, radius + 12],
                          opacity: [0.3, 0, 0.3],
                        }}
                        transition={{ duration: 3.2, delay: 1.2, repeat: Infinity, ease: 'easeOut' }}
                      />
                    </>
                  )}

                  <circle
                    r={radius + 6}
                    fill={customerColor}
                    opacity={activeToday ? 0.26 : 0.08}
                    style={{ filter: 'blur(10px)' }}
                  />

                  <motion.circle
                    r={radius}
                    fill={customerColor}
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth={0.8}
                    opacity={activeToday ? 1 : 0.5}
                    initial={{ r: 0, opacity: 0 }}
                    animate={{ r: radius, opacity: activeToday ? 1 : 0.5 }}
                    transition={{ ...spring.gentle, delay: 0.3 + i * 0.07 }}
                    style={{
                      filter: activeToday
                        ? `drop-shadow(0 0 14px ${customerColor}) drop-shadow(0 2px 4px rgba(0,0,0,0.4))`
                        : `drop-shadow(0 0 4px ${customerColor}66)`,
                    }}
                  />

                  <circle
                    r={radius * 0.55}
                    cx={-radius * 0.22}
                    cy={-radius * 0.28}
                    fill="white"
                    opacity={activeToday ? 0.42 : 0.26}
                    style={{ filter: 'blur(1.2px)' }}
                  />

                  <text
                    x={0}
                    y={radius > 20 ? 6 : 4}
                    textAnchor="middle"
                    fontSize={radius > 24 ? 18 : 13}
                    fontWeight={700}
                    fontFamily="var(--font-sora)"
                    fill="white"
                    style={{ userSelect: 'none', letterSpacing: '-0.01em' }}
                  >
                    {countWeek}
                  </text>
                </g>
              )
            })}

            {/* Labels with collision-aware placement */}
            {placedLabels.map((pl, i) => {
              const anchor = textAnchorFor(pl.side)
              const c = pl.point
              const activeToday = c.memberIdsToday.size > 0
              return (
                <motion.g
                  key={`label-${c.id}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring.gentle, delay: 0.5 + i * 0.07 }}
                >
                  <text
                    x={pl.labelX}
                    y={pl.labelY}
                    textAnchor={anchor}
                    fontSize={17}
                    fontWeight={700}
                    fontFamily="var(--font-sora)"
                    fill="white"
                    letterSpacing={0.4}
                    style={{
                      paintOrder: 'stroke',
                      stroke: 'rgba(2,4,10,0.75)',
                      strokeWidth: 5,
                      strokeLinejoin: 'round',
                    }}
                  >
                    {c.display}
                  </text>
                  <text
                    x={pl.labelX}
                    y={pl.labelY + 18}
                    textAnchor={anchor}
                    fontSize={11}
                    fontFamily="var(--font-body)"
                    fill="rgba(255,255,255,0.55)"
                    letterSpacing={1.2}
                    style={{
                      textTransform: 'uppercase',
                      paintOrder: 'stroke',
                      stroke: 'rgba(2,4,10,0.7)',
                      strokeWidth: 4,
                      strokeLinejoin: 'round',
                    }}
                  >
                    {activeToday
                      ? `${c.memberIdsToday.size} her i dag`
                      : `${c.daysThisWeek} dag${c.daysThisWeek === 1 ? '' : 'er'} i uken`}
                  </text>
                </motion.g>
              )
            })}

            {clusters.length === 0 && (
              <text
                x={MAP_WIDTH / 2}
                y={MAP_HEIGHT / 2}
                textAnchor="middle"
                fontSize={22}
                fontFamily="var(--font-body)"
                fill="rgba(255,255,255,0.4)"
              >
                Ingen kundebesøk denne uken.
              </text>
            )}
          </EuropeMapCanvas>

          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[1px]"
            style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 100%)' }}
          />
        </motion.div>

        {/* ── Side list: top customer cities + unresolved ─────────── */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring.gentle, delay: 0.28 }}
          className="flex flex-col gap-5 min-h-0 overflow-y-auto"
        >
          <div
            className="rounded-2xl p-5 flex flex-col gap-3 flex-shrink-0"
            style={{
              background:
                'linear-gradient(155deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <h3
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
            >
              Mest besøkte denne uken
            </h3>

            {clusters.length === 0 ? (
              <p
                className="text-[14px]"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
              >
                Ingen registreringer.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {clusters.slice(0, 6).map((c, i) => {
                  const names = Array.from(c.memberIdsWeek)
                    .map(id => memberById.get(id)?.display_name.split(' ')[0] ?? '')
                    .filter(Boolean)
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...spring.gentle, delay: 0.4 + i * 0.05 }}
                      className="flex items-start gap-3"
                    >
                      <span
                        className="w-2 h-2 rounded-full mt-[7px] flex-shrink-0"
                        style={{
                          backgroundColor: customerColor,
                          boxShadow: `0 0 8px ${customerColor}`,
                          opacity: c.memberIdsToday.size > 0 ? 1 : 0.45,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className="text-[14px] font-semibold truncate"
                            style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-body)' }}
                          >
                            {c.display}
                          </span>
                          <span
                            className="text-[12px] tabular-nums flex-shrink-0"
                            style={{ color: '#FFB380', fontFamily: 'var(--font-sora)' }}
                          >
                            {c.memberIdsWeek.size}
                          </span>
                        </div>
                        <p
                          className="text-[11px] truncate"
                          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
                        >
                          {names.join(', ')}
                        </p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>

          {unresolved.size > 0 && (
            <div
              className="rounded-2xl p-5 flex flex-col gap-2.5 flex-shrink-0"
              style={{
                background:
                  'linear-gradient(155deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px dashed rgba(255,255,255,0.08)',
              }}
            >
              <h3
                className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
              >
                Ukjente steder
              </h3>
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
              >
                {Array.from(unresolved.keys()).slice(0, 4).join(' · ')}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
