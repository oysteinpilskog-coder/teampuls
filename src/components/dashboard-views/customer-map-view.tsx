'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { EuropeMapCanvas, MAP_WIDTH, MAP_HEIGHT } from './europe-map-canvas'
import { CustomerPin, type CustomerPinState } from './customer-pin'
import { MapLabelTicker } from './map-label-ticker'
import { RegionalInset, type InsetPoint } from './regional-inset'
import { project, EUROPE_BOUNDS, isInBounds } from '@/lib/geo'
import { US_BOUNDS } from '@/lib/us-projection'
import { resolveCustomer } from '@/lib/customer-resolver'
import { placeLabels, textAnchorFor } from '@/lib/map-labels'
import { clusterMapPoints } from '@/lib/map-clusters'
import { useStatusColors, useAuroraColors } from '@/lib/status-colors/context'
import { spring } from '@/lib/motion'
import type { Member, Entry, Customer } from '@/lib/supabase/types'
import { getISOWeek } from '@/lib/dates'
import { useT } from '@/lib/i18n/context'
import { WeatherInline } from '@/components/weather/weather-inline'
import { BreathingDot } from '@/components/breathing-dot'

interface CustomerMapViewProps {
  members: Member[]
  entries: Entry[]       // full week
  todayEntries: Entry[]  // deduped to one per member
  customers: Customer[]  // org customer registry
  orgName: string
  time: Date
}

interface CustomerCluster {
  id: string
  x: number
  y: number
  lat: number
  lng: number
  radius: number
  display: string
  /** The customer.id this cluster resolved to — lets us subtract visited
   *  customers from the registry list and avoid rendering a ghost pin on
   *  top of a live pin at the same coordinates. */
  customerId: string
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
  const weekNum = getISOWeek(time)
  const reduce = useReducedMotion()

  const memberById = new Map(members.map(m => [m.id, m]))
  const customerColor = STATUS_COLORS.customer.icon

  // Region routing — anything outside Europe's bounding box that fits in
  // the US bounds gets diverted to the inset card. Other-region outliers
  // (e.g. Singapore) are silently dropped for now; revisit when a second
  // inset region is needed.
  function regionFor(lat: number, lng: number): 'europe' | 'us' | null {
    if (isInBounds(lat, lng, EUROPE_BOUNDS)) return 'europe'
    if (isInBounds(lat, lng, US_BOUNDS)) return 'us'
    return null
  }

  // Pins reflect the customer portfolio — only labels that match a row
  // in the customer registry become pins. Unmatched labels are silently
  // dropped from the dashboard view; admin handles them elsewhere.
  const byKey = new Map<string, CustomerCluster>()
  const usByKey = new Map<string, CustomerCluster>()

  for (const e of entries) {
    if (e.status !== 'customer' && e.status !== 'event' && e.status !== 'travel') continue
    if (!memberById.has(e.member_id)) continue

    const label = (e.location_label ?? '').trim()
    const asCustomer = resolveCustomer(label, customers)

    if (!asCustomer) continue

    const region = regionFor(asCustomer.lat, asCustomer.lng)
    if (region == null) continue

    const targetMap = region === 'us' ? usByKey : byKey
    const key = `${asCustomer.lat.toFixed(3)},${asCustomer.lng.toFixed(3)}`
    let cluster = targetMap.get(key)
    if (!cluster) {
      // Europe coords drive the main canvas; US coords are projected later
      // by the inset component, so x/y here is only meaningful for Europe.
      const xy = region === 'europe'
        ? project(asCustomer.lat, asCustomer.lng, MAP_WIDTH, MAP_HEIGHT)
        : { x: 0, y: 0 }
      cluster = {
        id: key,
        x: xy.x,
        y: xy.y,
        radius: 10,
        lat: asCustomer.lat,
        lng: asCustomer.lng,
        display: asCustomer.display,
        customerId: asCustomer.customer.id,
        memberIdsToday: new Set(),
        memberIdsWeek: new Set(),
        daysThisWeek: 0,
      }
      targetMap.set(key, cluster)
    }
    cluster.memberIdsWeek.add(e.member_id)
    cluster.daysThisWeek += 1
    if (todayEntries.some(te => te.id === e.id)) {
      cluster.memberIdsToday.add(e.member_id)
    }
  }

