import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveMember } from '@/lib/supabase/session'
import { parseTeamUpdate } from '@/lib/ai/parse-update'
import { applyUpdates } from '@/lib/ai/apply-updates'
import { getServerDict } from '@/lib/i18n/server'

export async function POST(req: NextRequest) {
  const dict = await getServerDict()
  try {
    // Auth-bound client: used ONLY to verify the caller's identity.
    // All subsequent org-scoped reads/writes use the admin client so RLS
    // can't hide other members of the caller's org from the AI context.
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Resolve sender's member row — scoped to the active workspace
    // when the user belongs to multiple (`tp_active_workspace`
    // cookie), with an email-based fallback for first login.
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

    // Get active members + customer registry + org timezone in parallel.
    // Scoped strictly to the authenticated user's org.
    const [
      { data: allMembers },
      { data: allCustomers },
      { data: org },
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
        .from('organizations')
        .select('timezone')
        .eq('id', member.org_id)
        .maybeSingle(),
    ])

    if (!allMembers?.length) {
      return NextResponse.json(
        { error: dict.aiInput.noActiveMembers },
        { status: 500 }
      )
    }

    const timezone = org?.timezone ?? 'Europe/Oslo'

    // Parse with Claude
    const result = await parseTeamUpdate({
      text: text.trim(),
      senderEmail: member.email,
      members: allMembers,
      customers: allCustomers ?? [],
      today: new Date(),
      timezone,
    })

    // Log the request (best-effort, non-blocking)
    admin
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
        clarification: result.clarification ?? dict.aiInput.clarificationFallback,
        updates: [],
      })
    }

    // Apply updates to the database (admin bypasses RLS so the user
    // can edit teammates' plans via the AI prompt).
    await applyUpdates(admin, member.org_id, result)

    return NextResponse.json({
      success: true,
      updates: result.updates,
      action: result.action,
      clarification: null,
    })
  } catch (err) {
    console.error('[ai/parse] Error:', err)
    return NextResponse.json(
      { error: dict.common.error },
      { status: 500 }
    )
  }
}
