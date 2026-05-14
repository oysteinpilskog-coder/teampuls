import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParseResult } from './parse-update'
import type { Entry, Visit } from '@/lib/supabase/types'

/**
 * What we actually wrote during applyUpdates. Returned so the caller can
 * forward the rows to the client for an optimistic same-frame paint —
 * cuts the perceived latency of a parsed entry from "wait for realtime"
 * to "appears the moment the AI returns".
 */
export type ApplyUpdatesResult = {
  upsertedEntries: Entry[]
  deletedEntryIds: string[]
  insertedVisit: Visit | null
}

export async function applyUpdates(
  supabase: SupabaseClient,
  orgId: string,
  result: ParseResult,
  opts: {
    /** Original user input — stored on entries so corrections can reference it. */
    sourceText?: string
    /** 'ai_web' (default) or 'ai_email'. */
    source?: 'ai_web' | 'ai_email'
    /**
     * Optional per-member org override for combined «Alle CalWin»-mode:
     * each parsed member lives in its own workspace, so writes must use
     * the member's actual org_id rather than the single fallback. Falls
     * back to `orgId` when a member isn't in the map.
     */
    memberOrgIds?: Map<string, string>
  } = {},
): Promise<ApplyUpdatesResult> {
  const source = opts.source ?? 'ai_web'
  const sourceText = opts.sourceText ?? null
  const orgOf = (memberId: string) => opts.memberOrgIds?.get(memberId) ?? orgId
  const upsertedEntries: Entry[] = []
  const deletedEntryIds: string[] = []
  let insertedVisit: Visit | null = null

  // Velkomst-besøk: AI returnerer `visit` kun når meldingen inneholder
  // et eksplisitt klokkeslett. INSERT (ikke upsert) — to forskjellige
  // besøk samme dag/host skal kunne sameksistere; det er ikke en
  // unique key her. delete-action har ingen visit-versjon foreløpig.
  if (result.visit && result.action !== 'delete') {
    const v = result.visit
    const { data, error } = await supabase
      .from('visits')
      .insert({
        org_id: orgOf(v.host_member_id),
        host_member_id: v.host_member_id,
        visitor_name: v.visitor_name,
        visitor_company: v.visitor_company,
        date: v.date,
        start_time: v.start_time,
        end_time: v.end_time,
        note: v.note,
        source,
        source_text: sourceText,
        confidence: result.confidence,
      })
      .select()
      .single()
    if (error) throw new Error(`applyUpdates visit insert failed: ${error.message}`)
    insertedVisit = data as Visit
  }

  // Delete original_period entries for "update" action
  if (result.action === 'update' && result.original_period) {
    const { data, error } = await supabase
      .from('entries')
      .delete()
      .eq('org_id', orgOf(result.original_period.member_id))
      .eq('member_id', result.original_period.member_id)
      .in('date', result.original_period.dates)
      .select('id')
    if (error) throw new Error(`applyUpdates delete(original_period) failed: ${error.message}`)
    for (const row of data ?? []) deletedEntryIds.push((row as { id: string }).id)
  }

  // Delete entries for "delete" action
  if (result.action === 'delete') {
    for (const update of result.updates) {
      const { data, error } = await supabase
        .from('entries')
        .delete()
        .eq('org_id', orgOf(update.member_id))
        .eq('member_id', update.member_id)
        .in('date', update.dates)
        .select('id')
      if (error) throw new Error(`applyUpdates delete failed: ${error.message}`)
      for (const row of data ?? []) deletedEntryIds.push((row as { id: string }).id)
    }
    return { upsertedEntries, deletedEntryIds, insertedVisit }
  }

  // UPSERT for create/update actions. We persist confidence and source_text
  // so that:
  //   1. Low-confidence entries can be rendered with a "?" marker and still
  //      give the user something to correct (rather than dropping them).
  //   2. When a user later edits an AI-written cell, we can log the original
  //      phrasing into ai_corrections for future few-shot training.
  const rows = result.updates.flatMap(update =>
    update.dates.map(date => ({
      org_id: orgOf(update.member_id),
      member_id: update.member_id,
      date,
      status: update.status!,
      location_label: update.location ?? null,
      note: update.note ?? null,
      source,
      source_text: sourceText,
      confidence: result.confidence,
    }))
  )

  if (rows.length === 0) return { upsertedEntries, deletedEntryIds, insertedVisit }

  // Throw on failure — callers wrap this in try/catch and surface a
  // user-visible error. Silent failure here (as it was pre-fix) meant a
  // missing enum value (e.g. 'event' before migration 013 ran) or a
  // missing column (confidence) would return success to the client and
  // show "Oppdatert" while writing nothing. Don't regress.
  const { data: upserted, error } = await supabase
    .from('entries')
    .upsert(rows, { onConflict: 'org_id,member_id,date' })
    .select()
  if (error) throw new Error(`applyUpdates upsert failed: ${error.message}`)
  for (const row of upserted ?? []) upsertedEntries.push(row as Entry)
  return { upsertedEntries, deletedEntryIds, insertedVisit }
}