  const clusters = Array.from(byKey.values())
    .sort((a, b) => b.memberIdsWeek.size - a.memberIdsWeek.size)
  const usClusters = Array.from(usByKey.values())
    .sort((a, b) => b.memberIdsWeek.size - a.memberIdsWeek.size)

  // Portfolio: every registered customer with coords shows on the map with
  // the same base design — the visit state (idle/week/today) just dials up
  // brightness and adds a soft single-pulse ring. One visual language, no
  // loud heartbeat competing with the city labels.
  const visitedCustomerIds = new Set([
    ...clusters.map(c => c.customerId),
    ...usClusters.map(c => c.customerId),
  ])
  const allUnvisitedCustomers = customers
    .filter(c =>
      c.latitude != null &&
      c.longitude != null &&
      !visitedCustomerIds.has(c.id)
    )
  const unvisitedCustomers = allUnvisitedCustomers
    .filter(c => regionFor(c.latitude!, c.longitude!) === 'europe')
    .map(c => {
      const { x, y } = project(c.latitude!, c.longitude!, MAP_WIDTH, MAP_HEIGHT)
      return {
        id: c.id,
        name: c.name,
        city: c.city,
        x,
        y,
        lat: c.latitude!,
        lng: c.longitude!,
      }
    })
    .filter(c => Number.isFinite(c.x) && Number.isFinite(c.y))
  const usUnvisitedCustomers = allUnvisitedCustomers
    .filter(c => regionFor(c.latitude!, c.longitude!) === 'us')
    .map(c => ({ id: c.id, name: c.name, lat: c.latitude!, lng: c.longitude! }))

  const registeredCount = customers.filter(c => c.latitude != null && c.longitude != null).length
  const visitedCount = visitedCustomerIds.size
  const portfolioPct = registeredCount === 0 ? 0 : visitedCount / registeredCount

