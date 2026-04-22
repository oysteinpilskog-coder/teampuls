import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { suggestCoordinationDays } from '@/lib/ai/suggest-days'
import type { Entry } from '@/lib/supabase/types'

/**
 * GET /api/ai/suggest-days
 *
 * Returns up to 3 suggested coordination days for the caller's org, based
 * on planned entries for the next 14 weekdays and each member's historical
 * pattern from the last 30 weekdays. Pure analytics server-side — no LLM
 * call — so the round-trip is fast and the answer is deterministic.
 */
export async function GET() {
  try {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Resolve the caller's member row.
    let { data: member } = await admin
      .from('members')
      .select('org_id, email')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!member && user.email) {
      const { data: byEmail } = await admin
        .from('members')
        .select('org_id, email')
        .ilike('email', user.email)
        .eq('is_active', true)
        .maybeSingle()
      member = byEmail ?? null
    }
    if (!member) {
      return NextResponse.json({ error: 'Ikke koblet til en org.' }, { status: 403 })
    }

    // Members for the org.
    const { data: members } = await admin
      .from('members')
      .select('id, display_name')
      .eq('org_id', member.org_id)
      .eq('is_active', true)

    if (!members?.length) {
      return NextResponse.json({ suggestions: [], hasSignal: false })
    }

    // Window: 30 weekdays back + 14 weekdays forward, padded to calendar dates
    // on either side so the ISO filter is inclusive without fencepost issues.
    const today = new Date()
    const windowStart = new Date(today)
    windowStart.setDate(windowStart.getDate() - 60)
    const windowEnd = new Date(today)
    windowEnd.setDate(windowEnd.getDate() + 30)

    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const { data: entries } = await admin
      .from('entries')
      .select('member_id, date, status, org_id, id, location_label, note, source, source_text, created_by, created_at, updated_at')
      .eq('org_id', member.org_id)
      .gte('date', iso(windowStart))
      .lte('date', iso(windowEnd))

    const result = suggestCoordinationDays({
      members,
      entries: (entries ?? []) as Entry[],
      today,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[ai/suggest-days] Error:', err)
    return NextResponse.json({ error: 'Kunne ikke hente forslag' }, { status: 500 })
  }
}
