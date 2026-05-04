'use client'

import { useMemo } from 'react'
import {
  GlobeCanvas,
  type OfficePoint,
  type OfficeArc,
  type OfficeLabelMeta,
} from './globe-canvas'
import { resolveLocation } from '@/lib/geo'
import type { Entry, Member, Office } from '@/lib/supabase/types'
import { useT } from '@/lib/i18n/context'

interface GlobeViewProps {
  offices: Office[]
  members: Member[]
  /** Deduped today entries (one row per active member, with assumed
   *  presence already applied). Used to count "online now". */
  todayEntries: Entry[]
  /** Currently rendered by the global top-bar — kept on the prop so
   *  the call site in dashboard-client.tsx mirrors sibling views. */
  orgName: string
  time: Date
}

// Local working hours window. 08:00–17:00 in each office's own
// timezone — matches the user's reference design. Tuneable per-org
// later if needed.
const WORK_HOURS_START = 8
const WORK_HOURS_END = 17

const COLOR_OPEN = '#4ade80'
const COLOR_CLOSED = '#6b7280'
const COLOR_HQ = '#fbbf24'

/**
 * Local-time helpers — Intl.DateTimeFormat does the heavy lifting so
 * we don't have to ship a tz database. Falls back to a longitude-
 * derived offset when the office row has no IANA timezone (rare; the
 * Office type carries `timezone: string | null`).
 */
function localTime(timezone: string | null, lng: number, now: Date): string {
  if (timezone) {
    try {
      return new Intl.DateTimeFormat('nb-NO', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now)
    } catch {
      // fall through to longitude approximation
    }
  }
  const offsetH = Math.round(lng / 15)
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  const local = new Date(utc + offsetH * 3_600_000)
  return `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`
}

function localHour(timezone: string | null, lng: number, now: Date): number {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false,
      }).formatToParts(now)
      const h = parts.find(p => p.type === 'hour')?.value
      if (h) return parseInt(h, 10)
    } catch {
      /* fall through */
    }
  }
  const offsetH = Math.round(lng / 15)
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utc + offsetH * 3_600_000).getHours()
}

function localWeekday(timezone: string | null, lng: number, now: Date): string {
  if (timezone) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
      }).format(now)
    } catch {
      /* fall through */
    }
  }
  const offsetH = Math.round(lng / 15)
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utc + offsetH * 3_600_000).toLocaleDateString('en-US', {
    weekday: 'short',
  })
}

function isOfficeOpen(o: OfficePoint, now: Date): boolean {
  const day = localWeekday(o.timezone, o.lng, now)
  if (day === 'Sat' || day === 'Sun') return false
  const h = localHour(o.timezone, o.lng, now)
  return h >= WORK_HOURS_START && h < WORK_HOURS_END
}

/**
 * Dashboard view G — «Verden i sanntid». A live globe.gl scene with
 * Earth night-lights texture, atmospheric glow, and animated arcs
 * between the org's offices. HUD overlays in the four corners do the
 * storytelling: org wordmark top-left, UTC clock top-right, headline
 * counters bottom-left, per-office status panel bottom-right.
 *
 * The data is the same as Kontorer (view C); the framing is what
 * makes this view feel like a control room rather than an atlas.
 */