  // Raw point list — every visited cluster + every registered idle customer.
  // Feeds the proximity-clusterer which folds nearby points (same city,
  // same business district) into a single nucleus pin so the map never
  // turns into a soup of overlapping auras.
  interface MapPoint {
    id: string
    x: number
    y: number
    radius: number
    display: string
    state: CustomerPinState
    visitCount: number
  }
  const rawPoints: MapPoint[] = []
  for (const c of clusters) {
    const state: CustomerPinState = c.memberIdsToday.size > 0 ? 'today' : 'week'
    rawPoints.push({
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
    rawPoints.push({
      id: `idle-${c.id}`,
      x: c.x,
      y: c.y,
      radius: 4,
      display: c.name,
      state: 'idle',
      visitCount: 0,
    })
  }

  // Proximity-cluster on render. Threshold ≈ 24 SVG units on the 1400×900
  // canvas — roughly the visual aura overlap zone for our pin radii. The
  // anchor stays on the highest-priority customer's coordinates; nearby
  // siblings fold in and surface via the rotating ticker label.
  const points = clusterMapPoints(rawPoints, 24)

  // Per-pin label-dimensjoner så placeLabels kan kjøre AABB-kollisjon
  // med faktisk tekstbredde. Sora er en bredt-tegnet display-font;
  // målte snitt ~9.0 px/tegn ved fontSize 16 (visited) og ~7.2 px/tegn
  // ved fontSize 13 (idle). Lengste navn i clusteret bestemmer bredden
  // siden tickeren roterer gjennom dem alle. +14 px padding rommer
  // stroke-paint-order og litt visuell pust.
  const pointsWithDims = points.map(p => {
    const visited = p.state !== 'idle'
    const charWidth = visited ? 9.0 : 7.2
    const longest = p.members.reduce((n, m) => Math.max(n, m.name.length), 1)
    return {
      ...p,
      labelWidth: longest * charWidth + 14,
      labelHeight: 22,
    }
  })

  const placedLabels = placeLabels(pointsWithDims, {
    gap: 14,
    collisionRadius: 220,
    lineHeight: 26,
    verticalAnchor: 0.62,
  })

  // ── US inset points ─────────────────────────────────────────────
  // Same three-tier vocabulary as the main canvas. Visited US clusters
  // first, then idle (registered, no visits this week). The inset only
  // appears when at least one US row exists; otherwise it stays hidden
  // so the corner doesn't carry a "ghost" widget for Europe-only weeks.
  const usInsetPoints: InsetPoint[] = []
  for (const c of usClusters) {
    const state: CustomerPinState = c.memberIdsToday.size > 0 ? 'today' : 'week'
    usInsetPoints.push({
      id: c.id,
      lat: c.lat,
      lng: c.lng,
      display: c.display,
      state,
      visitCount: c.memberIdsWeek.size,
    })
  }
  for (const c of usUnvisitedCustomers) {
    usInsetPoints.push({
      id: `idle-${c.id}`,
      lat: c.lat,
      lng: c.lng,
      display: c.name,
      state: 'idle',
      visitCount: 0,
    })
  }
  const showUsInset = usInsetPoints.length > 0

  return (
    <div className="relative h-full flex flex-col px-10 pt-20 pb-4 gap-4">
      {/* ── Header — org-navn og klokke eies av global topp-bar; her står
          kun visningstittel + uke-badge så kart får mest mulig pust.
          pt-20 (80px) holder KUNDEPORTEFØLJE-tittelen klar av shellens
          CalWin-wordmark (top-5, fontSize 30 → bottom y≈50) — pt-14 ga
          bare 6px luft og merkene krasjet i samme venstre-kolonne. */}
      <div className="flex-shrink-0">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: 0.05 }}
        >
          <p
            className="text-[30px] font-semibold tracking-tight leading-none"
            style={{
              fontFamily: 'var(--font-fraunces)',
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-[0.16em] uppercase"
              style={{
                background: 'rgba(255,122,26,0.12)',
                border: '1px solid rgba(255,122,26,0.28)',
                color: '#FFB380',
                fontFamily: 'var(--font-body)',
              }}
            >
              <BreathingDot color={customerColor} />
              {t.matrix.weekLabel} {weekNum}
            </span>
          </div>
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
             *  collide. Multi-member clusters get a small count chip so
             *  the eye reads "more here" even before the ticker cycles. */}
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
                  {p.members.length > 1 && (
                    <ClusterCountChip
                      count={p.members.length}
                      color={customerColor}
                      visited={p.state !== 'idle'}
                    />
                  )}
                </motion.g>
              ))}

            {/* Leader-linjer — tegnes etter pinnene, før labels, så de
             *  ligger BAK label-tekst men OVER pin-aurae. Bare for pins
             *  som er forskjøvet fra slot:0 (ellers ligger label-en
             *  allerede tett inntil pin-en). Hårtynn, stiplet, dempet
             *  hvit — Apple Maps-estetikk: navnet er borte fra pin, men
             *  linjen forteller nøyaktig hvilket merke det tilhører. */}
            {placedLabels.map(pl => {
              if (!pl.needsLeader) return null
              const c = pl.point
              const visited = c.state !== 'idle'
              // Endepunkt = nærmeste kant av label-rammen, ikke selve
              // ankeret. For top/bottom-sider er rammen sentrert om
              // labelX, så vi treffer topp- eller bunn-kanten avhengig
              // av om label-en ligger under eller over pin-en. For
              // venstre/høyre er rammen vertikal-sentrert om labelY,
              // og vi treffer nærmeste vertikale kant.
              let lx = pl.labelX
              let ly = pl.labelY
              if (pl.side === 'top' || pl.side === 'bottom') {
                const ascent = pl.labelHeight * 0.62
                const descent = pl.labelHeight * 0.38
                ly = pl.labelY > c.y ? pl.labelY - ascent : pl.labelY + descent
              }
              // Trekk start-punktet ut til pin-edge så lederen ikke
              // "spikres" i crystal dot-en.
              const dx = lx - c.x
              const dy = ly - c.y
              const dist = Math.hypot(dx, dy) || 1
              const startOffset = c.radius + 3
              const sx = c.x + (dx / dist) * startOffset
              const sy = c.y + (dy / dist) * startOffset
              return (
                <motion.line
                  key={`leader-${c.id}`}
                  x1={sx}
                  y1={sy}
                  x2={lx}
                  y2={ly}
                  stroke={visited ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)'}
                  strokeWidth={0.7}
                  strokeDasharray="2 3"
                  strokeLinecap="round"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.55 }}
                  style={{ pointerEvents: 'none' }}
                />
              )
            })}

            {/* Labels — every pin gets a name. Visited are crisper, idle are
             *  softer. Multi-member clusters cycle through their member
             *  names with a quiet crossfade — ticker phase is desynced
             *  per pin so the map never ticks in lockstep. */}
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
                  <MapLabelTicker
                    names={c.members.map(m => m.name)}
                    x={pl.labelX}
                    y={pl.labelY}
                    textAnchor={anchor}
                    visited={visited}
                    index={i}
                  />
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

          {/* US inset — picture-in-picture for customers outside Europe.
           *  Only mounts when at least one US-bound customer exists, so
           *  Europe-only weeks stay clean. Top-left sits over the
           *  Atlantic in our projection — no important Europe geometry
           *  is occluded. */}
          {showUsInset && (
            <div className="absolute top-3 left-3 z-10">
              <RegionalInset
                title="USA"
                points={usInsetPoints}
                delay={0.3}
              />
            </div>
          )}
        </motion.div>

        {/* ── Side panel: portfolio → visited → unvisited ──────────── */}
        {/* pb-[112px] reserverer bunn-høyre-hjørnet for `OffiviewSignature`
            (fixed, controlBarSafeArea — bottom:96 right:48, ~360×51px).
            Uten denne padding-en raster den nederste tredelen av
            kunde-scrolleren rett bak signaturen og kunde-navnene leses
            ikke lenger. Speiler reservasjonen office-map-view bruker i
            footer-en sin paddingRight. */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring.gentle, delay: 0.28 }}
          className="flex flex-col gap-4 min-h-0 overflow-hidden pb-[112px]"
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
                    fontFamily: 'var(--font-fraunces)',
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
                    fontFamily: 'var(--font-fraunces)',
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
                    opacity: 0.475,
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
                      '0 0 4px 1px rgba(255,255,255,0.45), 0 0 10px 2px rgba(0,245,160,0.5), 0 0 24px 4px rgba(0,217,245,0.475), 0 0 48px 6px rgba(0,217,245,0.35), 0 0 80px 10px rgba(124,58,237,0.275)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Unified customer list — the "right-side expression" of the
           *  map. Each row's leading dot mirrors the pin's state (today /
           *  week / idle), using the same animation and opacity as the
           *  svg pin so the list and the map feel like one object. */}
          {(clusters.length > 0 || unvisitedCustomers.length > 0 ||
            usClusters.length > 0 || usUnvisitedCustomers.length > 0) && (() => {
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
                lat: c.lat,
                lng: c.lng,
              })
            }
            // Mirror US clusters/idle into the unified list so users without
            // a sharp eye on the inset still find them at a glance.
            for (const c of usClusters) {
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
            for (const c of usUnvisitedCustomers) {
              rows.push({
                key: c.id,
                name: c.name,
                state: 'idle',
                visitCount: 0,
                members: [],
                lat: c.lat,
                lng: c.lng,
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

            // Hver rad har fast høyde så vi kan duplisere listen og animere
            // y-translation sømløst. Når y når −totalHeight har duplikatet
            // overtatt synsfeltet, og en repeat tilbakestiller posisjonen
            // uten visuelt hopp.
            const ROW_HEIGHT = 28
            const ROW_GAP = 6
            const STRIDE = ROW_HEIGHT + ROW_GAP
            const totalHeight = rows.length * STRIDE
            // ~0.85 s per rad gir konstant ~40 px/s flipboard-tempo uansett
            // listestørrelse: 75 kunder ≈ 64 s, 15 kunder ≈ 13 s. Det gamle
            // 36 s-gulvet bremset korte lister til 4–14 px/s, som så helt
            // statisk ut på TV-en ved CalWins kundeantall — listen ruller
            // nå synlig selv med ti rader. 8 s-bunnen forhindrer at en
            // mikroskopisk liste (≤9 rader) blinker forbi for fort.
            const duration = Math.max(8, rows.length * 0.85)

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

                {reduce ? (
                  // prefers-reduced-motion: ingen rull. Vi viser topp-15
                  // (today + week først, så idle alfabetisk) — nok til å
                  // formidle tier-hierarkiet uten bevegelse.
                  <div className="flex flex-col gap-1.5 overflow-hidden">
                    {rows.slice(0, 15).map((r, i) => (
                      <motion.div
                        key={r.key}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...spring.gentle, delay: 0.35 + i * 0.03 }}
                      >
                        <CustomerScrollerRow r={r} customerColor={customerColor} rowHeight={ROW_HEIGHT} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    className="relative flex-1 min-h-0 overflow-hidden"
                    style={{
                      // Top/bunn-fade så rader smelter inn og ut i stedet for
                      // å kappes. 6 % gir nok pust uten å spise lesbar høyde.
                      maskImage:
                        'linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)',
                      WebkitMaskImage:
                        'linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)',
                    }}
                  >
                    <motion.div
                      animate={{ y: [0, -totalHeight] }}
                      transition={{
                        duration,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: `${ROW_GAP}px`,
                      }}
                    >
                      {/* Listen rendres to ganger for sømløs wrap. */}
                      {[...rows, ...rows].map((r, i) => (
                        <CustomerScrollerRow
                          key={`${r.key}-${i < rows.length ? 'a' : 'b'}`}
                          r={r}
                          customerColor={customerColor}
                          rowHeight={ROW_HEIGHT}
                        />
                      ))}
                    </motion.div>
                  </motion.div>
                )}
              </div>
            )
          })()}
        </motion.div>
      </div>
    </div>
  )
}

