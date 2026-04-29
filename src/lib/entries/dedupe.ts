import type { Entry, Member } from '@/lib/supabase/types'

/**
 * Keep one Entry per (member_id, date) — the most recently updated wins.
 * Drops entries belonging to inactive members so counts stay aligned with
 * the current roster (a deactivated member must not still show up in tallies).
 *
 * Returns a flat array; callers build their own maps if they need lookup
 * (TodayView keys by member_id since it only sees one date; MonthView keys
 * by member_id_date for cross-day lookups).
 *
 * Shared by TodayView and MonthView so the «Akkurat nå»-oversikt og
 * Ukehorisontens oppsummering rapporterer eksakt samme tall.
 */
export function dedupeEntriesByMemberDate(
  entries: Entry[],
  members: Member[],
): Entry[] {
  const activeIds = new Set(members.map(m => m.id))
  const map = new Map<string, Entry>()
  for (const e of entries) {
    if (!activeIds.has(e.member_id)) continue
    const key = `${e.member_id}_${e.date}`
    const existing = map.get(key)
    if (
      !existing ||
      new Date(e.updated_at).getTime() > new Date(existing.updated_at).getTime()
    ) {
      map.set(key, e)
    }
  }
  return Array.from(map.values())
}
