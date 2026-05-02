'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useMemo } from 'react'
import { BreathingDot } from '@/components/breathing-dot'
import { GlobeCanvas, type GlobePoint, type ProjectedPoint } from './globe-canvas'
import { resolveLocation } from '@/lib/geo'
import { useStatusColors } from '@/lib/status-colors/context'
import { spring } from '@/lib/motion'
import type { Office } from '@/lib/supabase/types'
import { useT } from '@/lib/i18n/context'
import { useWeather } from '@/lib/weather/use-weather'
import { wmoToIcon } from '@/lib/weather/wmo-to-icon'
import { formatTemp } from '@/lib/weather/format-temp'

interface GlobeViewProps {
  offices: Office[]
  /** Currently unused — the global top-bar in dashboard-client renders the
   *  org name on this view. Kept on the prop to mirror sibling view APIs
   *  and to keep the call site in dashboard-client.tsx homogeneous. */
  orgName: string
  time: Date
}

/**
 * Dashboard view G — «Verden i sanntid». A slow-rotating orthographic
 * globe that flies between the org's offices, lingering on each so the
 * camera-mounted TV can show local time and weather alongside the city
 * name. The data is the same as Kontorer (view C); the storytelling is
 * different — view C is a top-down atlas of the European footprint, view
 * G frames each office as a moment ("right now in Vilnius, it's 14°C and
 * 11:42 PM").
 */
