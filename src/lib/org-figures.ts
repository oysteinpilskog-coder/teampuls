import { getCountryLabel } from './countries'
import type { Customer, Member, Office } from './supabase/types'

/**
 * CalWin AS splits both its customer base and its staff into two
 * departments: UK and Nordic. «UK» covers the whole British Isles —
 * England, Scotland, Wales, Northern Ireland and the Republic of Ireland
 * (Irish customers like Costello belong to the UK department). «Nordic»
 * is defined as the complement, so NO/SE/DK/FI/IS/LT and anything without
 * a country code land there rather than falling out of the totals.
 *
 * Single source of truth — `customer-map-view.tsx` (views H/I) imports
 * this so the split on the figures board can never drift from the split
 * on the customer maps.
 */
export const UK_COUNTRY_CODES = new Set(['GB', 'IE'])

/** Bucket for rows with no `country_code`. Never rendered with a flag. */
export const UNKNOWN_COUNTRY = 'ZZ'

/** Milliseconds in an average Gregorian year (accounts for leap years). */
const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000

export interface CountryCount {
  /** ISO 3166-1 alpha-2, uppercased, or UNKNOWN_COUNTRY. */
  code: string
  count: number
}

export interface TenurePerson {
  name: string
  years: number
}

export interface UpcomingBirthday {
  name: string
  /** Month (1-12) and day of the birthday itself — never the birth year,
   *  which stays private even though we sort by the upcoming date. */
  month: number
  day: number
  /** 0 = today, 1 = tomorrow, … Always 0-365. */
  daysUntil: number
}

export interface OrgFigures {
  team: {
    total: number
    /** Everything outside the UK department — the Nordic division. */
    nordic: number
    /** GB + IE — mirrors the customer split exactly. */
    uk: number
    byCountry: CountryCount[]
    /** Distinct countries with at least one team member. */
    countries: number
    /** Distinct `preferred_locale` values (explicit picks only). */
    languages: number
  }
  customers: {
    total: number
    /** GB + IE — England, Scotland, Wales, N. Ireland and Ireland. The
     *  whole British Isles is one department, so Scottish and Irish
     *  customers are counted here, not in Nordic. */
    uk: number
    /** Everything that is not UK — NO/SE/DK/FI/IS/LT and customers with
     *  no country code. The complement, so the two always sum to total. */
    nordic: number
    byCountry: CountryCount[]
    countries: number
    /** Customers with no country_code — a small data-quality signal. */
    unplaced: number
  }
  offices: {
    total: number
    hq: number
    countries: number
    timezones: number
  }
  tenure: {
    /** Summed years of service across everyone with a start_date. */
    totalYears: number
    avgYears: number
    /** How many members actually carry a start_date (the divisor). */
    counted: number
    /** Longest-serving member — only members who opted in are named. */
    longest: TenurePerson | null
  }
  /** Next birthday coming up, or null when the org has birthdays switched
   *  off / nobody has opted in. Sits next to tenure on the board: the two
   *  celebration facts about the team belong together. */
  nextBirthday: UpcomingBirthday | null
  /** Distinct countries across customers ∪ offices ∪ team, biggest first.
   *  Rendered as flags so «Land: 8» is never a mystery number. */
  countryFootprint: string[]
}

/** Fractional years between an ISO date and `now`. Null on unparseable input. */
export function yearsSince(iso: string, now: Date): number | null {
  const parsed = new Date(`${iso}T00:00:00`)
  const ms = now.getTime() - parsed.getTime()
  if (Number.isNaN(ms)) return null
  // Future start dates (a signed-but-not-started hire) count as zero rather
  // than subtracting from the company total.
  return ms < 0 ? 0 : ms / MS_PER_YEAR
}

function normalizeCode(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase()
  return c.length === 2 ? c : UNKNOWN_COUNTRY
}

/**
 * Which country a member sits in. `home_office_id → office.country_code`
 * is the precise signal (it distinguishes NO/SE/LT), so it wins.
 * `location_code` is the fallback for members with no office attached —
 * it only carries NO/GB, but that is still better than "unknown".
 */
