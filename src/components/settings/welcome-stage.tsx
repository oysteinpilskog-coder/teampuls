'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { formatDateLabelLong } from '@/lib/dates'

export interface StageVisit {
  id: string
  visitor_name: string
  visitor_company: string | null
  /** 'HH:MM(:SS)' eller null for «kun dato»-besøk. */
  start_time: string | null
  /** ISO 'YYYY-MM-DD' — vises i stedet for klokkeslett når start_time er null. */
  date: string
  note: string | null
}

interface WelcomeStageProps {
  visits: StageVisit[]
  orgName: string
  /** Eyebrow over the name. Defaults to «Velkommen,». */
  eyebrow: string
  /** Localized «kl. {time}» template. */
  atTemplate: string
  /** Localized «fra {company}» template. */
  fromTemplate: string
  /**
   * When true, suppresses the auto-cycle and always shows the first visit.
   * Used while the editor sheet is open — the stage mirrors what the user
   * is typing and shouldn't drift to other entries.
   */
  freeze?: boolean
  /**
   * Cycle interval in ms. Live TV uses 12s; the settings page can run
   * shorter for a livelier admin overview without becoming twitchy.
   */
  cycleMs?: number
}

const DEFAULT_CYCLE_MS = 7000

function trimSeconds(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time
}

/** ISO 'YYYY-MM-DD' → lokal Date uten tidssone-overraskelser. */
function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Compact, faithful miniature of `WelcomeView` for use inside the settings
 * page and the editor sheet. The full hero uses `clamp()` with `vw` units
 * which would dwarf any in-page card; this component mirrors the layout
 * (eyebrow → name → nordlys line → meta → optional note) at fixed,
 * container-aware sizes via `clamp(min, vw, max)` capped to the card.
 *
 * Aurora backdrop is a stripped-down two-orb gradient — same colour ethos
 * as the real `AuroraBackground`, but no entry-driven sizing or breathing
 * orb. Just enough to feel alive without carrying a full GPU loop into a
 * settings card.
 */
