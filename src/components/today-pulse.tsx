'use client'

import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion'
import { StatusIcon } from '@/components/icons/status-icons'
import type { EntryStatus } from '@/lib/supabase/types'
import { AvatarStack } from '@/components/member-avatar'
import { no } from '@/lib/i18n/no'
import { useTheme } from 'next-themes'
import { useState, useEffect, useRef, useMemo } from 'react'
import { spring } from '@/lib/motion'
import { useStatusColors } from '@/lib/status-colors/context'
import { formatDateLabelLong } from '@/lib/dates'

interface MemberWithEntry {
  id: string
  display_name: string
  avatar_url: string | null
  status: EntryStatus
  location_label: string | null
}

interface TodayPulseProps {
  entries: MemberWithEntry[]
}

const GROUPS: Array<{ status: EntryStatus; label: string }> = [
  { status: 'office',   label: no.status.office },
  { status: 'remote',   label: no.status.remote },
  { status: 'customer', label: no.status.customer },
  { status: 'travel',   label: no.status.travel },
  { status: 'vacation', label: no.status.vacation },
  { status: 'sick',     label: no.status.sick },
  { status: 'off',      label: no.status.off },
]

const COL_CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  7: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-7',
}

export function TodayPulse({ entries }: TodayPulseProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'
  const STATUS_COLORS = useStatusColors()
  const reduce = !!useReducedMotion()

  const visibleGroups = GROUPS
    .map((g) => ({ ...g, members: entries.filter((e) => e.status === g.status) }))
    .filter((g) => g.members.length > 0)

  const totalToday = entries.length
  const palette = useMemo(
    () => visibleGroups.map((g) => STATUS_COLORS[g.status].icon),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleGroups.map((g) => g.status).join(','), STATUS_COLORS],
  )

  if (visibleGroups.length === 0) return null

  const colClasses = COL_CLASSES[visibleGroups.length] ?? COL_CLASSES[7]

  return (
    <section className="relative isolate">
      {/* Aurora backdrop — multi-blob mesh gradient that breathes behind the whole section.
          Sits at z-index -1 inside the isolate so it never bleeds into anything outside.
          Gated on reduced-motion so users with the pref get a still, non-drifting backdrop. */}
      {!reduce && <AuroraBackdrop mounted={mounted} palette={palette} />}

      {/* Dramatic header — big day label, live clock, totals */}
      <PulseHeader mounted={mounted} totalToday={totalToday} />

      {/* The cards */}
      <div className={`grid ${colClasses} gap-5 md:gap-6`}>
        {visibleGroups.map((group, i) => (
          <PulseCard
            key={group.status}
            status={group.status}
            label={group.label}
            members={group.members}
            index={i}
            isDark={isDark}
            tone={STATUS_COLORS[group.status].icon}
            reduce={reduce}
          />
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function PulseHeader({ mounted, totalToday }: { mounted: boolean; totalToday: number }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    if (!mounted) return
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [mounted])

  const time = now
    ? new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' }).format(now)
    : ''
  const dateLabel = now ? formatDateLabelLong(now) : ''

  return (
    <div className="relative mb-8 md:mb-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <motion.span
              className="w-2 h-2 rounded-full"
              style={{
                background: '#10B981',
                boxShadow: '0 0 14px rgba(16,185,129,0.95), 0 0 3px rgba(16,185,129,0.6)',
              }}
              animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.18, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span
              className="text-[11px] font-bold uppercase tracking-[0.25em]"
              style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
            >
              Live · akkurat nå
            </span>
          </div>
          <h2
            className="font-bold leading-[0.88]"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sora)',
              letterSpacing: '-0.055em',
              fontSize: 'clamp(40px, 6.5vw, 76px)',
            }}
          >
            {totalToday} {totalToday === 1 ? 'person' : 'personer'}
          </h2>
          <div
            className="mt-2 text-[14px] md:text-[15px] font-medium min-h-[20px]"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
            suppressHydrationWarning
          >
            {dateLabel}
          </div>
        </div>

        {/* Huge live clock */}
        <div className="flex flex-col items-end shrink-0">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.25em] mb-1"
            style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            Klokka er
          </span>
          <motion.span
            key={time || 'empty'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="font-bold tabular-nums leading-none min-h-[44px]"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sora)',
              letterSpacing: '-0.05em',
              fontSize: 'clamp(32px, 4vw, 52px)',
            }}
            suppressHydrationWarning
          >
            {time || ' '}
          </motion.span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/** Five drifting blobs in the page palette — low contrast, always on the move,
 *  masked by the section itself so it never bleeds into the rest of the page. */