/**
 * Tiny chip floating off the upper-right of a cluster pin showing how
 * many customers fold into that nucleus. Subtle dark capsule, hairline
 * customer-hue border, tabular digits — reads as "+N here" without
 * shouting over the pin itself.
 */
function ClusterCountChip({
  count,
  color,
  visited,
}: {
  count: number
  color: string
  visited: boolean
}) {
  // Offset diagonally up-right so the chip sits in the pin's "negative
  // space" rather than the label corridor below.
  const cx = 6
  const cy = -7
  const r = 6.5
  const fillAlpha = visited ? 0.92 : 0.78
  const strokeAlpha = visited ? 0.85 : 0.45
  return (
    <g transform={`translate(${cx} ${cy})`} pointerEvents="none">
      <circle
        r={r}
        fill="rgba(2,4,10,1)"
        fillOpacity={fillAlpha}
        stroke={color}
        strokeWidth={0.7}
        strokeOpacity={strokeAlpha}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8.5}
        fontWeight={700}
        fontFamily="var(--font-fraunces)"
        fill={visited ? color : 'rgba(255,255,255,0.78)'}
        style={{ letterSpacing: '0.02em' }}
      >
        {count}
      </text>
    </g>
  )
}

/**
 * Miniature echo of CustomerPin for the side-panel list. Same three-tier
 * vocabulary — idle is a quiet crystal dot; week adds a brighter core and
 * a single pulse; today is the same at higher intensity — so the list
 * reads as the map's caption rather than a separate widget.
 */
