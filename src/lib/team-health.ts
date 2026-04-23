/**
 * Team-health score — four lightweight signals, each normalised to 0-100,
 * combined into an overall score and a letter grade. Pure function: takes
 * entries + member count, returns a self-contained report. No LLM, no I/O.
 *
 * The four signals are deliberately shallow — they shouldn't feel like
 * judgement or surveillance. They answer "does this team register status?
 * does it lean too hard in one direction? are a lot of people sick?" and
 * each one is actionable.
 */

import type { Entry, EntryStatus } from '@/lib/supabase/types'

export type HealthGrade = 'A' | 'B' | 'C' | 'D'

export interface HealthMetric {
  id: 'coverage' | 'diversity' | 'wellness' | 'coordination'
  label: string
  /** 0-100 */
  score: number
  /** One-line human-readable summary in Norwegian. */
  note: string
}

export interface HealthReport {
  /** Weighted average, 0-100. */
  overall: number
  grade: HealthGrade
  metrics: HealthMetric[]
  /** The single most actionable suggestion, Norwegian. */
  recommendation: string
  /** Number of member × weekday slots analysed. */
  slotCount: number
}

const WORKING_STATUSES: EntryStatus[] = ['office', 'remote', 'customer', 'travel']
const OUT_STATUSES: EntryStatus[] = ['vacation', 'sick', 'off']

interface ScoreInput {
  /** Active member count — the scoring denominator. */
  memberCount: number
  /** Every entry in the analysis window (weekdays only). Other dates are ignored. */
  entries: Entry[]
  /** The weekdays in the window, in any order. */
  weekdays: Date[]
}

export function scoreTeamHealth({ memberCount, entries, weekdays }: ScoreInput): HealthReport {
  const slotCount = memberCount * weekdays.length
  if (memberCount === 0 || weekdays.length === 0 || slotCount === 0) {
    return {
      overall: 0,
      grade: 'D',
      slotCount: 0,
      metrics: [],
      recommendation: 'Legg til medlemmer og registrer status for å komme i gang.',
    }
  }

  // Bucket entries by date for quick lookup.
  const entriesByDate = new Map<string, Entry[]>()
  for (const e of entries) {
    if (!entriesByDate.has(e.date)) entriesByDate.set(e.date, [])
    entriesByDate.get(e.date)!.push(e)
  }

  // ── 1. Coverage — how many slots are filled?
  // Ideal = 100% covered. Under 40% is concerning.
  const covered = entries.length
  const coverage = clamp(Math.round((covered / slotCount) * 100))

  // ── 2. Diversity — Shannon entropy over the status mix.
  // A team where 95% of entries are "office" scores worse than one with a
  // healthier mix across office/remote/customer. We ignore `off` / `sick`
  // in this signal; those belong to the Wellness metric.
  const workingStatusCounts: Record<string, number> = {}
  let workingTotal = 0
  for (const e of entries) {
    if (!(WORKING_STATUSES as string[]).includes(e.status)) continue
    workingStatusCounts[e.status] = (workingStatusCounts[e.status] ?? 0) + 1
    workingTotal += 1
  }
  let diversity = 0
  if (workingTotal > 0) {
    // Shannon entropy normalised by max entropy over N working statuses.
    const n = WORKING_STATUSES.length
    const maxH = Math.log2(n)
    let H = 0
    for (const s of WORKING_STATUSES) {
      const p = (workingStatusCounts[s] ?? 0) / workingTotal
      if (p > 0) H -= p * Math.log2(p)
    }
    diversity = clamp(Math.round((H / maxH) * 100))
  }

  // ── 3. Wellness — inverse of the sickness ratio. Low sickness = high score.
  // We cap at a 15% threshold: anything above that saturates to 0.
  const sickCount = entries.filter((e) => e.status === 'sick').length
  const sickRatio = sickCount / Math.max(1, entries.length)
  const wellness = clamp(Math.round((1 - Math.min(1, sickRatio / 0.15)) * 100))

  // ── 4. Coordination — how many weekdays had ≥ 3 people in the office?
  // Scaled against the number of weekdays: 1 such day per week is healthy,
  // so 6/30 days ≈ baseline "good".
  const goodDays = weekdays.filter((d) => {
    const iso = toISO(d)
    const rows = entriesByDate.get(iso) ?? []
    const officeCount = rows.filter((r) => r.status === 'office').length
    return officeCount >= 3
  }).length
  const coordinationExpected = Math.max(1, Math.floor(weekdays.length / 5)) // ≈ 1 per week
  const coordination = clamp(
    Math.round(Math.min(1, goodDays / (coordinationExpected * 2)) * 100),
  )

  const metrics: HealthMetric[] = [
    {
      id: 'coverage',
      label: 'Dekning',
      score: coverage,
      note:
        coverage >= 75
          ? 'Teamet registrerer flittig.'
          : coverage >= 45
            ? 'Flere dager kunne vært registrert.'
            : 'Mange slots er tomme — be teamet registrere.',
    },
    {
      id: 'diversity',
      label: 'Variasjon',
      score: diversity,
      note:
        diversity >= 70
          ? 'Sunn miks mellom kontor og andre arbeidsformer.'
          : diversity >= 40
            ? 'Teamet lener mot én arbeidsform.'
            : 'Nesten alle jobber på samme måte hver dag.',
    },
    {
      id: 'wellness',
      label: 'Velvære',
      score: wellness,
      note:
        wellness >= 85
          ? 'Lav sykefravær-andel.'
          : wellness >= 60
            ? 'Normal sykefravær.'
            : 'Høy sykefravær-andel — følg opp trivsel.',
    },
    {
      id: 'coordination',
      label: 'Koordinering',
      score: coordination,
      note:
        coordination >= 70
          ? 'Teamet møtes jevnlig på kontoret.'
          : coordination >= 35
            ? 'Noen fellesdager, men kunne vært flere.'
            : 'Få dager med flere på kontoret samtidig.',
    },
  ]

  // Weighted overall: dekning og variasjon veier mest.
  const overall = clamp(
    Math.round(
      coverage * 0.35 +
      diversity * 0.25 +
      wellness * 0.2 +
      coordination * 0.2,
    ),
  )

  return {
    overall,
    grade: gradeOf(overall),
    metrics,
    slotCount,
    recommendation: pickRecommendation(metrics),
  }
}

function gradeOf(score: number): HealthGrade {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 45) return 'C'
  return 'D'
}

function pickRecommendation(metrics: HealthMetric[]): string {
  // Lowest-scoring metric drives the advice.
  const worst = [...metrics].sort((a, b) => a.score - b.score)[0]
  switch (worst.id) {
    case 'coverage':
      return 'Oppfordre teamet til å registrere status for kommende uke — selv grove anslag hjelper planleggingen.'
    case 'diversity':
      return 'Vurder om én arbeidsform dominerer og om det stemmer med hva teamet ønsker.'
    case 'wellness':
      return 'Høy sykefravær-andel kan være et tidlig signal — ta en temperatursjekk i neste 1:1.'
    case 'coordination':
      return 'Prøv å samle teamet på kontoret én fast ukedag — bruk "Foreslå samlingsdager" for forslag.'
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
