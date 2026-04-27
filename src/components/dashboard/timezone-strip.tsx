'use client'

import { useEffect, useState } from 'react'

interface TimezoneCity {
  city: string
  tz: string
}

// CalWin-byer hardkodet for v1. Senere flyttes dette til
// `organizations.dashboard_timezones` (settings → "Byer på dashboard").
const CITIES: TimezoneCity[] = [
  { city: 'Oslo',      tz: 'Europe/Oslo' },
  { city: 'Stockholm', tz: 'Europe/Stockholm' },
  { city: 'Vilnius',   tz: 'Europe/Vilnius' },
  { city: 'London',    tz: 'Europe/London' },
]

// 30s tick — sekund-presisjon er distraherende på en TV-stripe der
// klokka likevel oppdateres synlig kun på minutter. Sommertid håndteres
// automatisk av Intl.DateTimeFormat, ingen manuell DST-logikk.
const TICK_MS = 30_000

function format(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
    hour12: false,
  }).format(now)
}

interface TimezoneStripProps {
  /** Skjules under brand-overgangen så den 3.2s broa er ren. */
  visible?: boolean
}

/**
 * TimezoneStrip — fast stripe øverst i hjørnet på `/dashboard` med
 * lokaltid for hver by CalWin opererer i. Aldri en del av view-
 * rotasjonen; alltid synlig (utenom brand-overgang).
 *
 * Designspec (Dashboard atmosfære TODO v2 §4):
 *   • Manrope 500 tabular figures
 *   • 13px, Mist-farge, letter-spacing 0.06em
 *   • Format: `Oslo 14:32 · Stockholm 14:32 · Vilnius 15:32 · London 13:32`
 */
export function TimezoneStrip({ visible = true }: TimezoneStripProps) {
  const [now, setNow] = useState<Date | null>(null)

  // Initial state set in effect (not useState init) for SSR-stability —
  // server og klient må ikke divergere på timestamps.
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  if (!now) return null

  return (
    <div
      className="pointer-events-none transition-opacity duration-500"
      style={{
        opacity: visible ? 1 : 0,
        fontFamily: 'var(--font-manrope)',
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '0.06em',
        color: 'var(--mist)',
        fontVariantNumeric: 'tabular-nums',
      }}
      aria-label="Lokaltid for hovedbyer"
    >
      {CITIES.map((c, i) => (
        <span key={c.tz}>
          {i > 0 && (
            <span aria-hidden style={{ margin: '0 10px', opacity: 0.5 }}>·</span>
          )}
          <span>{c.city} {format(now, c.tz)}</span>
        </span>
      ))}
    </div>
  )
}
