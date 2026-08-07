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

export interface OrgFigures {
  team: {
    total: number
    /** country_code === 'NO' */
    norway: number
    /** Everything outside the UK department — the Nordic division. */
    nordic: number
    /** GB + IE */
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
  /** Distinct countries across customers ∪ offices ∪ team. */
  countryFootprint: number
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

  // ── Footprint ───────────────────────────────────────────────────────
  const footprint = new Set<string>()
  for (const code of [...memberCodes, ...customerCodes]) {
    if (code !== UNKNOWN_COUNTRY) footprint.add(code)
  }
  for (const o of offices) {
    const code = normalizeCode(o.country_code)
    if (code !== UNKNOWN_COUNTRY) footprint.add(code)
  }

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
      norway: memberCodes.filter(c => c === 'NO').length,
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
    countryFootprint: footprint.size,
  }
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
 * Localised country name via `Intl.DisplayNames`. Falls back to the raw
 * code on old runtimes or codes the ICU data doesn't know.
 */
export function countryName(code: string, locale: string, unknownLabel: string): string {
  if (code === UNKNOWN_COUNTRY) return unknownLabel
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}
