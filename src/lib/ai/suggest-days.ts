/**
 * "Foreslå samlingsdager" — given the team's planned entries for the next
 * two weeks and their historical weekday patterns from the last six weeks,
 * pick the three weekdays that look like the best opportunities to be in
 * the office together.
 *
 * The function is pure analytics — no LLM call — so it's cheap, fast, and
 * deterministic. The "AI" framing in the UI is about pattern-learning:
 * we predict absent members' likely status from their past behaviour.
 */

import type { Entry, EntryStatus } from '@/lib/supabase/types'

export interface SuggestedDay {
  /** ISO date: YYYY-MM-DD */
  date: string
  /** 0-100, higher = stronger coordination opportunity */
  score: number
  /** Members explicitly planned in the office on this day. */
  plannedIn: string[]
  /** Members who have a conflicting plan (vacation/sick/off) on this day. */
  plannedOut: string[]
  /** Members with no plan yet whose historical pattern suggests "usually in". */
  likelyIn: string[]
  /** Members with no plan yet whose historical pattern suggests "usually out". */
  likelyOut: string[]
  /** Short human-readable reason, Norwegian. */
  reason: string
  /** Weekday name in Norwegian, e.g. "Torsdag 23. april" */
  label: string
}

export interface SuggestDaysResult {
  suggestions: SuggestedDay[]
  /** Whether we had enough signal to produce any useful suggestions. */
  hasSignal: boolean
}

const WEEKDAYS_NB: Record<number, string> = {
  0: 'Søndag', 1: 'Mandag', 2: 'Tirsdag', 3: 'Onsdag',
  4: 'Torsdag', 5: 'Fredag', 6: 'Lørdag',
}
const MONTHS_NB: Record<number, string> = {
  0: 'januar', 1: 'februar', 2: 'mars', 3: 'april', 4: 'mai', 5: 'juni',
  6: 'juli', 7: 'august', 8: 'september', 9: 'oktober', 10: 'november', 11: 'desember',
}

function formatNB(date: Date): string {
  return `${WEEKDAYS_NB[date.getDay()]} ${date.getDate()}. ${MONTHS_NB[date.getMonth()]}`
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const OFFICE_ISH: EntryStatus[] = ['office']
const OUT_ISH: EntryStatus[] = ['vacation', 'sick', 'off']

interface Member {
  id: string
  display_name: string
}

export function suggestCoordinationDays(params: {
  members: Member[]
  /** All entries for the analysis window (historical + next 14 weekdays). */
  entries: Entry[]
  /** Today's midnight in the relevant timezone (as a Date in local time). */
  today: Date
  /** How many forward weekdays to consider. Default 14. */
  horizonWeekdays?: number
  /** How many historical weekdays to use for pattern learning. Default 30. */
  historyWeekdays?: number
  /** Max number of suggestions returned. Default 3. */
  limit?: number
}): SuggestDaysResult {
  const horizon = params.horizonWeekdays ?? 14
  const history = params.historyWeekdays ?? 30
  const limit = params.limit ?? 3

  const memberById = new Map(params.members.map((m) => [m.id, m]))

  // Build forward weekdays list (skip Sat/Sun) starting tomorrow.
  const forward: Date[] = []
  const cursor = new Date(params.today)
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() + 1)
  while (forward.length < horizon) {
    const dow = cursor.getDay()
    if (dow !== 0 && dow !== 6) forward.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  // Build backward weekdays list for pattern analysis.
  const backward: Date[] = []
  const bcursor = new Date(params.today)
  bcursor.setHours(0, 0, 0, 0)
  bcursor.setDate(bcursor.getDate() - 1)
  while (backward.length < history) {
    const dow = bcursor.getDay()
    if (dow !== 0 && dow !== 6) backward.push(new Date(bcursor))
    bcursor.setDate(bcursor.getDate() - 1)
  }

  // Index entries by date for O(1) lookup.
  const byDate = new Map<string, Entry[]>()
  for (const e of params.entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  }

  // Compute per-member, per-weekday "office frequency" from history.
  // Skip weeks where they had no entry at all (don't penalise silent weeks).
  const memberWeekdayInRate = new Map<string, number[]>() // [Sun..Sat]
  for (const m of params.members) {
    const counts = new Array(7).fill(0)
    const totals = new Array(7).fill(0)
    for (const bd of backward) {
      const iso = toISO(bd)
      const entries = byDate.get(iso) ?? []
      const mine = entries.find((e) => e.member_id === m.id)
      if (!mine) continue
      totals[bd.getDay()] += 1
      if (OFFICE_ISH.includes(mine.status)) counts[bd.getDay()] += 1
    }
    const rates = counts.map((c, i) => (totals[i] === 0 ? 0.5 : c / totals[i]))
    memberWeekdayInRate.set(m.id, rates)
  }

  // Score each forward weekday.
  const scored: SuggestedDay[] = forward.map((date) => {
    const iso = toISO(date)
    const dow = date.getDay()
    const entries = byDate.get(iso) ?? []
    const byMember = new Map<string, Entry>()
    entries.forEach((e) => byMember.set(e.member_id, e))

    const plannedIn: string[] = []
    const plannedOut: string[] = []
    const likelyIn: string[] = []
    const likelyOut: string[] = []

    for (const m of params.members) {
      const e = byMember.get(m.id)
      if (e) {
        if (OFFICE_ISH.includes(e.status)) plannedIn.push(m.display_name)
        else if (OUT_ISH.includes(e.status)) plannedOut.push(m.display_name)
      } else {
        const rate = memberWeekdayInRate.get(m.id)?.[dow] ?? 0.5
        if (rate >= 0.6) likelyIn.push(m.display_name)
        else if (rate <= 0.25) likelyOut.push(m.display_name)
      }
    }

    // Scoring: planned-in counts hardest, likely-in counts half, planned-out
    // subtracts heavily, likely-out subtracts lightly.
    const raw = plannedIn.length * 2 + likelyIn.length * 1 - plannedOut.length * 1.2 - likelyOut.length * 0.4
    const maxRaw = params.members.length * 2 // best case: everyone planned in
    const score = Math.round(Math.max(0, Math.min(100, (raw / Math.max(1, maxRaw)) * 100)))

    return {
      date: iso,
      score,
      plannedIn,
      plannedOut,
      likelyIn,
      likelyOut,
      reason: '',
      label: formatNB(date),
    }
  })

  // Filter: need at least 2 people trending towards office.
  const candidates = scored
    .filter((d) => d.plannedIn.length + d.likelyIn.length >= 2)
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))

  const top = candidates.slice(0, limit).map(annotate)

  return {
    suggestions: top,
    hasSignal: top.length > 0,
  }
}

function annotate(day: SuggestedDay): SuggestedDay {
  const reasonBits: string[] = []
  if (day.plannedIn.length >= 2) {
    reasonBits.push(`${day.plannedIn.length} har allerede planlagt kontor`)
  } else if (day.plannedIn.length === 1) {
    reasonBits.push(`${day.plannedIn[0]} er inne`)
  }
  if (day.likelyIn.length >= 2) {
    reasonBits.push(`${day.likelyIn.length} pleier å være inne på denne ukedagen`)
  }
  if (day.plannedOut.length > 0) {
    reasonBits.push(`${day.plannedOut.length} er borte`)
  }
  if (reasonBits.length === 0) {
    reasonBits.push('god dag for å møtes')
  }
  return { ...day, reason: reasonBits.join(' · ') }
}