export function GlobeView({ offices, orgName, time }: GlobeViewProps) {
  const STATUS_COLORS = useStatusColors()
  const t = useT()

  // Resolve coordinates for every office — same precedence as office-map-
  // view.tsx so the globe and the 2D atlas always agree on where each
  // city sits. City-dictionary match wins over stored lat/lng.
  const points: GlobePoint[] = useMemo(() => {
    return offices
      .map<GlobePoint | null>(o => {
        const cityHit = resolveLocation(o.city ?? o.name)
        const lat = cityHit?.lat ?? o.latitude
        const lng = cityHit?.lng ?? o.longitude
        if (typeof lat !== 'number' || typeof lng !== 'number') return null
        return {
          id: o.id,
          lat,
          lng,
          city: o.city ?? o.name,
        }
      })
      .filter((p): p is GlobePoint => p !== null)
  }, [offices])

  const officeColor = STATUS_COLORS.office.icon

  return (
    <div className="relative h-full flex flex-col px-10 pt-14 pb-4 gap-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
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
            {t.dashboard.globe.heading}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-[0.16em] uppercase"
              style={{
                background: 'rgba(0,102,255,0.12)',
                border: '1px solid rgba(0,102,255,0.25)',
                color: '#7FB2FF',
                fontFamily: 'var(--font-body)',
              }}
            >
              <BreathingDot color={officeColor} />
              {t.dashboard.globe.subtitle}
            </span>
          </div>
        </motion.div>
      </div>

      {/* ── Globe canvas — fills remaining height. ─────────────────── */}
      <motion.div
        className="flex-1 relative rounded-3xl overflow-hidden min-h-0"
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring.gentle, delay: 0.18 }}
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(20,40,90,0.18) 0%, rgba(5,5,7,0) 70%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.06), 0 40px 80px -40px rgba(0,0,0,0.5)',
        }}
      >
        <GlobeCanvas offices={points}>
          {({ points: projected, activeId }) => (
            <ActiveOfficeOverlay
              points={projected}
              activeId={activeId}
              now={time}
              activeNowInLabel={t.dashboard.globe.activeNowIn}
            />
          )}
        </GlobeCanvas>

        {points.length === 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
          >
            {t.dashboard.noOfficesWithCoords}
          </div>
        )}

        {/* Glass top-edge highlight */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[1px]"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 100%)',
          }}
        />
      </motion.div>

      {/* ── Footer summary — same shape as office-map-view so the two
          surfaces share their visual language. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.4 }}
        className="flex items-center justify-between gap-4 px-5 py-3 rounded-2xl flex-shrink-0 overflow-hidden"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-5 min-w-0 overflow-hidden">
          {points.slice(0, 10).map(p => (
            <div key={p.id} className="flex items-center gap-2 flex-shrink-0">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: officeColor,
                  boxShadow: `0 0 8px ${officeColor}`,
                }}
              />
              <span
                className="text-[13px] font-medium tracking-wide"
                style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-body)' }}
              >
                {p.city}
              </span>
            </div>
          ))}
          {points.length > 10 && (
            <span
              className="text-[12px] tabular-nums flex-shrink-0"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
            >
              +{points.length - 10}
            </span>
          )}
        </div>
        <span
          className="text-[11px] tracking-[0.22em] uppercase flex-shrink-0"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
        >
          {points.length} {points.length === 1 ? t.dashboard.globe.officeOne : t.dashboard.globe.officeMany}
        </span>
      </motion.div>
    </div>
  )
}

/**
 * The label that floats next to the active office. Shows city, current
 * local time, and live weather. Crossfades when the active office
 * changes — single moment of focus on the TV.
 *
 * Positioned absolutely inside the globe canvas wrapper. We use the
 * canvas viewBox-space coords from `projected` and convert them via
 * percentages so the label tracks correctly even when the SVG
 * letterboxes (preserveAspectRatio="meet").
 */
function ActiveOfficeOverlay({
  points,
  activeId,
  now,
  activeNowInLabel,
}: {
  points: ProjectedPoint[]
  activeId: string | null
  now: Date
  activeNowInLabel: string
}) {
  const active = points.find(p => p.id === activeId) ?? null

  return (
    <AnimatePresence mode="wait">
      {active && active.visible && (
        <motion.div
          key={active.id}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          // Anchor along the right-hand side so labels are predictable
          // and don't dance with the rotating globe. Vertical centre
          // gives the city name top-billing without competing with the
          // header. Pointer-events disabled — TV surface is read-only.
          className="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ maxWidth: '38%' }}
        >
          <ActiveOfficeCard
            city={active.city}
            lat={active.lat}
            lng={active.lng}
            now={now}
            activeNowInLabel={activeNowInLabel}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ActiveOfficeCard({
  city,
  lat,
  lng,
  now,
  activeNowInLabel,
}: {
  city: string
  lat: number
  lng: number
  now: Date
  activeNowInLabel: string
}) {
  const snap = useWeather(lat, lng)
  const desc = snap ? wmoToIcon(snap.code, snap.tempC) : null
  const Icon = desc?.icon
  const warm = desc?.warm ?? false
  const weatherColor = warm ? '#FBBF24' : 'rgba(245, 239, 228, 0.9)'

  // Local time at the office. We approximate timezone via longitude when
  // the office row doesn't have a stored IANA zone — close enough for a
  // headline display. UTC offset = lng / 15, rounded to whole hours so
  // the clock advances cleanly.
  const localTime = useMemo(() => {
    const offsetHours = Math.round(lng / 15)
    const utc = now.getTime() + now.getTimezoneOffset() * 60_000
    const local = new Date(utc + offsetHours * 3_600_000)
    const hh = String(local.getHours()).padStart(2, '0')
    const mm = String(local.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }, [lng, now])

  return (
    <div
      style={{
        textShadow: '0 2px 16px rgba(0,0,0,0.5)',
      }}
    >
      <p
        className="text-[12px] tracking-[0.32em] uppercase"
        style={{
          color: 'rgba(180, 210, 255, 0.85)',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
        }}
      >
        {activeNowInLabel}
      </p>
      <p
        className="mt-2 text-[88px] font-semibold leading-[0.92] tracking-tight"
        style={{
          fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
          background:
            'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(220,232,255,0.85) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontStyle: 'italic',
        }}
      >
        {city}
      </p>

      <div className="mt-4 flex items-baseline gap-5 flex-wrap">
        <span
          className="text-[44px] font-semibold tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'white',
            letterSpacing: '-0.02em',
          }}
        >
          {localTime}
        </span>
        {snap && Icon && (
          <span
            className="inline-flex items-center gap-2 text-[26px] font-medium tabular-nums leading-none"
            style={{
              color: weatherColor,
              fontFamily: 'var(--font-body)',
              filter: warm ? `drop-shadow(0 0 14px ${weatherColor}55)` : undefined,
            }}
          >
            <Icon size={26} strokeWidth={1.6} />
            <span>{formatTemp(snap.tempC)}</span>
          </span>
        )}
      </div>
    </div>
  )
}
