'use client'

import { motion } from 'framer-motion'
import { EuropeMapCanvas, MAP_WIDTH, MAP_HEIGHT } from './europe-map-canvas'
import { MapPin } from './map-pin'
import { GhostPin } from './ghost-pin'
import { project, resolveLocation } from '@/lib/geo'
import { resolveCustomer } from '@/lib/customer-resolver'
import { placeLabels, textAnchorFor } from '@/lib/map-labels'
import { useStatusColors } from '@/lib/status-colors/context'
import { spring } from '@/lib/motion'
import type { Member, Entry, Customer } from '@/lib/supabase/types'
import { getISOWeek } from '@/lib/dates'
import { useResolvedLocations } from '@/hooks/use-resolved-locations'
import { useT } from '@/lib/i18n/context'
import { useMemo } from 'react'

interface CustomerMapViewProps {
  members: Member[]
  entries: Entry[]       // full week
  todayEntries: Entry[]  // deduped to one per member
  customers: Customer[]  // org customer registry
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
  isKnownCustomer: boolean
  /** The customer.id when the cluster resolved via the registry — lets us
   *  subtract visited customers from the registry list and avoid rendering
   *  a ghost pin on top of a live pin at the same coordinates. */
  customerId: string | null
  memberIdsToday: Set<string>
  memberIdsWeek: Set<string>
  daysThisWeek: number
}

