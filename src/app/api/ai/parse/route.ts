import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseTeamUpdate } from '@/lib/ai/parse-update'
import { applyUpdates } from '@/lib/ai/apply-updates'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get sender's member record
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, org_id, email, display_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (memberError || !member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 403 })
    }

    const { text } = await req.json() as { text: string }
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    // Get all active members for this org (needed for name resolution)
    const { data: allMembers } = await supabase
      .from('members')
      .select('id, org_id, user_id, display_name, full_name, initials, email, avatar_url, nicknames, home_office_id, role, is_active, created_at, updated_at')
      .eq('org_id', member.org_id)
      .eq('is_active', true)

    if (!allMembers?.length) {
      return NextResponse.json({ error: 'No members found' }, { status: 500 })
    }

    // Get org timezone
    const { data: org } = await supabase
      .from('organizations')
      .select('timezone')
      .eq('id', member.org_id)
      .maybeSingle()

    const timezone = org?.timezone ?? 'Europe/Oslo'

    // Parse with Claude
    const result = await parseTeamUpdate({
      text: text.trim(),
      senderEmail: member.email,
      members: allMembers,
      today: new Date(),
      timezone,
    })

    // Log the request (best-effort, non-blocking)
    supabase
      .from('ai_messages')
      .insert({
        org_id: member.org_id,
        sender_member_id: member.id,
        source: 'web',
        input_text: text.trim(),
        ai_response: result,
        entries_created: result.confidence >= 0.7 ? result.updates.length : 0,
      })
      .then(() => {}) // intentionally not awaited

    // Low confidence → return clarification question, no DB writes
    if (result.confidence < 0.7 || (result.clarification && result.updates.length === 0)) {
      return NextResponse.json({
        success: false,
        clarification: result.clarification ?? 'Jeg forstod ikke helt. Kan du formulere deg annerledes?',
        updates: [],
      })
    }

    // Apply updates to the database
    await applyUpdates(supabase, member.org_id, result)

    return NextResponse.json({
      success: true,
      updates: result.updates,
      action: result.action,
      clarification: null,
    })
  } catch (err) {
    console.error('[ai/parse] Error:', err)
    return NextResponse.json(
      { error: 'Noe gikk galt. Prøv igjen.' },
      { status: 500 }
    )
  }
}