export function memberCountry(
  member: Member,
  officeById: Map<string, Office>,
): string {
  const office = member.home_office_id ? officeById.get(member.home_office_id) : undefined
  if (office?.country_code) return normalizeCode(office.country_code)
  return normalizeCode(member.location_code ?? 'NO')
}

function tally(codes: string[]): CountryCount[] {
  const map = new Map<string, number>()
  for (const code of codes) map.set(code, (map.get(code) ?? 0) + 1)
  return Array.from(map, ([code, count]) => ({ code, count })).sort(
    // Biggest first; unknown always sinks to the bottom regardless of size
    // so it never headlines the list.
    (a, b) => {
      if (a.code === UNKNOWN_COUNTRY) return 1
      if (b.code === UNKNOWN_COUNTRY) return -1
      return b.count - a.count || a.code.localeCompare(b.code)
    },
  )
}

function countKnown(counts: CountryCount[]): number {
  return counts.filter(c => c.code !== UNKNOWN_COUNTRY).length
}

/**
 * Everything the «Nøkkeltall» dashboard view shows, derived purely from
 * the three registries the dashboard already holds in memory (members,
 * offices, customers). No extra round-trip, and it re-derives for free on
 * every realtime update.
 *
 * `now` is passed in rather than read from the clock so tenure numbers are
 * stable within a render and follow the dashboard's own ticking clock.
 */
export function computeOrgFigures(
  members: Member[],
  offices: Office[],
  customers: Customer[],
  now: Date,
  options: { birthdaysEnabled?: boolean } = {},
): OrgFigures {
  const officeById = new Map(offices.map(o => [o.id, o]))

  // ── Team ────────────────────────────────────────────────────────────
  const memberCodes = members.map(m => memberCountry(m, officeById))
  const teamByCountry = tally(memberCodes)
  const teamUk = memberCodes.filter(c => UK_COUNTRY_CODES.has(c)).length

  // ── Customers ───────────────────────────────────────────────────────
  const customerCodes = customers.map(c => normalizeCode(c.country_code))
  const customersByCountry = tally(customerCodes)
  const customerUkDept = customerCodes.filter(c => UK_COUNTRY_CODES.has(c)).length

  // ── Tenure ──────────────────────────────────────────────────────────
  // Aggregate totals count everyone with a start_date: a sum reveals no
  // individual. Naming the longest-serving person does, so that one honours
  // the same `anniversary_visible` opt-out the wheel and celebrations use.
  let totalYears = 0
  let counted = 0
  let longest: TenurePerson | null = null
  for (const m of members) {
    if (!m.start_date) continue
    const years = yearsSince(m.start_date, now)
    if (years === null) continue
    totalYears += years
    counted += 1
    if (m.anniversary_visible === false) continue
    if (!longest || years > longest.years) {
      longest = { name: m.display_name, years }
    }
  }

  // ── Next birthday ───────────────────────────────────────────────────
  // Doubly gated: the org-wide switch must be on AND the member must have
  // opted in (birthday_visible defaults to FALSE in the database — birthdays
  // are the one personal date we never surface by accident). The birth YEAR
  // never leaves this function; only month/day travel to the UI.
  const nextBirthday = options.birthdaysEnabled === false
    ? null
    : findNextBirthday(members, now)

  // ── Footprint ───────────────────────────────────────────────────────
  // Counted across all three registries and returned as a list, so the
  // «Land»-card can show WHICH countries rather than just how many.
  const footprintCounts = new Map<string, number>()
  const bump = (code: string) => {
    if (code === UNKNOWN_COUNTRY) return
    footprintCounts.set(code, (footprintCounts.get(code) ?? 0) + 1)
  }
  for (const code of [...memberCodes, ...customerCodes]) bump(code)
  for (const o of offices) bump(normalizeCode(o.country_code))
  const footprint = Array.from(footprintCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code]) => code)

  const officeCountries = new Set(
    offices.map(o => normalizeCode(o.country_code)).filter(c => c !== UNKNOWN_COUNTRY),
  )
  const timezones = new Set(offices.map(o => o.timezone).filter((tz): tz is string => !!tz))
  const languages = new Set(
    members.map(m => m.preferred_locale).filter((l): l is NonNullable<typeof l> => !!l),
  )

  return {
    team: {
      total: members.length,
      nordic: members.length - teamUk,
      uk: teamUk,
      byCountry: teamByCountry,
      countries: countKnown(teamByCountry),
      languages: languages.size,
    },
    customers: {
      total: customers.length,
      uk: customerUkDept,
      nordic: customers.length - customerUkDept,
      byCountry: customersByCountry,
      countries: countKnown(customersByCountry),
      unplaced: customerCodes.filter(c => c === UNKNOWN_COUNTRY).length,
    },
    offices: {
      total: offices.length,
      hq: offices.filter(o => o.is_hq).length,
      countries: officeCountries.size,
      timezones: timezones.size,
    },
    tenure: {
      totalYears,
      avgYears: counted > 0 ? totalYears / counted : 0,
      counted,
      longest,
    },
    nextBirthday,
    countryFootprint: footprint,
  }
}

