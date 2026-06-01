import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedEmail } from '@/lib/auth/allowed-domains'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  // /offline is the SW fallback shell — must render for unauthenticated
  // clients too (it's what shows when there's no network at all, before
  // Supabase can even attempt session recovery).
  // /opengraph-image and /twitter-image must be reachable by social-media
  // crawlers (Slack, Teams, X, LinkedIn) which are never logged in.
  // /api/email-inbound is the CloudMailin webhook — it authenticates with a
  // shared token, not a session, so it must bypass the session redirect.
  const isPublicRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname === '/offline' ||
    pathname === '/opengraph-image' ||
    pathname === '/twitter-image' ||
    pathname === '/api/email-inbound' ||
    (process.env.NODE_ENV !== 'production' && pathname === '/api/dev-login')

  // Access lock: TeamPulse is CalWin-only for now. A valid session whose
  // email is outside the allowlist is revoked here and bounced to /login.
  // This is the first of several layers (auth/callback + getSessionMember
  // also enforce it) so no single bypass grants access.
  if (user && !isAllowedEmail(user.email)) {
    await supabase.auth.signOut()
    if (pathname.startsWith('/login')) {
      // Already on login — just let the cleared-cookie response through so
      // we don't loop. signOut() rewrote cookies onto supabaseResponse.
      return supabaseResponse
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('error', 'domain_not_allowed')
    const redirect = NextResponse.redirect(url)
    // Carry the cleared auth cookies onto the redirect so the browser
    // actually drops the revoked session.
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