function SidePanelDot({ state, color }: { state: CustomerPinState; color: string }) {
  const reduce = useReducedMotion()
  const baseOpacity = state === 'today' ? 1 : state === 'week' ? 0.85 : 0.45
  const glowAlpha = state === 'today' ? 'aa' : state === 'week' ? '66' : '22'

  return (
    <span
      aria-hidden
      className="relative flex-shrink-0 flex items-center justify-center"
      style={{ width: 14, height: 14 }}
    >
      {/* Single soft pulse ring — only for visited tiers so idle stays still. */}
      {state !== 'idle' && !reduce && (
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

/**
 * Én rad i den rullende kunde-strømmen. Holdes som egen komponent fordi
 * radene rendres dobbelt (sømløs wrap) og fordi reduced-motion-grenen
 * trenger samme rad-utseende uten bevegelse. Fast høyde er kritisk: y-
 * translasjonen i scroller-en regner med `rows.length * stride`, og avvik
 * der gir et visuelt hopp ved repeat.
 */
function CustomerScrollerRow({
  r,
  customerColor,
  rowHeight,
}: {
  r: {
    key: string
    name: string
    state: CustomerPinState
    visitCount: number
    members: string[]
    lat: number | null
    lng: number | null
  }
  customerColor: string
  rowHeight: number
}) {
  return (
    <div
      className="flex items-center gap-3 flex-shrink-0"
      style={{ height: `${rowHeight}px` }}
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
      {r.lat != null && r.lng != null && (
        <WeatherInline lat={r.lat} lng={r.lng} size="sm" />
      )}
      {r.visitCount > 0 && (
        <span
          className="text-[11px] tabular-nums flex-shrink-0"
          style={{
            color: r.state === 'today' ? customerColor : 'rgba(255,255,255,0.55)',
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 600,
          }}
          title={r.members.join(', ')}
        >
          {r.visitCount}
        </span>
      )}
    </div>
  )
}
