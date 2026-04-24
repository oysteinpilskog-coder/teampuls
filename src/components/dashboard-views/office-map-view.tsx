'use client'

import { motion } from 'framer-motion'
import { EuropeMapCanvas, MAP_WIDTH, MAP_HEIGHT } from './europe-map-canvas'
import { MapPin } from './map-pin'
import { project, resolveLocation } from '@/lib/geo'
import { placeLabels, textAnchorFor } from '@/lib/map-labels'
import { useStatusColors } from '@/lib/status-colors/context'
import { spring } from '@/lib/motion'
import type { Office } from '@/lib/supabase/types'
import { getISOWeek } from '@/lib/dates'
import { useT } from '@/lib/i18n/context'

interface OfficeMapViewProps {
  offices: Office[]
  orgName: string
  time: Date
}

function pad(n: number) { return String(n).padStart(2, '0') }

interface PlacedOffice {
  id: string
  office: Office
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
  const t = useT()
  const hours = pad(time.getHours())
  const minutes = pad(time.getMinutes())
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
        x, y,
        radius: 11,
      }
    })
    .filter((p): p is PlacedOffice => p !== null)

  const officeColor = STATUS_COLORS.office.icon

  const placedLabels = placeLabels(placed, { gap: 16, collisionRadius: 110 })

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
            Kontorene
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-widest uppercase"
              style={{
                background: 'rgba(0,102,255,0.12)',
                border: '1px solid rgba(0,102,255,0.25)',
                color: '#7FB2FF',
                fontFamily: 'var(--font-body)',
              }}
            >
              <motion.span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: officeColor }}
                animate={{ opacity: [1, 0.35, 1], scale: [1, 1.25, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              Uke {weekNum}
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
            background: 'linear-gradient(180deg, #ffffff 0%, #d4dbff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 24px rgba(120,150,255,0.18))',
          }}
        >
          {hours}:{minutes}
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
                auroraCompanion="#A0C4FF"
                index={i}
              />
            </g>
          ))}

          {/* Labels drawn AFTER pins so they sit on top — with collision-aware placement */}
          {placedLabels.map((pl, i) => {
            const anchor = textAnchorFor(pl.side)
            return (
              <motion.g
                key={`label-${pl.point.id}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.gentle, delay: 0.55 + i * 0.08 }}
              >
                {/* Subtle dark pill behind the text for readability */}
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
                  {pl.point.office.city ?? pl.point.office.name}
                </text>
              </motion.g>
            )
          })}

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
          {placed.slice(0, 10).map(p => (
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
