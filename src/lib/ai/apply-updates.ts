import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParseResult } from './parse-update'

export async function applyUpdates(
  supabase: SupabaseClient,
  orgId: string,
  result: ParseResult
): Promise<void> {
  // Delete original_period entries for "update" action
  if (result.action === 'update' && result.original_period) {
    await supabase
      .from('entries')
      .delete()
      .eq('org_id', orgId)
      .eq('member_id', result.original_period.member_id)
      .in('date', result.original_period.dates)
  }

  // Delete entries for "delete" action
  if (result.action === 'delete') {
    for (const update of result.updates) {
      await supabase
        .from('entries')
        .delete()
        .eq('org_id', orgId)
        .eq('member_id', update.member_id)
        .in('date', update.dates)
    }
    return
  }

  // UPSERT for create/update actions
  const rows = result.updates.flatMap(update =>
    update.dates.map(date => ({
      org_id: orgId,
      member_id: update.member_id,
      date,
      status: update.status!,
      location_label: update.location ?? null,
      note: update.note ?? null,
      source: 'ai_web' as const,
    }))
  )

  if (rows.length === 0) return

  await supabase
    .from('entries')
    .upsert(rows, { onConflict: 'org_id,member_id,date' })
}