export function GlobeView({
  offices,
  members,
  todayEntries,
  orgName,
  time,
}: GlobeViewProps) {
  const t = useT()

  // Membership count per office for the tooltip + bottom-left "Team"
  // stat. Members without an office are still counted toward Team
  // but never against any single office row.
  const teamPerOffice = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of members) {
      if (!m.home_office_id) continue
      counts.set(m.home_office_id, (counts.get(m.home_office_id) ?? 0) + 1)
    }
    return counts
  }, [members])

  // Resolve coordinates — same precedence as office-map-view (city
  // dictionary first, stored lat/lng as fallback). Drop offices that
  // have neither so the globe never plots a marker at NaN.
  const points: OfficePoint[] = useMemo(() => {
    return offices
      .map<OfficePoint | null>(o => {
        const cityHit = resolveLocation(o.city ?? o.name)
        const lat = cityHit?.lat ?? o.latitude
        const lng = cityHit?.lng ?? o.longitude
        if (typeof lat !== 'number' || typeof lng !== 'number') return null
        return {
          id: o.id,
          name: o.city ?? o.name,
          city: o.city ?? o.name,
          country: o.country_code ?? '',
          lat,
          lng,
          timezone: o.timezone,
          isHq: !!o.is_hq,
          team: teamPerOffice.get(o.id) ?? 0,
        }
      })
      .filter((p): p is OfficePoint => p !== null)
  }, [offices, teamPerOffice])

  // Arcs: HQ → every other office, plus a few peer pairs so the
  // network reads as a mesh, not a star. Mirrors the user's
  // reference design (Ålesund hub + Stockholm-Vilnius peer).
  const arcs: OfficeArc[] = useMemo(() => {
    if (points.length < 2) return []
    const hq = points.find(p => p.isHq) ?? points[0]
    const out: OfficeArc[] = []
    for (const p of points) {
      if (p.id === hq.id) continue
      out.push({
        startLat: hq.lat,
        startLng: hq.lng,
        endLat: p.lat,
        endLng: p.lng,
      })
    }
    // Add one peer pair (first non-HQ to second non-HQ) to break the
    // pure-star pattern. Keeps the arc count bounded so the screen
    // doesn't turn into a tangle.
    const others = points.filter(p => p.id !== hq.id)
    if (others.length >= 2) {
      out.push({
        startLat: others[0].lat,
        startLng: others[0].lng,
        endLat: others[1].lat,
        endLng: others[1].lng,
      })
    }
    return out
  }, [points])

  // Parent ticks `time` every second; we only need a fresh closure when
  // the displayed "HH:MM" actually changes, so all the time-dependent
  // memos below key on this minute-bucket. Hoisted into a variable so
  // the linter's "deps must be simple expressions" rule is happy.
  const minuteKey = time.getMinutes()

  // Color callback re-creates whenever `time` ticks — the parent
  // dashboard already updates `time` once a second so the open/closed
  // dot flips automatically when working hours roll over.
  const pointColor = useMemo(() => {
    return (o: OfficePoint) => {
      if (o.isHq) return COLOR_HQ
      return isOfficeOpen(o, time) ? COLOR_OPEN : COLOR_CLOSED
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey])

  // Per-office label data for the HTML overlay. Re-derives every minute
  // so we don't thrash labels 60× a minute for nothing.
  const labelMeta = useMemo(() => {
    return (o: OfficePoint): OfficeLabelMeta => {
      const open = isOfficeOpen(o, time)
      const status: 'hq' | 'open' | 'closed' = o.isHq
        ? 'hq'
        : open
        ? 'open'
        : 'closed'
      const statusColor =
        status === 'hq' ? COLOR_HQ : status === 'open' ? COLOR_OPEN : COLOR_CLOSED
      return {
        city: o.city,
        countryCode: (o.country ?? '').toUpperCase(),
        localTime: localTime(o.timezone, o.lng, time),
        status,
        statusColor,
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey])

  const pointLabel = useMemo(() => {
    return (o: OfficePoint) => {
      const open = isOfficeOpen(o, time)
      const dotColor = open ? COLOR_OPEN : COLOR_CLOSED
      const statusText = open
        ? t.dashboard.globe.openLabel
        : t.dashboard.globe.closedLabel
      const teamText =
        o.team === 1
          ? t.dashboard.globe.teamOne
          : t.dashboard.globe.teamMany.replace('{n}', String(o.team))
      // globe.gl expects an HTML string — escape office-controlled
      // strings (city, name) so a future free-form input can't break
      // out of the tooltip.
      const esc = (s: string) =>
        s.replace(/[&<>"']/g, c =>
          c === '&'
            ? '&amp;'
            : c === '<'
            ? '&lt;'
            : c === '>'
            ? '&gt;'
            : c === '"'
            ? '&quot;'
            : '&#39;'
        )
      const role = o.isHq ? 'HQ' : t.dashboard.globe.officeOne
      return `
        <div style="background:rgba(0,0,0,0.85);padding:12px 16px;border-radius:12px;
                    font-family:var(--font-body),system-ui;font-size:12px;color:#fff;
                    border:1px solid rgba(255,255,255,0.1);min-width:180px;">
          <div style="font-size:14px;font-weight:600;">${esc(o.city)}</div>
          <div style="color:rgba(255,255,255,0.55);font-size:10px;
                      letter-spacing:0.15em;text-transform:uppercase;margin-top:2px;">
            ${esc(o.country)}${o.country ? ' · ' : ''}${role}
          </div>
          <div style="margin-top:8px;font-size:11px;">
            <span style="color:${dotColor};">●</span>
            ${statusText} · ${localTime(o.timezone, o.lng, time)}
          </div>
          <div style="color:rgba(255,255,255,0.55);font-size:11px;margin-top:2px;">
            ${teamText}
          </div>
        </div>
      `
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey, t])

  // Stats for the bottom-left HUD.
  const onlineNow = useMemo(() => {
    return todayEntries.filter(e => e.status === 'office').length
  }, [todayEntries])

  // UTC clock for the top-right HUD. Re-derives every render — the
  // dashboard already drives a 1 Hz tick into `time`.
  const utcClock = useMemo(() => {
    const hh = String(time.getUTCHours()).padStart(2, '0')
    const mm = String(time.getUTCMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }, [time])
  const utcDate = useMemo(() => {
    return time.toUTCString().slice(5, 16) + ' UTC'
  }, [time])

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#000' }}>
      <GlobeCanvas
        offices={points}
        arcs={arcs}
        pointColor={pointColor}
        pointLabel={pointLabel}
        labelMeta={labelMeta}
        // CalWin-zoom: altitude 0.45 putter kameraet veldig tett over
        // Nord-Europa — Newcastle/Spalding på vest-randen, Vilnius på
        // øst, Ålesund øverst, og Polen/Sør-England nederst. Vi sitter
        // tett nok på at skyer leser som distinkte klynger og
        // landformer som gjenkjennelige silhuetter, ikke som det
        // ICBM-perspektivet 0.7 ga. Lat 57 sentrerer pin-skyen
        // vertikalt når globen ruller forbi; lng 12 fanger CalWins
        // tyngdepunkt mellom Norge og Litauen.
        initialView={{ lat: 57, lng: 12, altitude: 0.45 }}
        // Veldig sakte rotasjon — 0.08 °/s ≈ én omdreining på ~75 min.
        // Føles ambient på TV-en, ikke som en spinning beach ball.
        autoRotateSpeed={0.08}
      />

      {/* Empty state — globe still renders but no markers. The HUD
          tells the user why so it doesn't look like a bug. */}
      {points.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}
        >
          {t.dashboard.noOfficesWithCoords}
        </div>
      )}

      {/* ── HUD top-left: workspace wordmark ─────────────────────── */}
      <div className={GLASS_CLS} style={{ ...glassStyle, position: 'absolute', top: 32, left: 32, padding: '18px 24px', zIndex: 10 }}>
        <div
          style={{
            margin: '0 0 4px 0',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.55)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {orgName}
        </div>
        <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.01em', fontFamily: 'var(--font-fraunces)' }}>
          {t.dashboard.globe.heading}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2, fontFamily: 'var(--font-body)' }}>
          {t.dashboard.globe.subtitle}
        </div>
      </div>

      {/* ── HUD top-right: UTC clock ─────────────────────────────── */}
      <div
        className={GLASS_CLS}
        style={{ ...glassStyle, position: 'absolute', top: 32, right: 32, padding: '14px 20px', zIndex: 10, textAlign: 'right' }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 200,
            letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'var(--font-body)',
          }}
        >
          {utcClock}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.45)',
            marginTop: 2,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-body)',
          }}
        >
          {utcDate}
        </div>
      </div>

      {/* ── HUD bottom-left: stat triplet ────────────────────────── */}
      <div style={{ position: 'absolute', bottom: 32, left: 32, display: 'flex', gap: 14, zIndex: 10 }}>
        <StatCard value={points.length} label={t.dashboard.globe.statOffices} />
        <StatCard
          value={onlineNow}
          label={t.dashboard.globe.statOnline}
          accent={COLOR_OPEN}
        />
        <StatCard value={members.length} label={t.dashboard.globe.statTeam} />
      </div>

      {/* ── HUD bottom-right: live office list ─────────────────────
          bottom: 170 holder kortet over `OffiviewSignature` (fixed,
          controlBarSafeArea — bottom:96 + ~51px høyde = topp 147px fra
          bunn). Tidligere bottom: 32 lå UNDER signaturen, så de
          nederste kontor-radene ble skjult bak Offiview-merket og
          taglinen. Ikke samme problem på bunn-venstre HUD-stat-radene
          siden signaturen er ankret høyre. */}
      <div
        className={GLASS_CLS}
        style={{
          ...glassStyle,
          position: 'absolute',
          bottom: 170,
          right: 32,
          padding: '16px 20px',
          minWidth: 240,
          zIndex: 10,
        }}
      >
        {points.map((p, i) => {
          const open = isOfficeOpen(p, time)
          const dot = open ? COLOR_OPEN : COLOR_CLOSED
          const isLast = i === points.length - 1
          return (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)',
                fontSize: 12,
                fontFamily: 'var(--font-body)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: dot,
                    boxShadow: `0 0 8px ${dot}`,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div>{p.city}</div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.4)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {p.country}
                  </div>
                </div>
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {localTime(p.timezone, p.lng, time)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Shared "frosted glass" panel styling used by every HUD card.
// Pulled into a constant so they read as one visual language and a
// single tweak (tint, blur radius, border alpha) flows everywhere.
const GLASS_CLS = ''
const glassStyle: React.CSSProperties = {
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  background: 'rgba(20, 20, 28, 0.55)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 18,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  color: '#fff',
}

function StatCard({
  value,
  label,
  accent,
}: {
  value: number | string
  label: string
  accent?: string
}) {
  return (
    <div className={GLASS_CLS} style={{ ...glassStyle, padding: '12px 18px' }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 300,
          color: accent ?? '#fff',
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'var(--font-body)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
          marginTop: 2,
          fontFamily: 'var(--font-body)',
        }}
      >
        {label}
      </div>
    </div>
  )
}
