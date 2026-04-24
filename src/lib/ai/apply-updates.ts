import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParseResult } from './parse-update'

export async function applyUpdates(
  supabase: SupabaseClient,
  orgId: string,
  result: ParseResult,
  opts: {
    /** Original user input — stored on entries so corrections can reference it. */
    sourceText?: string
    /** 'ai_web' (default) or 'ai_email'. */
    source?: 'ai_web' | 'ai_email'
  } = {},
): Promise<void> {
  const source = opts.source ?? 'ai_web'
  const sourceText = opts.sourceText ?? null

  // Delete original_period entries for "update" action
  if (result.action === 'update' && result.original_period) {
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('org_id', orgId)
      .eq('member_id', result.original_period.member_id)
      .in('date', result.original_period.dates)
    if (error) throw new Error(`applyUpdates delete(original_period) failed: ${error.message}`)
  }

  // Delete entries for "delete" action
  if (result.action === 'delete') {
    for (const update of result.updates) {
      const { error } = await supabase
        .from('entries')
        .delete()
        .eq('org_id', orgId)
        .eq('member_id', update.member_id)
        .in('date', update.dates)
      if (error) throw new Error(`applyUpdates delete failed: ${error.message}`)
    }
    return
  }

  // UPSERT for create/update actions. We persist confidence and source_text
  // so that:
  //   1. Low-confidence entries can be rendered with a "?" marker and still
  //      give the user something to correct (rather than dropping them).
  //   2. When a user later edits an AI-written cell, we can log the original
  //      phrasing into ai_corrections for future few-shot training.
  const rows = result.updates.flatMap(update =>
    update.dates.map(date => ({
      org_id: orgId,
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

  if (rows.length === 0) return

  // Throw on failure — callers wrap this in try/catch and surface a
  // user-visible error. Silent failure here (as it was pre-fix) meant a
  // missing enum value (e.g. 'event' before migration 013 ran) or a
  // missing column (confidence) would return success to the client and
  // show "Oppdatert" while writing nothing. Don't regress.
  const { error } = await supabase
    .from('entries')
    .upsert(rows, { onConflict: 'org_id,member_id,date' })
  if (error) throw new Error(`applyUpdates upsert failed: ${error.message}`)
}
