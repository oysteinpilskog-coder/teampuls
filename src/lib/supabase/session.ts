import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkspaceSummary } from '@/lib/supabase/types'

/** Cookie name holding the active workspace slug. */
export const ACTIVE_WORKSPACE_COOKIE = 'tp_active_workspace'

/**
 * Resolve the signed-in user, their full list of workspace
 * memberships, and the currently active workspace (driven by the
 * `tp_active_workspace` cookie, with fallbacks).
 *
 * The returned `member` is the membership row *inside the active
 * workspace* — so existing callers that read `member.org_id`
 * continue to work and automatically scope to the switched
 * workspace.
 *
 * Deduplicated with React.cache so repeated calls inside a single
 * RSC render (layout + page + components) only hit Supabase once.
 */
export const getSessionMember = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      user: null,
      member: null,
      workspaces: [] as WorkspaceSummary[],
      activeWorkspace: null as WorkspaceSummary | null,
    }
  }

  const [{ data: workspacesData }, cookieStore] = await Promise.all([
    supabase.rpc('current_user_workspaces'),
    cookies(),
  ])

  const workspaces = (workspacesData ?? []) as WorkspaceSummary[]

  if (workspaces.length === 0) {
    return {
      user,
      member: null,
      workspaces,
      activeWorkspace: null,
    }
  }

  const requestedSlug = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value
  const activeWorkspace =
    (requestedSlug && workspaces.find((w) => w.slug === requestedSlug)) ||
    workspaces[0]

  const { data: member } = await supabase
    .from('members')
    .select('id, org_id, display_name, role, avatar_url')
    .eq('user_id', user.id)
    .eq('org_id', activeWorkspace.org_id)
    .eq('is_active', true)
    .maybeSingle()

  return { user, member, workspaces, activeWorkspace }
})

/**
 * Resolve the caller's active member row for an API route running
 * under an admin / service-role client. Used by AI endpoints that
 * bypass RLS but still need to scope to the caller's workspace.
 *
 * Order of precedence:
 *   1. (user_id, active-workspace cookie slug) — happy path
 *   2. (user_id, first membership) — cookie missing / invalid
 *   3. (email, first membership) + backfill user_id — first login
 */
export async function resolveActiveMember<T extends SupabaseClient>(
  admin: T,
  userId: string,
  userEmail: string | null | undefined,
): Promise<{ id: string; org_id: string; email: string; display_name: string } | null> {
  const cookieStore = await cookies()
  const requestedSlug = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null

  // 1 & 2: lookup by user_id.
  const { data: byUser } = await admin
    .from('members')
    .select('id, org_id, email, display_name, organizations!inner(slug)')
    .eq('user_id', userId)
    .eq('is_active', true)

  type Row = {
    id: string
    org_id: string
    email: string
    display_name: string
    organizations: { slug: string } | { slug: string }[]
  }
  const rows = (byUser ?? []) as Row[]
  if (rows.length > 0) {
    const slugOf = (r: Row) =>
      Array.isArray(r.organizations) ? r.organizations[0]?.slug : r.organizations?.slug
    const match = requestedSlug ? rows.find((r) => slugOf(r) === requestedSlug) : undefined
    const picked = match ?? rows[0]
    return {
      id: picked.id,
      org_id: picked.org_id,
      email: picked.email,
      display_name: picked.display_name,
    }
  }

  // 3: first-login fallback by email. The unique index is
  // (org_id, email) so multiple rows may exist across workspaces;
  // prefer the one matching the cookie, else the first by name.
  if (!userEmail) return null

  const { data: byEmail } = await admin
    .from('members')
    .select('id, org_id, email, display_name, organizations!inner(slug, name)')
    .ilike('email', userEmail)
    .eq('is_active', true)
    .is('user_id', null)
    .order('org_id', { ascending: true })

  type Row2 = {
    id: string
    org_id: string
    email: string
    display_name: string
    organizations: { slug: string; name: string } | { slug: string; name: string }[]
  }
  const emailRows = (byEmail ?? []) as Row2[]
  if (emailRows.length === 0) return null

  const slugOf2 = (r: Row2) =>
    Array.isArray(r.organizations) ? r.organizations[0]?.slug : r.organizations?.slug
  const picked = (requestedSlug && emailRows.find((r) => slugOf2(r) === requestedSlug)) || emailRows[0]

  // Best-effort: backfill user_id so the next request takes the
  // fast path. Non-fatal if the update races.
  await admin
    .from('members')
    .update({ user_id: userId })
    .eq('id', picked.id)
    .is('user_id', null)

  return {
    id: picked.id,
    org_id: picked.org_id,
    email: picked.email,
    display_name: picked.display_name,
  }
}
