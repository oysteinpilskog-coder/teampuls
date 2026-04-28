import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_WORKSPACE_COOKIE, COMBINED_WORKSPACE_SLUG } from '@/lib/supabase/session'

/**
 * POST /api/workspace/switch
 * Body: { slug: string }
 *
 * Sets the `tp_active_workspace` cookie after verifying the caller
 * actually has a membership in the requested workspace. The cookie
 * is httpOnly + SameSite=Lax so it survives top-level navigations
 * but is not readable by client JS.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { slug?: string } | null
  const slug = body?.slug?.trim()
  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
  }

  // Verify membership via RPC — the RPC itself uses `auth.uid()`
  // so RLS + the SECURITY DEFINER function guarantee the user can
  // only switch into workspaces they actually belong to.
  const { data, error } = await supabase.rpc('current_user_workspaces')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const accessible = (data as Array<{ slug: string; org_id: string; account_id: string | null }> | null) ?? []

  // Combined "Alle CalWin"-mode is allowed when the user has ≥2
  // workspaces under the same account. We don't add a pseudo-row to
  // the RPC for this — the cookie value is the only signal needed.
  let resolvedOrgId: string | null = null
  if (slug === COMBINED_WORKSPACE_SLUG) {
    const accountIds = new Set(accessible.map((w) => w.account_id).filter((x): x is string => !!x))
    if (accountIds.size !== 1 || accessible.length < 2) {
      return NextResponse.json({ error: 'Combined view not available' }, { status: 403 })
    }
  } else {
    const match = accessible.find((w) => w.slug === slug)
    if (!match) {
      return NextResponse.json({ error: 'Workspace not accessible' }, { status: 403 })
    }
    resolvedOrgId = match.org_id
  }

  const res = NextResponse.json({ ok: true, slug, org_id: resolvedOrgId })
  res.cookies.set({
    name: ACTIVE_WORKSPACE_COOKIE,
    value: slug,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })
  return res
}
