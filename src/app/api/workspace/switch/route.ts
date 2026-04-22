import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/supabase/session'

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

  const match = (data as Array<{ slug: string; org_id: string }> | null)
    ?.find((w) => w.slug === slug)
  if (!match) {
    return NextResponse.json({ error: 'Workspace not accessible' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true, slug, org_id: match.org_id })
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