/**
 * The birthday coming up soonest, counting today as 0. Compares on
 * month/day only and wraps across new year, so 31 December → 1 January is
 * one day, not 364.
 *
 * Members who have not opted in (`birthday_visible !== true`) are skipped
 * entirely — the column defaults to FALSE precisely so this surface stays
 * empty until someone chooses otherwise.
 */
function findNextBirthday(members: Member[], now: Date): UpcomingBirthday | null {
  const todayMonth = now.getMonth() + 1
  const todayDay = now.getDate()
  // Day-of-year style ordinal that ignores the year. 29 February simply
  // sorts between 28 Feb and 1 Mar in non-leap years, which is the
  // behaviour anyone would expect from a "who's next" line.
  const ordinal = (m: number, d: number) => m * 100 + d
  const todayOrd = ordinal(todayMonth, todayDay)

  let best: UpcomingBirthday | null = null
  let bestDistance = Infinity

  for (const m of members) {
    if (m.birthday_visible !== true || !m.birth_date) continue
    const parsed = new Date(`${m.birth_date}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) continue

    const month = parsed.getMonth() + 1
    const day = parsed.getDate()

    // Build this year's occurrence; if it already passed, roll to next year.
    let next = new Date(now.getFullYear(), month - 1, day)
    if (ordinal(month, day) < todayOrd) {
      next = new Date(now.getFullYear() + 1, month - 1, day)
    }
    const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const daysUntil = Math.round(
      (next.getTime() - midnightToday.getTime()) / (24 * 60 * 60 * 1000),
    )

    if (daysUntil < bestDistance) {
      bestDistance = daysUntil
      best = { name: m.display_name, month, day, daysUntil }
    }
  }

  return best
}

/**
 * ISO alpha-2 → flag emoji, by offsetting each letter into the Unicode
 * regional-indicator block. Beats a hand-maintained table: every country
 * a customer could ever sit in works without a code change.
 */
export function flagEmoji(code: string): string | null {
  if (code === UNKNOWN_COUNTRY) return null
  if (!/^[A-Z]{2}$/.test(code)) return null
  return String.fromCodePoint(
    ...[...code].map(ch => 0x1f1e6 + (ch.charCodeAt(0) - 65)),
  )
}

/**
 * Localised country name. Thin wrapper over the shared `getCountryLabel`
 * so the figures board names countries exactly like the rest of the app —
 * it only adds the "no country code" case, which callers render as a
 * translated «Uplassert» rather than an ISO code.
 */
export function countryName(code: string, locale: string, unknownLabel: string): string {
  if (code === UNKNOWN_COUNTRY) return unknownLabel
  return getCountryLabel(code, locale) || code
}
