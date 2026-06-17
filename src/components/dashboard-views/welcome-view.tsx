'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Visit } from '@/lib/supabase/types'
import { spring } from '@/lib/motion'
import { useT } from '@/lib/i18n/context'
import { formatDateLabelLong } from '@/lib/dates'

interface WelcomeViewProps {
  visits: Visit[]
}

const CYCLE_MS = 12000

/** «14:00:00» eller «14:00» → «14:00». */
function trimSeconds(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time
}

/** ISO 'YYYY-MM-DD' → lokal Date uten tidssone-overraskelser. */
function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Velkomst-slide for resepsjons-TV. Vises kun mens et besøk er innenfor sitt
 * vindu (60 min før start → 15 min etter end_time, eller etter start_time hvis
 * end_time mangler — sjekket av filterActiveWelcomes).
 *
 * Apple-nivå hero:
 *  - Liten Manrope-eyebrow «Velkommen,»
 *  - Stort navn i Fraunces 300 (clamp 96–220px) med Paper-gradient + glow
 *  - Diskret meta-linje under: «kl. 14:00 · fra Acme AS»
 *
 * Ved flere overlappende besøk cycler komponenten gjennom dem hvert 12. sek
 * med mykere cross-fade — DashboardClient setter dwell høyt nok til at alle
 * får vist seg minst én gang før vi roterer videre til neste view.
 */
export function WelcomeView({ visits }: WelcomeViewProps) {
  const t = useT()
  const [idx, setIdx] = useState(0)

  // Reset cycler hver gang lista endrer seg (nytt besøk dukker opp eller
  // et eksisterende blir borte) så vi ikke står på en stale index.
  useEffect(() => {
    setIdx(0)
  }, [visits.length])

  useEffect(() => {
    if (visits.length <= 1) return
    const id = setInterval(() => {
      setIdx(i => (i + 1) % visits.length)
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [visits.length])

  const current = visits[idx % Math.max(1, visits.length)]

  if (!current) return null

  return (
    <div className="relative h-full w-full flex flex-col">
      {/* Org-wordmarken eies av dashboard-shellen så font og posisjon er
          konsistent på tvers av alle visninger. WelcomeView eier kun selve
          hero-flata under. */}

      {/* ── Hero — sentrert, dominerer skjermen ─────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-10 -mt-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col items-center text-center max-w-[90vw]"
          >
            {/* Eyebrow — liten Manrope, dempet Paper-tone. Setter scenen
                uten å konkurrere med navnet. */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.15 }}
              className="text-[14px] font-semibold tracking-[0.32em] uppercase"
              style={{
                color: 'rgba(245,239,228,0.55)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {t.dashboard.welcome.eyebrow}
            </motion.p>

            {/* Navn — hero. Fraunces 300 som klokken på TodayView, men på
                Paper-gradient (ikke Nordlys) så Nordlys-signaturen forblir
                unik per flate. */}
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.3 }}
              className="leading-[0.95] mt-6"
              style={{
                fontSize: 'clamp(96px, 14vw, 220px)',
                fontWeight: 300,
                fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
                fontVariationSettings: '"opsz" 144, "SOFT" 80',
                letterSpacing: '-0.035em',
                background:
                  'linear-gradient(180deg, #ffffff 0%, rgba(245,239,228,0.78) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 6px 36px rgba(245,239,228,0.16))',
              }}
            >
              {current.visitor_name}
            </motion.h1>

            {/* Nordlys-strek under navnet — den ene Nordlys-bruken på flata.
                Tegnes inn ved entré, blir værende som en stille horisont. */}
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 h-[2px] w-[min(280px,40vw)] origin-center rounded-full"
              style={{
                // Fallback-hex matcher CalWin-paletten slik at SSR-fallback
                // før CSS-variabler resolves ikke flasher feil farge.
                backgroundImage:
                  'linear-gradient(90deg, transparent 0%, var(--nordlys-a, #66C4EF) 30%, var(--nordlys-b, #4A4595) 50%, var(--nordlys-c, #322E7A) 70%, transparent 100%)',
                filter: 'drop-shadow(0 0 12px color-mix(in oklab, var(--nordlys-b) 45%, transparent))',
              }}
            />

            {/* Meta-linje: tid · firma. Manrope, oppercase tracking — samme
                «eyebrow»-vekt som over så flata har én konsistent metaskriftgrad. */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.7 }}
              className="mt-6 text-[15px] font-semibold tracking-[0.28em] uppercase"
              style={{
                color: 'rgba(245,239,228,0.78)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {/* Klokkeslett når satt, ellers dato — «kun dato»-besøk har
                  intet tidspunkt og viser datoen i stedet. */}
              <span className="tabular-nums">
                {current.start_time
                  ? t.dashboard.welcome.at.replace('{time}', trimSeconds(current.start_time))
                  : formatDateLabelLong(parseDateStr(current.date), t)}
              </span>
              {current.visitor_company && (
                <>
                  <span
                    aria-hidden
                    style={{ margin: '0 0.85em', color: 'rgba(245,239,228,0.35)' }}
                  >
                    ·
                  </span>
                  <span>
                    {t.dashboard.welcome.from.replace('{company}', current.visitor_company)}
                  </span>
                </>
              )}
            </motion.p>

            {/* Valgfri linje 2 — italic Fraunces så den snakker samme tonale
                språk som org-wordmarken på toppen og ikke konkurrerer med
                meta-linjens uppercase tracking. Brukes til kontekst som
                «Demo av nye produkter» eller «Møte med Johan». */}
            {current.note && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.gentle, delay: 0.85 }}
                className="leading-snug mt-5 max-w-[78vw]"
                style={{
                  fontFamily: 'var(--font-fraunces), "Iowan Old Style", Georgia, serif',
                  fontWeight: 300,
                  fontStyle: 'italic',
                  fontVariationSettings: '"opsz" 32, "SOFT" 80',
                  fontSize: 'clamp(20px, 1.6vw, 32px)',
                  letterSpacing: '-0.01em',
                  color: 'rgba(245,239,228,0.62)',
                }}
              >
                {current.note}
              </motion.p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Cycling-prikker, kun når flere besøk ────────────────────────── */}
      {visits.length > 1 && (
        <div className="flex justify-center gap-2 pb-8">
          {visits.map((v, i) => (
            <span
              key={v.id}
              className="h-[6px] rounded-full transition-all duration-500"
              style={{
                width: i === idx ? 24 : 6,
                background:
                  i === idx
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
