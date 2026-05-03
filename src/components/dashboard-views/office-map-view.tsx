'use client'

import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { BreathingDot } from '@/components/breathing-dot'
import { EuropeMapCanvas, MAP_WIDTH, MAP_HEIGHT } from './europe-map-canvas'
import { MapPin } from './map-pin'
import { project, resolveLocation } from '@/lib/geo'
import { placeLabels } from '@/lib/map-labels'
import { useStatusColors, useAuroraColors } from '@/lib/status-colors/context'
import { spring } from '@/lib/motion'
import type { Office } from '@/lib/supabase/types'
import { getISOWeek } from '@/lib/dates'
import { useT } from '@/lib/i18n/context'
import { OfficeMapLabel } from './office-map-label'

const HQ_GOLD = '#d4a017'

interface OfficeMapViewProps {
  offices: Office[]
  orgName: string
  time: Date
}

interface PlacedOffice {
  id: string
  office: Office
  lat: number
  lng: number
  x: number
  y: number
  radius: number
}

export function OfficeMapView({
  offices,
  orgName,
  time,
}: OfficeMapViewProps) {
  const STATUS_COLORS = useStatusColors()
  const auroras = useAuroraColors()
  const t = useT()
  const weekNum = getISOWeek(time)

  // Project each office. City-dictionary match wins over stored lat/lng so
  // the continent-scale view stays robust against bad geocoder results
  // (e.g. "Newcastle, GB" → Newcastle, Co. Down instead of upon Tyne). For
  // a 1400×900 map of Europe, ±20 km from a city centre is invisible — we
  // trade pin precision for consistency and immunity to data drift.
  const placed: PlacedOffice[] = offices
    .map<PlacedOffice | null>(office => {
      const cityHit = resolveLocation(office.city ?? office.name)
      const lat: number | null = cityHit?.lat ?? office.latitude
      const lng: number | null = cityHit?.lng ?? office.longitude
      if (lat == null || lng == null) return null

      const { x, y } = project(lat, lng, MAP_WIDTH, MAP_HEIGHT)

      return {
        id: office.id,
        office,
        lat, lng,
        x, y,
        radius: 7.7,
      }
    })
    .filter((p): p is PlacedOffice => p !== null)

  const officeColor = STATUS_COLORS.office.icon

  // labelWidth/Height matcher FO_WIDTH/FO_HEIGHT i `office-map-label.tsx`.
  // Smal stablet boks (200 × 40) gjør at pinnen alltid sitter visuelt
  // koblet til navnet — gamle 360 px brede inline-bokser sentrerte hele
  // gruppen «By · ☀ 14°» rundt pinnen og dyttet bynavnet langt til siden.
  // verticalAnchor: 0.5 må matche y-offsetet i office-map-label.tsx (også
  // 0.5 — boksens midte ligger på labelY-ankeret).
  const placedLabels = placeLabels(placed, {
    gap: 12,
    collisionRadius: 160,
    lineHeight: 20,
    labelWidth: 200,
    labelHeight: 40,
    verticalAnchor: 0.5,
  })

  return (
    <div className="relative h-full flex flex-col px-10 pt-14 pb-4 gap-4">
      {/* ── Header — org-navn og klokke eies av global topp-bar. */}
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
            Kontorene
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
              Uke {weekNum}
            </span>
          </div>
        </motion.div>
      </div>

      {/* ── Map (fills all remaining height) ──────────────────────── */}
      <motion.div
        className="flex-1 relative rounded-3xl overflow-hidden min-h-0"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring.gentle, delay: 0.18 }}
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, rgba(0,60,180,0.10) 0%, rgba(5,5,7,0) 70%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.06), 0 40px 80px -40px rgba(0,0,0,0.5)',
        }}
      >
        <EuropeMapCanvas accent="#5E8CFF">
          {placed.map((p, i) => (
            <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
              <MapPin
                radius={p.radius}
                color={officeColor}
                auroraCompanion={auroras.office}
                index={i}
              />
              {/* HQ-stjerne svever rett over pinnen — gull, med matchende
                  glød så den leser som "premium ankerpunkt" og ikke som
                  enda en pin. Bare gjengitt når kontoret er flagget som
                  HQ; resten av kartet forblir uberørt. */}
              {p.office.is_hq && (
                <g transform={`translate(0 ${-p.radius - 14})`}>
                  <circle r={9} fill={HQ_GOLD} opacity={0.18} />
                  <path
                    d="M0,-6 L1.76,-1.85 6.18,-1.85 2.71,1.07 4.04,5.45 0,2.96 -4.04,5.45 -2.71,1.07 -6.18,-1.85 -1.76,-1.85 Z"
                    fill={HQ_GOLD}
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth={0.5}
                    style={{
                      filter: `drop-shadow(0 0 4px ${HQ_GOLD}aa)`,
                    }}
                  />
                </g>
              )}
            </g>
          ))}

          {/* Labels drawn AFTER pins so they sit on top. Each label is a
              `<foreignObject>` so the city name and the live weather can
              flow inline together — same visual unit, side-aware
              alignment from `placeLabels`. */}
          {placedLabels.map((pl, i) => (
            <OfficeMapLabel
              key={`label-${pl.point.id}`}
              city={pl.point.office.city ?? pl.point.office.name}
              lat={pl.point.lat}
              lng={pl.point.lng}
              side={pl.side}
              labelX={pl.labelX}
              labelY={pl.labelY}
              index={i}
            />
          ))}

          {placed.length === 0 && (
            <text
              x={MAP_WIDTH / 2}
              y={MAP_HEIGHT / 2}
              textAnchor="middle"
              fontSize={22}
              fontFamily="var(--font-body)"
              fill="rgba(255,255,255,0.4)"
            >
              {t.dashboard.noOfficesWithCoords}
            </text>
          )}
        </EuropeMapCanvas>

        {/* Glass top-edge highlight */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[1px]"
          style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0) 100%)' }}
        />
      </motion.div>

      {/* ── Footer summary — single row, truncates gracefully ─────── */}
      {/* paddingRight reserverer bunn-høyre-hjørnet for `OffiviewSignature`.
          Signaturen er position: fixed, controlBarSafeArea (bottom: 96px,
          right: 48px) og ~360px bred på vanlig desktop (45 mono + 16 gap +
          ~300 tagline) — venstrekant ender ~408px fra viewport-høyre. På
          4K-vegg vokser pad til 72px og monogrammet til ~67px, så signaturen
          spiser ~465px fra viewport-høyre. Wrapperen har allerede px-10
          (40px), så footer-paddingRight må være minst (signature_left −
          wrapper_pad) + luft. ≥400px på desktop, ≥480px på 4K. Tidligere
          clamp(220, 26vw, 460) ga bare 374px på 1440-skjerm, så «N kontorer»
          krasjet med signaturens venstre kant. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.4 }}
        className="flex items-center justify-between gap-4 pl-5 py-3 rounded-2xl flex-shrink-0 overflow-hidden"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          paddingRight: 'clamp(400px, 30vw, 500px)',
        }}
      >
        <div className="flex items-center gap-5 min-w-0 overflow-hidden">
          {/* HQ first når flagget er satt — gull-stjerne i stedet for
              standard prikk så ankerpunktet leses umiddelbart i strippen.
              Resten av kontorene følger sort_order som før. */}
          {[...placed]
            .sort((a, b) => Number(b.office.is_hq) - Number(a.office.is_hq))
            .slice(0, 10)
            .map(p => (
              <div key={p.id} className="flex items-center gap-2 flex-shrink-0">
                {p.office.is_hq ? (
                  <Star
                    className="w-3 h-3"
                    strokeWidth={2}
                    fill={HQ_GOLD}
                    style={{
                      color: HQ_GOLD,
                      filter: `drop-shadow(0 0 6px ${HQ_GOLD}aa)`,
                    }}
                  />
                ) : (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: officeColor,
                      boxShadow: `0 0 8px ${officeColor}`,
                    }}
                  />
                )}
                <span
                  className="text-[13px] font-medium tracking-wide"
                  style={{
                    color: p.office.is_hq ? '#f5e8c4' : 'rgba(255,255,255,0.75)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {p.office.city ?? p.office.name}
                </span>
              </div>
            ))}
          {placed.length > 10 && (
            <span
              className="text-[12px] tabular-nums flex-shrink-0"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)' }}
            >
              +{placed.length - 10}
            </span>
          )}
        </div>
        <span
          className="text-[11px] tracking-[0.22em] uppercase flex-shrink-0"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
        >
          {placed.length} {placed.length === 1 ? 'kontor' : 'kontorer'}
        </span>
      </motion.div>
    </div>
  )
}
