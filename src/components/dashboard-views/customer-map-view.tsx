'use client'

import { motion } from 'framer-motion'
import { EuropeMapCanvas, MAP_WIDTH, MAP_HEIGHT } from './europe-map-canvas'
import { CustomerPin, type CustomerPinState } from './customer-pin'
import { project, resolveLocation } from '@/lib/geo'
import { resolveCustomer } from '@/lib/customer-resolver'
import { placeLabels, textAnchorFor } from '@/lib/map-labels'
import { useStatusColors, useAuroraColors } from '@/lib/status-colors/context'
import { spring } from '@/lib/motion'
import type { Member, Entry, Customer } from '@/lib/supabase/types'
import { getISOWeek } from '@/lib/dates'
import { useResolvedLocations } from '@/hooks/use-resolved-locations'
import { useT } from '@/lib/i18n/context'
import { useMemo } from 'react'
import { WeatherInline } from '@/components/weather/weather-inline'

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
  lat: number
  lng: number
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
  const auroras = useAuroraColors()
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
      if (e.status !== 'customer' && e.status !== 'event' && e.status !== 'travel') continue
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
    if (e.status !== 'customer' && e.status !== 'event' && e.status !== 'travel') continue
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
      lat: c.lat,
      lng: c.lng,
      radius: 11,
      display: c.display,
      isKnownCustomer: c.isKnownCustomer,
      customerId: c.customerId,
      memberIdsToday: c.memberIdsToday,
      memberIdsWeek: c.memberIdsWeek,
      daysThisWeek: c.daysThisWeek,
    }))
    .sort((a, b) => b.memberIdsWeek.size - a.memberIdsWeek.size)

  // Portfolio: every registered customer with coords shows on the map with
  // the same base design — the visit state (idle/week/today) just dials up
  // brightness and adds a soft single-pulse ring. One visual language, no
  // loud heartbeat competing with the city labels.
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

  // Unified pin model — one list for rendering + label placement so the
  // collision solver treats visited/unvisited names equally and no pair of
  // labels ever overlaps.
  interface MapPoint {
    id: string
    x: number
    y: number
    radius: number
    display: string
    state: CustomerPinState
    visitCount: number
  }
  const points: MapPoint[] = []
  for (const c of clusters) {
    const state: CustomerPinState = c.memberIdsToday.size > 0 ? 'today' : 'week'
    points.push({
      id: c.id,
      x: c.x,
      y: c.y,
      radius: state === 'today' ? 5 : 4.5,
      display: c.display,
      state,
      visitCount: c.memberIdsWeek.size,
    })
  }
  for (const c of unvisitedCustomers) {
    points.push({
      id: `idle-${c.id}`,
      x: c.x,
      y: c.y,
      radius: 4,
      display: c.name,
      state: 'idle',
      visitCount: 0,
    })
  }

  const placedLabels = placeLabels(points, { gap: 12, collisionRadius: 82 })

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
            background:
              'linear-gradient(180deg, #00F5A0 -12%, #00D9F5 16%, #ffffff 52%, #ffffff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 24px rgba(0,217,245,0.22))',
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
            {/* Pins — single unified component, intensity tier driven by
             *  visit state. Idle first so visited sit on top when coords
             *  collide. */}
            {points
              .slice()
              .sort((a, b) => {
                const rank: Record<CustomerPinState, number> = { idle: 0, week: 1, today: 2 }
                return rank[a.state] - rank[b.state]
              })
              .map((p, i) => (
                <motion.g
                  key={`pin-${p.id}`}
                  transform={`translate(${p.x} ${p.y})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.2 + i * 0.04 }}
                >
                  <CustomerPin
                    color={customerColor}
                    auroraCompanion={auroras.customer}
                    index={i}
                    state={p.state}
                  />
                </motion.g>
              ))}

            {/* Labels — every pin gets a name. Visited are crisper, idle are
             *  softer so the eye still lands on "what we're doing this week"
             *  first without hiding the portfolio footprint. */}
            {placedLabels.map((pl, i) => {
              const anchor = textAnchorFor(pl.side)
              const c = pl.point
              const visited = c.state !== 'idle'
              return (
                <motion.g
                  key={`label-${c.id}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring.gentle, delay: 0.45 + i * 0.05 }}
                >
                  <text
                    x={pl.labelX}
                    y={pl.labelY}
                    textAnchor={anchor}
                    fontSize={visited ? 16 : 13}
                    fontWeight={visited ? 600 : 500}
                    fontFamily="var(--font-sora)"
                    fill={visited ? 'white' : 'rgba(255,255,255,0.62)'}
                    letterSpacing={0.3}
                    style={{
                      paintOrder: 'stroke',
                      stroke: 'rgba(2,4,10,0.78)',
                      strokeWidth: visited ? 4.5 : 3.5,
                      strokeLinejoin: 'round',
                    }}
                  >
                    {c.display}
                  </text>
                </motion.g>
              )
            })}

            {points.length === 0 && (
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
                  {t.dashboard.customer.portfolio}
                </h3>
                <span
                  className="text-[10px] tabular-nums uppercase tracking-[0.2em]"
                  style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
                >
                  {t.matrix.weekLabel} {weekNum}
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
                  {t.dashboard.customer.visited}
                </span>
              </div>

              {/* Progress rail — Nordlys liquid fill.
                  Matches the /min-plan today-chord signature (green → cyan →
                  violet) so every progress-like element in the product speaks
                  the same visual language. The gradient is pinned to full
                  track width so the colours reveal left-to-right as the bar
                  fills, instead of squeezing all three into whatever
                  portion has been painted so far. */}
              {/* Track is intentionally NOT clipped — we want the glow to
                  bloom far past the rail edges, like a neon filament in
                  fog. Two layers: a heavily-blurred halo underneath for
                  the soft bloom, and the crisp 1.5px filament on top. */}
              <div className="relative h-[1.5px] rounded-full">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                />
                {/* Blurred halo — follows the fill width, filtered for
                    true atmospheric bloom that box-shadow alone can't fake. */}
                <motion.div
                  aria-hidden
                  className="absolute top-0 left-0 h-full rounded-full pointer-events-none"
                  initial={{ width: 0 }}
                  animate={{ width: `${portfolioPct * 100}%` }}
                  transition={{ duration: 1.2, delay: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  style={{
                    background:
                      'linear-gradient(90deg, #00F5A0 0%, #00D9F5 50%, #7C3AED 100%)',
                    filter: 'blur(7px) saturate(140%)',
                    opacity: 0.95,
                    transform: 'scaleY(4)',
                    transformOrigin: 'center',
                  }}
                />
                {/* Crisp filament */}
                <motion.div
                  className="absolute top-0 left-0 h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${portfolioPct * 100}%` }}
                  transition={{ duration: 1.2, delay: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  style={{
                    background:
                      'linear-gradient(90deg, #00F5A0 0%, #00D9F5 50%, #7C3AED 100%)',
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    boxShadow:
                      '0 0 4px 1px rgba(255,255,255,0.9), 0 0 10px 2px rgba(0,245,160,1), 0 0 24px 4px rgba(0,217,245,0.95), 0 0 48px 6px rgba(0,217,245,0.7), 0 0 80px 10px rgba(124,58,237,0.55)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Unified customer list — the "right-side expression" of the
           *  map. Each row's leading dot mirrors the pin's state (today /
           *  week / idle), using the same animation and opacity as the
           *  svg pin so the list and the map feel like one object. */}
          {(clusters.length > 0 || unvisitedCustomers.length > 0) && (() => {
            // Sort rows by engagement tier → alphabetical within tier.
            // `lat`/`lng` carries forward only on visited rows so the
            // weather badge knows where to fetch from. Idle rows omit
            // it on purpose — feature 2 only attaches vær til besøk.
            const rows: Array<{
              key: string
              name: string
              state: CustomerPinState
              visitCount: number
              members: string[]
              lat: number | null
              lng: number | null
            }> = []
            for (const c of clusters) {
              const state: CustomerPinState = c.memberIdsToday.size > 0 ? 'today' : 'week'
              const members = Array.from(c.memberIdsWeek)
                .map(id => {
                  const m = memberById.get(id)
                  return m ? (m.full_name || m.display_name) : ''
                })
                .filter(Boolean)
              rows.push({
                key: c.id,
                name: c.display,
                state,
                visitCount: c.memberIdsWeek.size,
                members,
                lat: c.lat,
                lng: c.lng,
              })
            }
            for (const c of unvisitedCustomers) {
              rows.push({
                key: c.id,
                name: c.name,
                state: 'idle',
                visitCount: 0,
                members: [],
                lat: null,
                lng: null,
              })
            }
            const tierRank: Record<CustomerPinState, number> = { today: 0, week: 1, idle: 2 }
            rows.sort((a, b) => {
              const ta = tierRank[a.state]
              const tb = tierRank[b.state]
              if (ta !== tb) return ta - tb
              if (a.visitCount !== b.visitCount) return b.visitCount - a.visitCount
              return a.name.localeCompare(b.name)
            })

            // Maks 5 værbadges samtidig — atmosfære uten støy. Tier-
            // sorteringen plasserer alle today-rader først, så den første
            // N er garantert det som driver dagen.
            const MAX_WEATHER_BADGES = 5
            const weatherKeys = new Set<string>()
            for (const r of rows) {
              if (r.state !== 'today') break
              if (r.lat == null || r.lng == null) continue
              weatherKeys.add(r.key)
              if (weatherKeys.size >= MAX_WEATHER_BADGES) break
            }

            return (
              <div
                className="rounded-2xl p-5 flex flex-col gap-3 min-h-0 overflow-hidden"
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
                  {t.dashboard.customer.customers}
                </h3>

                <div className="flex flex-col gap-1.5 overflow-y-auto pr-1 -mr-1">
                  {rows.map((r, i) => (
                    <motion.div
                      key={r.key}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...spring.gentle, delay: 0.35 + i * 0.03 }}
                      className="flex items-center gap-3 py-0.5"
                    >
                      <SidePanelDot state={r.state} color={customerColor} />
                      <span
                        className="flex-1 min-w-0 truncate text-[13px]"
                        style={{
                          color:
                            r.state === 'idle'
                              ? 'rgba(255,255,255,0.55)'
                              : 'rgba(255,255,255,0.92)',
                          fontFamily: 'var(--font-body)',
                          fontWeight: r.state === 'idle' ? 500 : 600,
                        }}
                      >
                        {r.name}
                      </span>
                      {weatherKeys.has(r.key) && (
                        <WeatherInline lat={r.lat} lng={r.lng} size="sm" />
                      )}
                      {r.visitCount > 0 && (
                        <span
                          className="text-[11px] tabular-nums flex-shrink-0"
                          style={{
                            color: r.state === 'today' ? customerColor : 'rgba(255,255,255,0.55)',
                            fontFamily: 'var(--font-sora)',
                            fontWeight: 600,
                          }}
                          title={r.members.join(', ')}
                        >
                          {r.visitCount}
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )
          })()}

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
                {t.dashboard.customer.unknownPlaces}
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

/**
 * Miniature echo of CustomerPin for the side-panel list. Same three-tier
 * vocabulary — idle is a quiet crystal dot; week adds a brighter core and
 * a single pulse; today is the same at higher intensity — so the list
 * reads as the map's caption rather than a separate widget.
 */
function SidePanelDot({ state, color }: { state: CustomerPinState; color: string }) {
  const baseOpacity = state === 'today' ? 1 : state === 'week' ? 0.85 : 0.45
  const glowAlpha = state === 'today' ? 'aa' : state === 'week' ? '66' : '22'

  return (
    <span
      aria-hidden
      className="relative flex-shrink-0 flex items-center justify-center"
      style={{ width: 14, height: 14 }}
    >
      {/* Single soft pulse ring — only for visited tiers so idle stays still. */}
      {state !== 'idle' && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ border: `1px solid ${color}` }}
          animate={{
            opacity: [state === 'today' ? 0.55 : 0.4, 0, state === 'today' ? 0.55 : 0.4],
            scale: [0.7, 1.45, 0.7],
          }}
          transition={{
            duration: state === 'today' ? 3.8 : 5.2,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      )}
      {/* Crystal dot */}
      <span
        className="block rounded-full"
        style={{
          width: state === 'idle' ? 5 : 6,
          height: state === 'idle' ? 5 : 6,
          backgroundColor: color,
          opacity: baseOpacity,
          boxShadow: `0 0 ${state === 'today' ? 10 : state === 'week' ? 6 : 3}px ${color}${glowAlpha}`,
          border: '0.5px solid rgba(255,255,255,0.6)',
        }}
      />
    </span>
  )
}
