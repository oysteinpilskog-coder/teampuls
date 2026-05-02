/**
 * Resolve hvilken språkpakke et medlem skal få i utgående e-post.
 *
 * Prioritet:
 *   1. members.preferred_locale (eksplisitt valg av medlemmet)
 *   2. office.country_code → locale (NO→no, SE→sv, GB→en, LT→lt)
 *   3. organizations.country_code → locale (samme map)
 *   4. DEFAULT_LOCALE ('no')
 *
 * Det betyr at en svensk konto i et CalWin-kontor i Stockholm får
 * svensk e-post automatisk uten at noen trenger å sette noe — så
 * lenge kontoret har country_code='SE'. Settes preferred_locale på
 * medlemmet, vinner den.
 */

import { no } from './no'
import { en } from './en'
import { sv } from './sv'
import { es } from './es'
import { lt } from './lt'
import { DEFAULT_LOCALE, isLocale, type Dictionary, type Locale } from './types'

const DICTIONARIES: Record<Locale, Dictionary> = { no, en, sv, es, lt }

/** Map ISO 3166-1 alpha-2 → Locale. Kun de fire landene vi har kontorer i. */
export const COUNTRY_TO_LOCALE: Record<string, Locale> = {
  NO: 'no',
  SE: 'sv',
  GB: 'en',
  LT: 'lt',
  // ES er en plausibel utvidelse; legges til når vi får et spansk kontor.
}

interface MemberLike {
  preferred_locale?: Locale | string | null
  home_office_id?: string | null
}

interface OfficeLike {
  id: string
  country_code?: string | null
}

interface OrgLike {
  country_code?: string | null
}

export function resolveMemberLocale(
  member: MemberLike,
  offices: OfficeLike[],
  org?: OrgLike,
): Locale {
  // 1. Member-level explicit override
  if (isLocale(member.preferred_locale ?? null)) {
    return member.preferred_locale as Locale
  }

  // 2. Office country
  if (member.home_office_id) {
    const office = offices.find((o) => o.id === member.home_office_id)
    const cc = office?.country_code?.toUpperCase()
    if (cc && COUNTRY_TO_LOCALE[cc]) return COUNTRY_TO_LOCALE[cc]
  }

  // 3. Organization country
  const orgCc = org?.country_code?.toUpperCase()
  if (orgCc && COUNTRY_TO_LOCALE[orgCc]) return COUNTRY_TO_LOCALE[orgCc]

  // 4. Default
  return DEFAULT_LOCALE
}

export function dictForLocale(locale: Locale): Dictionary {
  return DICTIONARIES[locale]
}
