import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveMember } from '@/lib/supabase/session'
import { parseTeamUpdate } from '@/lib/ai/parse-update'
import { applyUpdates } from '@/lib/ai/apply-updates'
import { getServerDict } from '@/lib/i18n/server'

/**
 * Confidence threshold below which we bail to a clarification question
 * rather than writing anything. Kept low on purpose — we prefer a written
 * entry with a "?" marker over a blank cell, because a visible AI guess
 * gives the user something to correct (and teaches the corrections loop).
 */
const CLARIFICATION_CEILING = 0.45

export async function POST(req: NextRequest) {
  const dict = await getServerDict()
  try {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const member = await resolveActiveMember(admin, user.id, user.email)

    if (!member) {
      return NextResponse.json(
        { error: dict.aiInput.notLinked },
        { status: 403 }
      )
    }

    const { text } = await req.json() as { text: string }
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    // Fetch AI context in parallel: members, customers, offices, org timezone,
    // and the 20 most recent corrections so the parser can few-shot from them.
    const [
      { data: allMembers },
      { data: allCustomers },
      { data: allOffices },
      { data: org },
      { data: recentCorrections },
    ] = await Promise.all([
      admin
        .from('members')
        .select('id, org_id, user_id, display_name, full_name, initials, email, avatar_url, nicknames, home_office_id, role, is_active, created_at, updated_at')
        .eq('org_id', member.org_id)
        .eq('is_active', true),
      admin
        .from('customers')
        .select('*')
        .eq('org_id', member.org_id),
      admin
        .from('offices')
        .select('*')
        .eq('org_id', member.org_id),
      admin
        .from('organizations')
        .select('timezone')
        .eq('id', member.org_id)
        .maybeSingle(),
      admin
        .from('ai_corrections')
        .select('input_text, ai_status, ai_location, corrected_status, corrected_location')
        .eq('org_id', member.org_id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (!allMembers?.length) {
      return NextResponse.json(
        { error: dict.aiInput.noActiveMembers },
        { status: 500 }
      )
    }

    const timezone = org?.timezone ?? 'Europe/Oslo'

    const result = await parseTeamUpdate({
      text: text.trim(),
      senderEmail: member.email,
      members: allMembers,
      customers: allCustomers ?? [],
      offices: allOffices ?? [],
      corrections: recentCorrections ?? [],
      today: new Date(),
      timezone,
    })

    // Log request (best-effort)
    admin
      .from('ai_messages')
      .insert({
        org_id: member.org_id,
        sender_member_id: member.id,
        source: 'web',
        input_text: text.trim(),
        ai_response: result,
        entries_created: result.confidence >= CLARIFICATION_CEILING ? result.updates.length : 0,
        confidence: result.confidence,
      })
      .then(() => {})

    // Really-uncertain → clarification only, no write.
    if (result.confidence < CLARIFICATION_CEILING || result.updates.length === 0) {
      return NextResponse.json({
        success: false,
        clarification: result.clarification ?? dict.aiInput.clarificationFallback,
        updates: [],
      })
    }

    // Everything else — including medium-confidence parses — gets written.
    // The UI renders a "?" marker for confidence < 0.7 so the user can tell
    // which cells to sanity-check.
    await applyUpdates(admin, member.org_id, result, {
      sourceText: text.trim(),
      source: 'ai_web',
    })

    return NextResponse.json({
      success: true,
      updates: result.updates,
      action: result.action,
      confidence: result.confidence,
      clarification: result.clarification,
    })
  } catch (err) {
    console.error('[ai/parse] Error:', err)
    return NextResponse.json(
      { error: dict.common.error },
      { status: 500 }
    )
  }
}
