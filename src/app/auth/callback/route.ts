import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAllowedEmail } from '@/lib/auth/allowed-domains'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Access lock: TeamPulse is CalWin-only. If the verified email is
      // outside the allowlist, revoke the freshly-minted session and bounce
      // back to login — never link a member or hand out a usable session.
      const { data: { user: verified } } = await supabase.auth.getUser()
      if (!isAllowedEmail(verified?.email)) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=domain_not_allowed`)
      }

      // Auto-link: if this user's email matches a member record with no
      // user_id yet, set it now so the member is immediately connected on
      // first login. Must use the service-role client — the anon/SSR client
      // is RLS-bound, and an unlinked row (user_id IS NULL) matches neither
      // members_update_self nor the admin policy for a not-yet-linked user,
      // so the update would silently affect 0 rows.
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        await createAdminClient()
          .from('members')
          .update({ user_id: user.id })
          .ilike('email', user.email)
          .is('user_id', null)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