function AuroraBackdrop({ mounted, palette }: { mounted: boolean; palette: string[] }) {
  // Guard rails: no SSR render (so we don't ship the heavy decoration into the
  // critical HTML), and no render at all when there's no palette to draw from.
  if (!mounted || palette.length === 0) return null

  const blobs = palette.slice(0, 5)

  return (
    <div
      aria-hidden
      className="absolute pointer-events-none overflow-hidden"
      style={{
        inset: '-60px',
        zIndex: -1,
        maskImage:
          'radial-gradient(ellipse at center, black 40%, transparent 90%)',
        WebkitMaskImage:
          'radial-gradient(ellipse at center, black 40%, transparent 90%)',
      }}
    >
      {blobs.map((color, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 420,
            height: 420,
            left: `${(i * 22) + 6}%`,
            top: `${20 + (i % 2) * 40}%`,
            background: `radial-gradient(circle, ${color}55 0%, ${color}22 35%, transparent 70%)`,
            filter: 'blur(48px)',
            willChange: 'transform',
          }}
          animate={{
            x: [0, 24, -14, 18, 0],
            y: [0, -18, 22, -12, 0],
            scale: [1, 1.12, 0.94, 1.08, 1],
          }}
          transition={{
            duration: 16 + i * 3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 1.1,
          }}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

interface PulseCardProps {
  status: EntryStatus
  label: string
  members: MemberWithEntry[]
  index: number
  isDark: boolean
  tone: string
  reduce: boolean
}

function PulseCard({ status, label, members, index, isDark, tone, reduce }: PulseCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)

  // Cursor-driven 3D tilt — pointer position in [-0.5, 0.5] each axis.
  const mx = useMotionValue(0)
  const my = useMotionValue(0)

  // Smooth spring so the card doesn't chatter.
  const smx = useSpring(mx, { stiffness: 260, damping: 26, mass: 0.4 })
  const smy = useSpring(my, { stiffness: 260, damping: 26, mass: 0.4 })

  // Map to rotation degrees — subtle; overcooked tilt feels cheap.
  const rotateX = useTransform(smy, (v) => -v * 8)
  const rotateY = useTransform(smx, (v) => v * 10)

  // Spotlight follows the pointer across the card surface.
  const spotX = useTransform(smx, (v) => `${(v + 0.5) * 100}%`)
  const spotY = useTransform(smy, (v) => `${(v + 0.5) * 100}%`)

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce) return
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width - 0.5)
    my.set((e.clientY - r.top) / r.height - 0.5)
  }

  function handleLeave() {
    mx.set(0)
    my.set(0)
    setHover(false)
  }

  // Deeper, more dimensional 3-stop gradient.
  const gradient = isDark
    ? `linear-gradient(168deg,
         color-mix(in oklab, ${tone} 92%, white) 0%,
         ${tone} 44%,
         color-mix(in oklab, ${tone} 64%, black) 100%)`
    : `linear-gradient(168deg,
         color-mix(in oklab, ${tone} 96%, white) 0%,
         ${tone} 46%,
         color-mix(in oklab, ${tone} 74%, black) 100%)`

  // Four-layer halo — tight rim, near glow, mid bloom, broad atmospheric pool.
  const outerGlow = hover
    ? `0 0 0 1.5px color-mix(in oklab, ${tone} 62%, transparent),
       0 10px 24px -6px color-mix(in oklab, ${tone} 78%, transparent),
       0 26px 60px -14px color-mix(in oklab, ${tone} 80%, transparent),
       0 48px 100px -18px color-mix(in oklab, ${tone} 65%, transparent),
       0 72px 140px -28px color-mix(in oklab, ${tone} 45%, transparent)`
    : `0 0 0 1px color-mix(in oklab, ${tone} 30%, transparent),
       0 8px 22px -8px color-mix(in oklab, ${tone} 55%, transparent),
       0 24px 50px -14px color-mix(in oklab, ${tone} 55%, transparent),
       0 44px 90px -24px color-mix(in oklab, ${tone} 35%, transparent)`

  const innerEdges = isDark
    ? 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.32)'
    : 'inset 0 1px 0 rgba(255,255,255,0.50), inset 0 -1px 0 rgba(0,0,0,0.20)'

  const count = useCountUp(members.length, reduce ? 0 : 900 + index * 120)

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 28, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.gentle, delay: 0.08 + index * 0.08 }}
      onPointerMove={handleMove}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={handleLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        perspective: 1200,
      }}
      className="relative"
    >
      {/* Breathing ambient bloom — sits behind the card (z -1 within this stack).
          When reduced-motion is on, it stays put at a steady medium intensity. */}
      <motion.div
        aria-hidden
        className="absolute rounded-[32px] pointer-events-none"
        style={{
          inset: -20,
          background: `radial-gradient(60% 60% at 50% 55%, color-mix(in oklab, ${tone} 62%, transparent) 0%, transparent 72%)`,
          filter: 'blur(28px)',
          zIndex: -1,
        }}
        animate={{
          opacity: reduce ? 0.65 : hover ? 1 : [0.5, 0.8, 0.5],
          scale: reduce ? 1 : hover ? 1.04 : 1,
        }}
        transition={
          reduce
            ? { duration: 0.2 }
            : hover
              ? { duration: 0.35 }
              : { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 }
        }
      />

      {/* THE CARD — large, dramatic, with layered materials */}
      <motion.div
        className="relative rounded-[26px] overflow-hidden"
        style={{
          background: gradient,
          boxShadow: `${outerGlow}, ${innerEdges}`,
          transition: 'box-shadow 380ms cubic-bezier(0.22, 1, 0.36, 1)',
          minHeight: 260,
        }}
      >
        {/* Cursor-following spotlight — a soft white dot that brightens the card
            wherever the pointer is. Only visible when actually hovering. */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: useTransform(
              [spotX, spotY] as unknown as [typeof spotX, typeof spotY],
              ([x, y]) =>
                `radial-gradient(260px circle at ${x} ${y}, rgba(255,255,255,0.35), rgba(255,255,255,0) 65%)`,
            ),
            opacity: hover ? 1 : 0,
            transition: 'opacity 260ms ease-out',
            mixBlendMode: 'soft-light',
          }}
        />

        {/* Static top-left specular — iOS liquid-glass point light */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(130% 90% at 10% -10%, rgba(255,255,255,0.48) 0%, rgba(255,255,255,0.14) 26%, rgba(255,255,255,0) 58%)',
            mixBlendMode: 'soft-light',
          }}
        />

        {/* Top gloss + bottom dip */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.06) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.18) 100%)',
          }}
        />

        {/* Hairline top specular edge */}
        <div
          aria-hidden
          className="absolute top-0 left-[8%] right-[8%] h-px pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)',
          }}
        />

        {/* Diagonal shimmer sweep — slow, staggered, pauses between passes.
            Skipped entirely when reduced-motion is requested. */}
        {!reduce && (
          <motion.div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: '-30%',
              bottom: '-30%',
              width: '45%',
              background:
                'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.32) 45%, rgba(255,255,255,0) 100%)',
              filter: 'blur(6px)',
              mixBlendMode: 'soft-light',
            }}
            initial={{ left: '-60%' }}
            animate={{ left: ['-60%', '160%'] }}
            transition={{
              duration: 5.5,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 2.2 + index * 0.9,
              repeatDelay: 4,
            }}
          />
        )}

        {/* Premium noise grain */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.14] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
            backgroundSize: '160px 160px',
          }}
        />

        {/* Content */}
        <div
          className="relative flex flex-col justify-between h-full p-5 md:p-6"
          style={{ minHeight: 260, transform: 'translateZ(30px)' }}
        >
          {/* Top row — glassy icon chip + massive count */}
          <div className="flex items-start justify-between gap-3">
            <motion.div
              className="flex items-center justify-center rounded-2xl flex-shrink-0"
              animate={{
                boxShadow: hover
                  ? 'inset 0 0 0 1.5px rgba(255,255,255,0.5), 0 8px 18px rgba(0,0,0,0.25)'
                  : 'inset 0 0 0 1px rgba(255,255,255,0.32), 0 2px 6px rgba(0,0,0,0.14)',
              }}
              transition={{ duration: 0.3 }}
              style={{
                width: 42,
                height: 42,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.14) 100%)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <StatusIcon status={status} size={22} color="#ffffff" />
            </motion.div>

            <motion.span
              className="font-bold tabular-nums leading-[0.88]"
              animate={{ scale: hover ? 1.06 : 1 }}
              transition={spring.gentle}
              style={{
                fontFamily: 'var(--font-sora)',
                color: '#ffffff',
                fontSize: 'clamp(68px, 8vw, 96px)',
                letterSpacing: '-0.065em',
                textShadow:
                  '0 3px 14px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.22)',
              }}
            >
              {count}
            </motion.span>
          </div>

          {/* Bottom — label + avatars */}
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="font-bold truncate"
                style={{
                  color: '#ffffff',
                  fontFamily: 'var(--font-sora)',
                  fontSize: 19,
                  letterSpacing: '-0.025em',
                  textShadow: '0 1px 2px rgba(0,0,0,0.26)',
                }}
              >
                {label}
              </span>
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.16em] shrink-0"
                style={{
                  color: 'rgba(255,255,255,0.78)',
                  fontFamily: 'var(--font-body)',
                  textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              >
                {members.length === 1 ? 'person' : 'personer'}
              </span>
            </div>

            <AvatarStack
              members={members}
              max={5}
              size="md"
              ringColor="rgba(255,255,255,0.92)"
            />
          </div>
        </div>

        {/* Live heartbeat pip — only when hovered */}
        <motion.div
          aria-hidden
          className="absolute top-4 right-4 rounded-full pointer-events-none"
          style={{
            width: 6,
            height: 6,
            background: '#ffffff',
            boxShadow: '0 0 10px rgba(255,255,255,0.9)',
          }}
          animate={{ opacity: hover ? [0.4, 1, 0.4] : 0 }}
          transition={
            hover
              ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.2 }
          }
        />
      </motion.div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

/** Ease-out count animation from the previous value to `target`. */
function useCountUp(target: number, duration = 900): number {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)

  useEffect(() => {
    const from = prevRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.round(from + (target - from) * eased)
      setDisplay(v)
      if (t < 1) raf = requestAnimationFrame(tick)
      else prevRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return display
}
