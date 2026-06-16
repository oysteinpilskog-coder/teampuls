import { NextRequest, NextResponse } from 'next/server'
import { getSessionMember } from '@/lib/supabase/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAllowedEmail } from '@/lib/auth/allowed-domains'

/**
 * POST /api/admin/invite
 * Body: { email: string }
 *
 * Creates the Supabase auth user for an already-seeded member so they
 * can log in. Members are added to the `members` table directly (SQL),
 * but no `auth.users` row is created — so a brand-new employee's first
 * `signInWithOtp` only works if the project allows self-sign-up. When
 * that's off (or the built-in email rate limit is hit), they never get
 * a code. Creating the auth user here with the service-role client
 * bypasses the sign-up setting entirely; the member can then request a
 * code normally (existing users are never blocked) and the auth
 * callback links `members.user_id` on first login.
 *
 * Gated to admins of an actual workspace (viewer-mode is rejected).
 */
export async function POST(req: NextRequest) {
  const { user, member, isViewerMode } = await getSessionMember()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!member || isViewerMode || member.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { email?: string } | null
  const email = body?.email?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }
  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: 'Email domain not allowed' }, { status: 400 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }
  const admin = createAdminClient()

  // Only create auth users for people who are already seeded members —
  // this endpoint provisions login for known staff, not arbitrary signups.
  const { data: memberRows, error: lookupError } = await admin
    .from('members')
    .select('id, user_id')
    .ilike('email', email)
    .eq('is_active', true)
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }
  if (!memberRows || memberRows.length === 0) {
    return NextResponse.json(
      { error: 'No active member found with that email — add them as a member first.' },
      { status: 404 }
    )
  }

  // Create the auth user. email_confirm:true marks the address verified
  // so the member can sign in via OTP immediately without a separate
  // confirmation step.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  })

  if (createError) {
    // Already registered — nothing to do, the user can already log in.
    const code = (createError as { code?: string }).code ?? ''
    const msg = createError.message.toLowerCase()
    if (code === 'email_exists' || msg.includes('already been registered') || msg.includes('already exists')) {
      return NextResponse.json({ ok: true, status: 'already_existed', email })
    }
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  // Link the freshly-created auth user to the member row(s) so they're
  // connected before first login (the auth callback would do this too,
  // but doing it here keeps the data consistent immediately).
  const newUserId = created.user?.id
  if (newUserId) {
    const unlinkedIds = memberRows.filter((m) => m.user_id == null).map((m) => m.id)
    if (unlinkedIds.length > 0) {
      await admin.from('members').update({ user_id: newUserId }).in('id', unlinkedIds)
    }
  }

  return NextResponse.json({ ok: true, status: 'created', email })
}