export function CustomerMapView({
  members,
  entries,
  todayEntries,
  customers,
  orgName,
  time,
}: CustomerMapViewProps) {
  const STATUS_COLORS = useStatusColors()
  const t = useT()
  const hours = pad(time.getHours())
  const minutes = pad(time.getMinutes())
  const weekNum = getISOWeek(time)

  const memberById = new Map(members.map(m => [m.id, m]))
  const customerColor = STATUS_COLORS.customer.icon

  // Resolution priority: customer registry → city dictionary → Nominatim.
  // Anything the customer registry handles skips Nominatim entirely, which
  // is how "Diplomat" gets onto Skøyen instead of a random foreign city.
  const unknownLabels = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) {
      if (e.status !== 'customer' && e.status !== 'travel') continue
      const label = (e.location_label ?? '').trim()
      if (!label) continue
      if (resolveCustomer(label, customers)) continue
      if (resolveLocation(label)) continue
      set.add(label)
    }
    return Array.from(set)
  }, [entries, customers])
  const dynamicResolved = useResolvedLocations(unknownLabels)

  // Cluster by resolved lat/lng. Unresolved labels are collected for a sidebar.
  const byKey = new Map<string, CustomerCluster & { lat: number; lng: number; isKnownCustomer: boolean }>()
  const unresolved = new Map<string, Set<string>>()  // label → member ids

  for (const e of entries) {
    if (e.status !== 'customer' && e.status !== 'travel') continue
    if (!memberById.has(e.member_id)) continue

    const label = (e.location_label ?? '').trim()
    let resolved: { lat: number; lng: number; display: string } | null = null
    let isKnownCustomer = false
    let customerId: string | null = null

    // 1) Customer registry (authoritative)
    const asCustomer = resolveCustomer(label, customers)
    if (asCustomer) {
      resolved = { lat: asCustomer.lat, lng: asCustomer.lng, display: asCustomer.display }
      isKnownCustomer = true
      customerId = asCustomer.customer.id
    }
    // 2) Static city dictionary
    if (!resolved) resolved = resolveLocation(label)
    // 3) Nominatim fallback
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
        isKnownCustomer,
        customerId,
        memberIdsToday: new Set(),
        memberIdsWeek: new Set(),
        daysThisWeek: 0,
      }
      byKey.set(key, cluster)
    }
    // A cluster that resolves via any known customer is marked as such —
    // we show a subtle visual distinction between "real customer" and
    // "looked-up city" markers.
    if (isKnownCustomer) {
      cluster.isKnownCustomer = true
      if (customerId) cluster.customerId = customerId
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
      radius: 11,
      display: c.display,
      isKnownCustomer: c.isKnownCustomer,
      customerId: c.customerId,
      memberIdsToday: c.memberIdsToday,
      memberIdsWeek: c.memberIdsWeek,
      daysThisWeek: c.daysThisWeek,
    }))
    .sort((a, b) => b.memberIdsWeek.size - a.memberIdsWeek.size)

  // Portfolio: every registered customer with coords shows on the map.
  // Visited ones (already in `clusters`) keep the full aurora treatment;
  // the rest get ghost pins so the org's footprint is always visible.
  const visitedCustomerIds = new Set(
    clusters.map(c => c.customerId).filter((id): id is string => !!id)
  )
  const unvisitedCustomers = customers
    .filter(c =>
      c.latitude != null &&
      c.longitude != null &&
      !visitedCustomerIds.has(c.id)
    )
    .map(c => {
      const { x, y } = project(c.latitude!, c.longitude!, MAP_WIDTH, MAP_HEIGHT)
      return { id: c.id, name: c.name, city: c.city, x, y }
    })
    .filter(c => Number.isFinite(c.x) && Number.isFinite(c.y))

  const registeredCount = customers.filter(c => c.latitude != null && c.longitude != null).length
  const visitedCount = visitedCustomerIds.size
  const portfolioPct = registeredCount === 0 ? 0 : visitedCount / registeredCount

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
            {t.dashboard.customer.title}
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
              {t.matrix.weekLabel} {weekNum}
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
            {/* Ghost pins — every registered-but-unvisited customer.
             *  Rendered first so aurora pins sit on top when coords collide. */}
            {unvisitedCustomers.map((c, i) => (
              <motion.g
                key={`ghost-${c.id}`}
                transform={`translate(${c.x} ${c.y})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.25 + i * 0.04 }}
              >
                <GhostPin color={customerColor} index={i} />
              </motion.g>
            ))}

            {clusters.map((c, i) => (
              <g key={c.id} transform={`translate(${c.x} ${c.y})`}>
                <MapPin
                  radius={c.radius}
                  color={customerColor}
                  index={i}
                />
              </g>
            ))}

            {/* Labels with collision-aware placement */}
            {placedLabels.map((pl, i) => {
              const anchor = textAnchorFor(pl.side)
              const c = pl.point
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
                    fontWeight={600}
                    fontFamily="var(--font-sora)"
                    fill="white"
                    letterSpacing={0.3}
                    style={{
                      paintOrder: 'stroke',
                      stroke: 'rgba(2,4,10,0.75)',
                      strokeWidth: 4.5,
                      strokeLinejoin: 'round',
                    }}
                  >
                    {c.display}
                  </text>
                </motion.g>
              )
            })}

            {clusters.length === 0 && unvisitedCustomers.length === 0 && (
              <text
                x={MAP_WIDTH / 2}
                y={MAP_HEIGHT / 2}
                textAnchor="middle"
                fontSize={22}
                fontFamily="var(--font-body)"
                fill="rgba(255,255,255,0.4)"
              >
                {t.dashboard.noCustomerVisits}
              </text>
            )}
          </EuropeMapCanvas>

          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[1px]"
            style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 100%)' }}
          />
        </motion.div>

        {/* ── Side panel: portfolio → visited → unvisited ──────────── */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring.gentle, delay: 0.28 }}
          className="flex flex-col gap-4 min-h-0 overflow-hidden"
        >
          {/* Portfolio card — the headline number: how much of our
           *  customer base did the team touch this week. */}
          {registeredCount > 0 && (
            <div
              className="rounded-2xl p-5 flex flex-col gap-4 flex-shrink-0 relative overflow-hidden"
              style={{
                background:
                  'linear-gradient(155deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 40px -20px rgba(0,0,0,0.5)',
              }}
            >
              {/* ambient accent glow */}
              <div
                aria-hidden
                className="absolute -top-16 -right-16 w-40 h-40 rounded-full pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${customerColor}44 0%, transparent 70%)`,
                  filter: 'blur(18px)',
                }}
              />

              <div className="flex items-center justify-between relative">
                <h3
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}
                >
                  Kundeportefølje
                </h3>
                <span
                  className="text-[10px] tabular-nums uppercase tracking-[0.2em]"
                  style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
                >
                  Uke {weekNum}
                </span>
              </div>

              <div className="flex items-end gap-2 relative">
                <span
                  className="tabular-nums leading-none"
                  style={{
                    fontFamily: 'var(--font-sora)',
                    fontSize: 54,
                    fontWeight: 700,
                    letterSpacing: '-0.04em',
                    background: `linear-gradient(180deg, #ffffff 0%, ${customerColor} 130%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {visitedCount}
                </span>
                <span
                  className="tabular-nums pb-2"
                  style={{
                    fontFamily: 'var(--font-sora)',
                    fontSize: 20,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.45)',
                  }}
                >
                  / {registeredCount}
                </span>
                <span
                  className="pb-3 ml-auto text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
                >
                  besøkt
                </span>
              </div>

              {/* Progress rail — liquid fill */}
              <div className="relative h-[6px] rounded-full overflow-hidden">
                <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <motion.div
                  className="absolute top-0 left-0 h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${portfolioPct * 100}%` }}
                  transition={{ duration: 1.2, delay: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  style={{
                    background: `linear-gradient(90deg, ${customerColor}bb 0%, #ffffff 100%)`,
                    boxShadow: `0 0 18px ${customerColor}aa`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Visited this week */}
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
              Besøkt denne uken
            </h3>

            {clusters.length === 0 ? (
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
              >
                {registeredCount > 0
                  ? 'Ingen kunder besøkt ennå denne uken.'
                  : t.dashboard.noRegistrations}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {clusters.slice(0, 5).map((c, i) => {
                  const names = Array.from(c.memberIdsWeek)
                    .map(id => {
                      const m = memberById.get(id)
                      return m ? (m.full_name || m.display_name) : ''
                    })
                    .filter(Boolean)
                  const activeToday = c.memberIdsToday.size > 0
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...spring.gentle, delay: 0.4 + i * 0.05 }}
                      className="flex items-start gap-3"
                    >
                      <motion.span
                        className="w-2 h-2 rounded-full mt-[7px] flex-shrink-0"
                        style={{
                          backgroundColor: customerColor,
                          boxShadow: `0 0 ${activeToday ? 12 : 6}px ${customerColor}`,
                          opacity: activeToday ? 1 : 0.5,
                        }}
                        animate={activeToday ? { scale: [1, 1.35, 1], opacity: [1, 0.7, 1] } : undefined}
                        transition={activeToday ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className="text-[14px] font-semibold truncate"
                            style={{ color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--font-body)' }}
                          >
                            {c.display}
                          </span>
                          <span
                            className="text-[12px] tabular-nums flex-shrink-0"
                            style={{ color: customerColor, fontFamily: 'var(--font-sora)', fontWeight: 600 }}
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

          {/* Not visited yet — chip grid. Appears only when we actually have
           *  a meaningful remaining list to show. */}
          {unvisitedCustomers.length > 0 && (
            <div
              className="rounded-2xl p-5 flex flex-col gap-3 flex-shrink-0 min-h-0"
              style={{
                background:
                  'linear-gradient(155deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.008) 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <h3
                className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
              >
                Ikke besøkt · {unvisitedCustomers.length}
              </h3>
              <div className="flex flex-wrap gap-1.5 overflow-hidden">
                {unvisitedCustomers.slice(0, 14).map((c, i) => (
                  <motion.span
                    key={c.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.gentle, delay: 0.5 + i * 0.035 }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium truncate max-w-[140px]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${customerColor}38`,
                      color: 'rgba(255,255,255,0.62)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {c.name}
                  </motion.span>
                ))}
                {unvisitedCustomers.length > 14 && (
                  <span
                    className="px-2.5 py-1 rounded-full text-[11px]"
                    style={{
                      color: 'rgba(255,255,255,0.35)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    +{unvisitedCustomers.length - 14}
                  </span>
                )}
              </div>
            </div>
          )}

          {unresolved.size > 0 && (
            <div
              className="rounded-2xl p-4 flex flex-col gap-2 flex-shrink-0"
              style={{
                background:
                  'linear-gradient(155deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.008) 100%)',
                border: '1px dashed rgba(255,255,255,0.08)',
              }}
            >
              <h3
                className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
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
