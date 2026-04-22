import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseTeamUpdate } from '@/lib/ai/parse-update'
import { applyUpdates } from '@/lib/ai/apply-updates'

export async function POST(req: NextRequest) {
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

    // Resolve sender's member row.
    // Primary: by user_id (set once auth/callback links it).
    // Fallback: by email — handles users whose member row was created
    // after their last login, or whose link never fired. We backfill
    // user_id so the next request takes the fast path.
    let { data: member } = await admin
      .from('members')
      .select('id, org_id, email, display_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!member && user.email) {
      const { data: byEmail } = await admin
        .from('members')
        .select('id, org_id, email, display_name')
        .ilike('email', user.email)
        .eq('is_active', true)
        .maybeSingle()

      if (byEmail) {
        await admin
          .from('members')
          .update({ user_id: user.id })
          .eq('id', byEmail.id)
          .is('user_id', null)
        member = byEmail
      }
    }

    if (!member) {
      return NextResponse.json(
        { error: 'Din bruker er ikke koblet til et medlem. Kontakt en admin.' },
        { status: 403 }
      )
    }

    const { text } = await req.json() as { text: string }
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    // Get all active members for this org (needed for name resolution).
    // Scoped strictly to the authenticated user's org.
    const { data: allMembers } = await admin
      .from('members')
      .select('id, org_id, user_id, display_name, full_name, initials, email, avatar_url, nicknames, home_office_id, role, is_active, created_at, updated_at')
      .eq('org_id', member.org_id)
      .eq('is_active', true)

    if (!allMembers?.length) {
      return NextResponse.json(
        { error: 'Fant ingen aktive medlemmer i organisasjonen din.' },
        { status: 500 }
      )
    }

    // Get org timezone
    const { data: org } = await admin
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
        clarification: result.clarification ?? 'Jeg forstod ikke helt. Kan du formulere deg annerledes?',
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
      { error: 'Noe gikk galt. Prøv igjen.' },
      { status: 500 }
    )
  }
}
