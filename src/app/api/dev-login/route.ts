import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAllowedEmail } from '@/lib/auth/allowed-domains'

// Dev-only auto-login. Generates an OTP via the service-role admin
// client (no email is actually sent), then verifies it through the
// SSR client so the session cookies are written. Disabled outside
// development so it can never reach a real environment.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled in production' }, { status: 404 })
  }

  const { origin, searchParams } = new URL(request.url)
  const email = searchParams.get('email') ?? 'oystein@calwin.no'
  const next = searchParams.get('next') ?? '/'

  // Honour the CalWin-only access lock even in dev so this shortcut can't
  // mint a session the real login flow would reject.
  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: 'email domain not allowed' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (error || !data?.properties?.email_otp) {
    return NextResponse.json(
      { error: error?.message ?? 'no email_otp returned' },
      { status: 500 }
    )
  }

  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token: data.properties.email_otp,
    type: 'email',
  })

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) {
    await admin
      .from('members')
      .update({ user_id: user.id })
      .eq('email', user.email)
      .is('user_id', null)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
