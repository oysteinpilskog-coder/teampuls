import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkspaceSummary, MemberRole } from '@/lib/supabase/types'

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
 * Resolution strategy (defensive — survives missing RPC, missing
 * user_id link, fresh first-login, and pre-migration schemas):
 *   1. Query members by `user_id` directly (joined with org meta).
 *   2. If none, look up by email and backfill `user_id` (mirrors
 *      auth/callback/route.ts). This also handles the case where
 *      the user logged in before `user_id` was set in seed data.
 *   3. Active workspace = cookie slug match, else first by name.
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

  const cookieStore = await cookies()
  const requestedSlug = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null

  // 1. Lookup by user_id — joined to organizations. We use `*` on
  //    the org so the query survives even when migration 010 hasn't
  //    been applied yet (missing columns would otherwise error).
  //    Any post-010 field we need (accent_color, short_name,
  //    region, country_code, archived_at) is null-coalesced below.
  const SELECT = `
    id, org_id, display_name, role, avatar_url, user_id, email,
    organizations!inner (*)
  `

  type OrgPart = {
    id: string
    account_id?: string | null
    name: string
    slug: string
    short_name?: string | null
    region?: WorkspaceSummary['region'] | null
    country_code?: string | null
    accent_color?: string | null
    logo_url?: string | null
    archived_at?: string | null
  }
  type Row = {
    id: string
    org_id: string
    display_name: string
    role: MemberRole
    avatar_url: string | null
    user_id: string | null
    email: string
    organizations: OrgPart | OrgPart[]
  }
  const pickOrg = (r: Row): OrgPart =>
    Array.isArray(r.organizations) ? r.organizations[0] : r.organizations

  let { data: rawRows } = await supabase
    .from('members')
    .select(SELECT)
    .eq('user_id', user.id)
    .eq('is_active', true)

  let rows = (rawRows ?? []) as Row[]

  // 2. First-login / unlinked fallback: find rows by email and
  //    backfill user_id. Uses the service-role client so RLS
  //    doesn't hide un-linked rows (they have user_id IS NULL,
  //    which the caller's JWT can't see).
  if (rows.length === 0 && user.email) {
    const admin = createAdminClient()
    const { data: byEmail } = await admin
      .from('members')
      .select(SELECT)
      .ilike('email', user.email)
      .eq('is_active', true)

    const emailRows = (byEmail ?? []) as Row[]
    if (emailRows.length > 0) {
      const idsToLink = emailRows
        .filter((r) => r.user_id == null)
        .map((r) => r.id)
      if (idsToLink.length > 0) {
        await admin
          .from('members')
          .update({ user_id: user.id })
          .in('id', idsToLink)
      }
      // Re-query through the user-scoped client so RLS continues
      // to gate everything downstream; now that user_id is linked
      // the original query should pick them up.
      const { data: relinked } = await supabase
        .from('members')
        .select(SELECT)
        .eq('user_id', user.id)
        .eq('is_active', true)
      rawRows = relinked
      rows = (relinked ?? []) as Row[]
    }
  }

  if (rows.length === 0) {
    return {
      user,
      member: null,
      workspaces: [] as WorkspaceSummary[],
      activeWorkspace: null,
    }
  }

  const workspaces: WorkspaceSummary[] = rows
    .map((r) => {
      const o = pickOrg(r)
      if (!o || o.archived_at) return null
      return {
        org_id: o.id,
        account_id: o.account_id ?? null,
        name: o.name,
        slug: o.slug,
        short_name: o.short_name,
        region: (o.region ?? 'eu') as WorkspaceSummary['region'],
        country_code: o.country_code,
        accent_color: o.accent_color,
        logo_url: o.logo_url,
        role: r.role,
      }
    })
    .filter((w): w is WorkspaceSummary => w !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  if (workspaces.length === 0) {
    return {
      user,
      member: null,
      workspaces,
      activeWorkspace: null,
    }
  }

  const activeWorkspace =
    (requestedSlug && workspaces.find((w) => w.slug === requestedSlug)) ||
    workspaces[0]

  const activeRow = rows.find((r) => r.org_id === activeWorkspace.org_id) ?? rows[0]
  const member = {
    id: activeRow.id,
    org_id: activeRow.org_id,
    display_name: activeRow.display_name,
    role: activeRow.role,
    avatar_url: activeRow.avatar_url,
  }

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