export function WelcomeStage({
  visits,
  orgName,
  eyebrow,
  atTemplate,
  fromTemplate,
  freeze,
  cycleMs = DEFAULT_CYCLE_MS,
}: WelcomeStageProps) {
  const t = useT()
  const [idx, setIdx] = useState(0)

  // Reset to first slot whenever the list shape changes — so the editor's
  // synthetic visit always renders on top, and live updates from realtime
  // don't strand us on a stale index.
  useEffect(() => {
    setIdx(0)
  }, [visits.length, visits[0]?.id])

  useEffect(() => {
    if (freeze || visits.length <= 1) return
    const id = setInterval(() => {
      setIdx(i => (i + 1) % visits.length)
    }, cycleMs)
    return () => clearInterval(id)
  }, [visits.length, freeze, cycleMs])

  const safeIdx = visits.length === 0 ? 0 : idx % visits.length
  const current = visits[safeIdx]

  return (
    <div
      className="relative w-full overflow-hidden rounded-[20px]"
      style={{
        aspectRatio: '16 / 9',
        background:
          'radial-gradient(ellipse at 50% -10%, #15110E 0%, #08070B 55%, #050507 100%)',
        boxShadow:
          '0 30px 60px -22px rgba(0,0,0,0.55), 0 0 0 1px rgba(245,239,228,0.06)',
      }}
    >
      {/* ── Aurora orbs — two anchored, drifting CSS-keyframe lights. ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <style>{`
          @keyframes ws-orb-a {
            0%, 100% { transform: translate(-30%, -20%) scale(1); }
            50%      { transform: translate(-20%, -10%) scale(1.06); }
          }
          @keyframes ws-orb-b {
            0%, 100% { transform: translate(20%, 30%) scale(1); }
            50%      { transform: translate(30%, 20%) scale(1.04); }
          }
          @media (prefers-reduced-motion: reduce) {
            .ws-orb-a, .ws-orb-b { animation: none !important; }
          }
        `}</style>
        <div
          className="ws-orb-a absolute"
          style={{
            top: '0%',
            left: '0%',
            width: '70%',
            height: '70%',
            background:
              'radial-gradient(circle, color-mix(in oklab, var(--accent-color) 38%, transparent) 0%, transparent 65%)',
            filter: 'blur(28px)',
            mixBlendMode: 'screen',
            animation: 'ws-orb-a 22s ease-in-out infinite',
          }}
        />
        <div
          className="ws-orb-b absolute"
          style={{
            bottom: '0%',
            right: '0%',
            width: '70%',
            height: '70%',
            // Ambient orb i Nordlys-mid-tone — restaines per org-brand.
            background:
              'radial-gradient(circle, color-mix(in oklab, var(--nordlys-b) 28%, transparent) 0%, transparent 65%)',
            filter: 'blur(32px)',
            mixBlendMode: 'screen',
            animation: 'ws-orb-b 28s ease-in-out infinite',
          }}
        />
        {/* Vignette so the centre punches forward */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.42) 90%, rgba(0,0,0,0.7) 100%)',
          }}
        />
      </div>

      {/* ── Org wordmark, top-left, like live ── */}
      {orgName && (
        <div
          className="absolute"
          style={{
            top: 'clamp(10px, 2.4cqw, 22px)',
            left: 'clamp(14px, 3cqw, 30px)',
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontWeight: 300,
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 32, "SOFT" 80',
            fontSize: 'clamp(13px, 1.6cqw, 18px)',
            letterSpacing: '-0.02em',
            color: 'rgba(245,239,228,0.9)',
          }}
        >
          {orgName}
        </div>
      )}

      {/* ── Hero centred ── */}
      <div
        className="absolute inset-0 flex items-center justify-center px-6"
        style={{ containerType: 'size' }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {current ? (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="flex flex-col items-center text-center max-w-[92%]"
            >
              <p
                className="font-semibold uppercase"
                style={{
                  color: 'rgba(245,239,228,0.55)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'clamp(8px, 1.1cqw, 11px)',
                  letterSpacing: '0.32em',
                }}
              >
                {eyebrow}
              </p>

              <h2
                className="leading-[0.95]"
                style={{
                  marginTop: 'clamp(6px, 1.2cqw, 14px)',
                  fontSize: 'clamp(28px, 7cqw, 78px)',
                  fontWeight: 300,
                  fontFamily: 'var(--font-fraunces), Georgia, serif',
                  fontVariationSettings: '"opsz" 144, "SOFT" 80',
                  letterSpacing: '-0.035em',
                  background:
                    'linear-gradient(180deg, #ffffff 0%, rgba(245,239,228,0.78) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 4px 22px rgba(245,239,228,0.16))',
                }}
              >
                {current.visitor_name || '—'}
              </h2>

              {/* Nordlys line — same gradient as live */}
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="origin-center rounded-full"
                style={{
                  marginTop: 'clamp(8px, 1.6cqw, 18px)',
                  height: 1.5,
                  width: 'clamp(80px, 18cqw, 180px)',
                  // CalWin-fallbacks — ingen pre-CSS-flash av gammel mint.
                  backgroundImage:
                    'linear-gradient(90deg, transparent 0%, var(--nordlys-a, #66C4EF) 30%, var(--nordlys-b, #4A4595) 50%, var(--nordlys-c, #322E7A) 70%, transparent 100%)',
                  filter: 'drop-shadow(0 0 10px color-mix(in oklab, var(--nordlys-b) 45%, transparent))',
                }}
              />

              {/* Meta line: tid (eller dato for «kun dato»-besøk) · firma */}
              {(() => {
                const lead = current.start_time
                  ? atTemplate.replace('{time}', trimSeconds(current.start_time))
                  : current.date
                    ? formatDateLabelLong(parseDateStr(current.date), t)
                    : ''
                if (!lead && !current.visitor_company) return null
                return (
                  <p
                    className="font-semibold uppercase tabular-nums"
                    style={{
                      marginTop: 'clamp(8px, 1.6cqw, 16px)',
                      fontSize: 'clamp(9px, 1.2cqw, 12px)',
                      letterSpacing: '0.28em',
                      color: 'rgba(245,239,228,0.78)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {lead && <span>{lead}</span>}
                    {lead && current.visitor_company && (
                      <span
                        aria-hidden
                        style={{ margin: '0 0.85em', color: 'rgba(245,239,228,0.35)' }}
                      >
                        ·
                      </span>
                    )}
                    {current.visitor_company && (
                      <span>{fromTemplate.replace('{company}', current.visitor_company)}</span>
                    )}
                  </p>
                )
              })()}

              {current.note && (
                <p
                  className="leading-snug max-w-[78%]"
                  style={{
                    marginTop: 'clamp(8px, 1.4cqw, 14px)',
                    fontFamily: 'var(--font-fraunces), Georgia, serif',
                    fontWeight: 300,
                    fontStyle: 'italic',
                    fontVariationSettings: '"opsz" 32, "SOFT" 80',
                    fontSize: 'clamp(11px, 1.5cqw, 15px)',
                    letterSpacing: '-0.01em',
                    color: 'rgba(245,239,228,0.62)',
                  }}
                >
                  {current.note}
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={spring.gentle}
              className="flex flex-col items-center text-center"
            >
              <div
                style={{
                  fontFamily: 'var(--font-fraunces), Georgia, serif',
                  fontStyle: 'italic',
                  fontWeight: 300,
                  fontSize: 'clamp(20px, 4cqw, 38px)',
                  color: 'rgba(245,239,228,0.45)',
                  letterSpacing: '-0.02em',
                }}
              >
                Ingen ventet
              </div>
              <p
                className="mt-2 font-medium uppercase"
                style={{
                  fontSize: 'clamp(8px, 1cqw, 10px)',
                  letterSpacing: '0.28em',
                  color: 'rgba(245,239,228,0.4)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                TV-en hilser dem velkommen når noen er registrert
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Cycling dots, only when several ── */}
      {visits.length > 1 && !freeze && (
        <div
          className="absolute left-0 right-0 flex justify-center gap-1.5"
          style={{ bottom: 'clamp(10px, 1.8cqw, 18px)' }}
        >
          {visits.map((v, i) => (
            <span
              key={v.id}
              className="rounded-full transition-all duration-500"
              style={{
                height: 4,
                width: i === safeIdx ? 18 : 4,
                background:
                  i === safeIdx
                    ? 'rgba(245,239,228,0.85)'
                    : 'rgba(245,239,228,0.25)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
