'use client'

import { motion } from 'framer-motion'
import { EuropeMapCanvas, MAP_WIDTH, MAP_HEIGHT } from './europe-map-canvas'
import { project, resolveLocation } from '@/lib/geo'
import { placeLabels, textAnchorFor } from '@/lib/map-labels'
import { useStatusColors } from '@/lib/status-colors/context'
import { spring } from '@/lib/motion'
import type { Member, Entry, Office } from '@/lib/supabase/types'
import { getISOWeek } from '@/lib/dates'

interface OfficeMapViewProps {
  members: Member[]
  offices: Office[]
  todayEntries: Entry[]   // deduped to one per member
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
  peopleToday: number
  peopleHome: number
}

export function OfficeMapView({
  members,
  offices,
  todayEntries,
  orgName,
  time,
}: OfficeMapViewProps) {
  const STATUS_COLORS = useStatusColors()
  const hours = pad(time.getHours())
  const minutes = pad(time.getMinutes())
  const weekNum = getISOWeek(time)

  // Project each office that has coords (directly or via fallback lookup)
  const placed: PlacedOffice[] = offices
    .map<PlacedOffice | null>(office => {
      let lat = office.latitude
      let lng = office.longitude
      if (lat == null || lng == null) {
        const resolved = resolveLocation(office.city ?? office.name)
        if (!resolved) return null
        lat = resolved.lat
        lng = resolved.lng
      }
      const { x, y } = project(lat, lng, MAP_WIDTH, MAP_HEIGHT)

      const homeMembers = members.filter(m => m.home_office_id === office.id)
      const peopleToday = todayEntries.filter(e =>
        e.status === 'office' && homeMembers.some(m => m.id === e.member_id),
      ).length
      const active = peopleToday > 0
      const base = 16
      const radius = active ? base + Math.sqrt(peopleToday) * 9 : 10

      return {
        id: office.id,
        office,
        x, y, radius,
        peopleToday,
        peopleHome: homeMembers.length,
      }
    })
    .filter((p): p is PlacedOffice => p !== null)

  const totalAtOffice = placed.reduce((s, p) => s + p.peopleToday, 0)
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
              Live · Uke {weekNum}
            </span>
            <span
              className="text-[12px]"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}
            >
              {totalAtOffice} på kontor akkurat nå
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
          {placed.map((p, i) => {
            const active = p.peopleToday > 0
            const radius = p.radius

            return (
              <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
                {/* Concentric pulse — slower, more ambient */}
                {active && (
                  <>
                    <motion.circle
                      r={radius + 6}
                      fill="none"
                      stroke={officeColor}
                      strokeWidth={1.5}
                      opacity={0.45}
                      animate={{
                        r: [radius + 6, radius + 38, radius + 6],
                        opacity: [0.45, 0, 0.45],
                      }}
                      transition={{ duration: 3.4, repeat: Infinity, ease: 'easeOut' }}
                    />
                    <motion.circle
                      r={radius + 12}
                      fill="none"
                      stroke={officeColor}
                      strokeWidth={1}
                      opacity={0.32}
                      animate={{
                        r: [radius + 12, radius + 58, radius + 12],
                        opacity: [0.32, 0, 0.32],
                      }}
                      transition={{ duration: 3.4, delay: 1.3, repeat: Infinity, ease: 'easeOut' }}
                    />
                  </>
                )}

                {/* Ambient halo — soft gaussian */}
                <circle
                  r={radius + 6}
                  fill={officeColor}
                  opacity={active ? 0.28 : 0.08}
                  style={{ filter: 'blur(10px)' }}
                />

                {/* Dot base — hair-thin bright ring for definition */}
                <motion.circle
                  r={radius}
                  fill={officeColor}
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={0.8}
                  opacity={active ? 1 : 0.5}
                  initial={{ r: 0, opacity: 0 }}
                  animate={{ r: radius, opacity: active ? 1 : 0.5 }}
                  transition={{ ...spring.gentle, delay: 0.35 + i * 0.08 }}
                  style={{
                    filter: active
                      ? `drop-shadow(0 0 14px ${officeColor}) drop-shadow(0 2px 4px rgba(0,0,0,0.4))`
                      : `drop-shadow(0 0 4px ${officeColor}66)`,
                  }}
                />

                {/* Glass highlight */}
                <circle
                  r={radius * 0.55}
                  cx={-radius * 0.22}
                  cy={-radius * 0.28}
                  fill="white"
                  opacity={active ? 0.45 : 0.28}
                  style={{ filter: 'blur(1.2px)' }}
                />

                {/* Count label inside the dot */}
                {active && p.peopleToday >= 1 && (
                  <text
                    x={0}
                    y={radius > 22 ? 6 : 4}
                    textAnchor="middle"
                    fontSize={radius > 26 ? 19 : 13}
                    fontWeight={700}
                    fontFamily="var(--font-sora)"
                    fill="white"
                    style={{ userSelect: 'none', letterSpacing: '-0.01em' }}
                  >
                    {p.peopleToday}
                  </text>
                )}
              </g>
            )
          })}

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
                  fontSize={18}
                  fontWeight={700}
                  fontFamily="var(--font-sora)"
                  fill="white"
                  letterSpacing={0.5}
                  style={{
                    paintOrder: 'stroke',
                    stroke: 'rgba(2,4,10,0.75)',
                    strokeWidth: 5,
                    strokeLinejoin: 'round',
                  }}
                >
                  {pl.point.office.city ?? pl.point.office.name}
                </text>
                <text
                  x={pl.labelX}
                  y={pl.labelY + 20}
                  textAnchor={anchor}
                  fontSize={11}
                  fontFamily="var(--font-body)"
                  fill="rgba(255,255,255,0.55)"
                  letterSpacing={1.4}
                  style={{
                    textTransform: 'uppercase',
                    paintOrder: 'stroke',
                    stroke: 'rgba(2,4,10,0.7)',
                    strokeWidth: 4,
                    strokeLinejoin: 'round',
                  }}
                >
                  {pl.point.peopleToday} av {pl.point.peopleHome} inne
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
              Ingen kontorer med koordinater ennå.
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

      {/* ── Footer summary ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, delay: 0.4 }}
        className="flex items-center justify-between px-5 py-3 rounded-2xl flex-shrink-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-6 flex-wrap">
          {placed.map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: officeColor,
                  boxShadow: `0 0 8px ${officeColor}`,
                  opacity: p.peopleToday > 0 ? 1 : 0.35,
                }}
              />
              <span
                className="text-[13px] font-medium"
                style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-body)' }}
              >
                {p.office.city ?? p.office.name}
              </span>
              <span
                className="text-[13px] tabular-nums"
                style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-sora)' }}
              >
                {p.peopleToday}
              </span>
            </div>
          ))}
        </div>
        <span
          className="text-[11px] tracking-[0.22em] uppercase"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}
        >
          {placed.length} kontorer · {members.length} ansatte
        </span>
      </motion.div>
    </div>
  )
}
