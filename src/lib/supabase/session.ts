import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAllowedEmail } from '@/lib/auth/allowed-domains'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkspaceSummary, WorkspaceRole, MemberRole } from '@/lib/supabase/types'

/** Cookie name holding the active workspace slug. */
export const ACTIVE_WORKSPACE_COOKIE = 'tp_active_workspace'

/**
 * Special slug meaning "all workspaces under my account" — used by the
 * combined CalWin Group view so a single Oversikt can show Nordic + UK
 * members side-by-side. The switch route accepts it; resolveSession()
 * fans it out into a `combinedScope.orgIds` list.
 */
export const COMBINED_WORKSPACE_SLUG = '__all__'

export interface CombinedScope {
  /** All workspaces involved share this account (we require it). */
  account_id: string
  /** Org ids to feed an `in('org_id', …)` query. */
  org_ids: string[]
}

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
  try {
    return await resolveSession()
  } catch (err) {
    console.error('[session] resolveSession threw:', err)
    return {
      user: null,
      member: null,
      workspaces: [] as WorkspaceSummary[],
      activeWorkspace: null as WorkspaceSummary | null,
      combinedScope: null as CombinedScope | null,
      isViewerMode: false,
    }
  }
})

async function resolveSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Access lock: a session outside the CalWin allowlist is treated as
  // logged-out everywhere downstream (the proxy normally signs these out
  // first; this is the defence-in-depth backstop for any path that skips it).
  if (!user || !isAllowedEmail(user.email)) {
    return {
      user: null,
      member: null,
      workspaces: [] as WorkspaceSummary[],
      activeWorkspace: null as WorkspaceSummary | null,
      combinedScope: null as CombinedScope | null,
      isViewerMode: false,
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
    id, org_id, display_name, full_name, initials, role, avatar_url, user_id, email,
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
    status_colors?: Record<string, string> | null
    /** Pre-migration-030 orgs won't have these in the row payload —
     *  fall back to the canonical CalWin BrandBook pair downstream. */
    brand_primary?: string | null
    brand_accent?: string | null
    /** Pre-migration-033 orgs won't have these — fall back to the
     *  hardcoded defaults ('nordic' / 'standard') downstream. */
    default_theme_variant?: string | null
    default_dashboard_mode?: string | null
  }
  type Row = {
    id: string
    org_id: string
    display_name: string
    full_name: string | null
    initials: string | null
    role: MemberRole
    avatar_url: string | null
    user_id: string | null
    email: string
    organizations: OrgPart | OrgPart[]
  }
  const pickOrg = (r: Row): OrgPart =>
    Array.isArray(r.organizations) ? r.organizations[0] : r.organizations

  // Try the joined query first; fall back to separate queries if
  // the join fails (e.g. `!inner` + RLS quirks, or if the
  // organizations table is in a shape Supabase can't resolve the
  // FK for at runtime).
  let rows: Row[] = []
  try {
    const { data, error } = await supabase
      .from('members')
      .select(SELECT)
      .eq('user_id', user.id)
      .eq('is_active', true)
    if (error) {
      console.error('[session] members+org join failed:', error.message)
    } else {
      rows = (data ?? []) as Row[]
    }
  } catch (err) {
    console.error('[session] members+org join threw:', err)
  }

  // 2. First-login / unlinked fallback: find rows by email and
  //    backfill user_id. Uses the service-role client so RLS
  //    doesn't hide un-linked rows (they have user_id IS NULL,
  //    which the caller's JWT can't see). Silently no-ops if the
  //    service-role key isn't configured in this environment.
  if (rows.length === 0 && user.email) {
    try {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
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
          rows = (relinked ?? []) as Row[]
        }
      }
    } catch (err) {
      console.error('[session] email-fallback failed:', err)
    }
  }

  // 3. Last-resort fallback: fetch members (by user_id) and
  //    organizations separately. This survives any RLS quirk with
  //    the `!inner` join (a member with a readable org that the
  //    join still can't resolve at runtime).
  if (rows.length === 0) {
    try {
      const { data: memberRows } = await supabase
        .from('members')
        .select('id, org_id, display_name, full_name, initials, role, avatar_url, user_id, email')
        .eq('user_id', user.id)
        .eq('is_active', true)

      const mems = (memberRows ?? []) as Array<{
        id: string; org_id: string; display_name: string; full_name: string | null;
        initials: string | null; role: MemberRole;
        avatar_url: string | null; user_id: string | null; email: string
      }>

      if (mems.length > 0) {
        const orgIds = Array.from(new Set(mems.map((m) => m.org_id)))
        const { data: orgRows } = await supabase
          .from('organizations')
          .select('*')
          .in('id', orgIds)
        const orgsById = new Map<string, OrgPart>()
        for (const o of (orgRows ?? []) as OrgPart[]) {
          orgsById.set(o.id, o)
        }
        rows = mems
          .map((m) => {
            const o = orgsById.get(m.org_id)
            if (!o) return null
            return { ...m, organizations: o } as Row
          })
          .filter((r): r is Row => r !== null)
      }
    } catch (err) {
      console.error('[session] split-query fallback failed:', err)
    }
  }

  if (rows.length === 0) {
    return {
      user,
      member: null,
      workspaces: [] as WorkspaceSummary[],
      activeWorkspace: null,
      combinedScope: null as CombinedScope | null,
      isViewerMode: false,
    }
  }

  // Account-wide workspace list via current_user_workspaces() RPC.
  // Returns one row per workspace under the caller's account(s), with
  // role='viewer' for workspaces the caller can read but has no
  // membership in (migration 036). Falls back to building the list
  // from the caller's own membership rows if the RPC is unavailable
  // — preserves pre-036 behaviour (no viewer rows, but the user can
  // still see + switch their own workspaces).
  type WorkspaceRow = {
    org_id: string
    account_id: string | null
    name: string
    slug: string
    short_name: string | null
    region: string | null
    country_code: string | null
    accent_color: string | null
    logo_url: string | null
    role: WorkspaceRole
    brand_primary: string | null
    brand_accent: string | null
  }
  let workspaceRows: WorkspaceRow[] = []
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('current_user_workspaces')
    if (rpcErr) {
      console.error('[session] current_user_workspaces RPC failed:', rpcErr.message)
    } else {
      workspaceRows = (rpcData ?? []) as WorkspaceRow[]
    }
  } catch (err) {
    console.error('[session] current_user_workspaces RPC threw:', err)
  }

  if (workspaceRows.length === 0) {
    workspaceRows = rows
      .map((r): WorkspaceRow | null => {
        const o = pickOrg(r)
        if (!o || o.archived_at) return null
        return {
          org_id: o.id,
          account_id: o.account_id ?? null,
          name: o.name,
          slug: o.slug,
          short_name: o.short_name ?? null,
          region: o.region ?? 'eu',
          country_code: o.country_code ?? null,
          accent_color: o.accent_color ?? null,
          logo_url: o.logo_url ?? null,
          role: r.role,
          brand_primary: o.brand_primary ?? null,
          brand_accent: o.brand_accent ?? null,
        }
      })
      .filter((w): w is WorkspaceRow => w !== null)
  }

  // status_colors isn't returned by the RPC — fold it in from the
  // joined org meta on rows[] where we have it (the user's own
  // memberships). Viewer-only workspaces fall back to the default
  // palette via getOrgStatusColors().
  const orgMetaById = new Map<string, OrgPart>()
  for (const r of rows) {
    const o = pickOrg(r)
    if (o?.id) orgMetaById.set(o.id, o)
  }

  const workspaces: WorkspaceSummary[] = workspaceRows
    .map((w): WorkspaceSummary => ({
      org_id: w.org_id,
      account_id: w.account_id,
      name: w.name,
      slug: w.slug,
      short_name: w.short_name,
      region: ((w.region ?? 'eu') as WorkspaceSummary['region']),
      country_code: w.country_code,
      accent_color: w.accent_color,
      logo_url: w.logo_url,
      role: w.role,
      status_colors: orgMetaById.get(w.org_id)?.status_colors ?? null,
      brand_primary: w.brand_primary ?? '#322E7A',
      brand_accent: w.brand_accent ?? '#66C4EF',
      default_theme_variant: orgMetaById.get(w.org_id)?.default_theme_variant ?? 'nordic',
      default_dashboard_mode:
        orgMetaById.get(w.org_id)?.default_dashboard_mode === 'brand' ? 'brand' : 'standard',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (workspaces.length === 0) {
    return {
      user,
      member: null,
      workspaces,
      activeWorkspace: null,
      combinedScope: null as CombinedScope | null,
      isViewerMode: false,
    }
  }

  // Combined "Alle CalWin"-mode: cookie carries the sentinel slug and
  // the user has ≥2 workspaces sharing the same account. We synthesize
  // an activeWorkspace so the header pill renders, and emit a
  // combinedScope downstream for IN-queries.
  const accountIds = new Set(workspaces.map((w) => w.account_id).filter((x): x is string => !!x))
  const sharesAccount = accountIds.size === 1 && workspaces.length >= 2

  if (requestedSlug === COMBINED_WORKSPACE_SLUG && sharesAccount) {
    const accountId = [...accountIds][0]
    const orgIds = workspaces.map((w) => w.org_id)

    // member used for write-paths (AI input) — pick the highest-privileged
    // row we have, preferring an admin membership. Falls back to first row.
    const adminRow = rows.find((r) => r.role === 'admin') ?? rows[0]
    const member = {
      id: adminRow.id,
      org_id: adminRow.org_id,
      display_name: adminRow.display_name,
      full_name: adminRow.full_name,
      initials: adminRow.initials,
      role: adminRow.role,
      avatar_url: adminRow.avatar_url,
    }

    const synthetic: WorkspaceSummary = {
      org_id: '__combined__',
      account_id: accountId,
      name: 'Alle',
      slug: COMBINED_WORKSPACE_SLUG,
      short_name: 'ALL',
      region: workspaces[0].region,
      country_code: null,
      // CalWin --dusk: mid Blue Violet. Readable in both light/dark,
      // distinct from Light Blue (primary accent) and deep Blue Violet
      // (canvas) so the combined-view UI reads as its own surface
      // rather than impersonating one of the active workspace brands.
      accent_color: '#4A4595',
      logo_url: null,
      role: adminRow.role,
      // Combined view falls back to default status palette — see
      // getOrgStatusColors() for the rationale (avoid favouring one
      // workspace's overrides when the combined surface spans many).
      status_colors: null,
      // Combined view defaults to the canonical CalWin BrandBook pair.
      // Per-org brand colors only apply when a specific workspace is active.
      brand_primary: '#322E7A',
      brand_accent: '#66C4EF',
      // Combined view falls back to the hardcoded defaults — a per-org
      // theme default only applies when a specific workspace is active.
      default_theme_variant: 'nordic',
      default_dashboard_mode: 'standard',
    }

    return {
      user,
      member,
      workspaces,
      activeWorkspace: synthetic,
      combinedScope: { account_id: accountId, org_ids: orgIds } satisfies CombinedScope,
      isViewerMode: false,
    }
  }

  // Cookie wins when valid. Otherwise prefer the first workspace the
  // user is an actual member of — alphabetical fallback would land
  // James (UK-only) in viewer-mode on CalWin Nordic on first login,
  // since the RPC now returns viewer rows too. Real membership beats
  // alphabetical sort.
  const activeWorkspace =
    (requestedSlug && workspaces.find((w) => w.slug === requestedSlug)) ||
    workspaces.find((w) => w.role !== 'viewer') ||
    workspaces[0]

  // Viewer-mode: the cookie points to a workspace the user can read
  // (account-wide visibility) but has no membership row in. Keep the
  // user's primary-row identity so display_name/avatar render, but
  // set `member.org_id` to follow the active workspace so reads scope
  // correctly downstream, and flip `role` to 'viewer' so UI surfaces
  // (AI input, settings, registration) gate themselves. `member.id`
  // is the primary row id — never used as a write key in viewer-mode
  // (server routes re-check membership and 403).
  const activeRow = rows.find((r) => r.org_id === activeWorkspace.org_id)
  const isViewerMode = !activeRow
  const identityRow = activeRow ?? rows.find((r) => r.role === 'admin') ?? rows[0]
  const member = {
    id: identityRow.id,
    org_id: activeWorkspace.org_id,
    display_name: identityRow.display_name,
    full_name: identityRow.full_name,
    initials: identityRow.initials,
    role: (isViewerMode ? 'viewer' : identityRow.role) as WorkspaceRole,
    avatar_url: identityRow.avatar_url,
  }

  return {
    user,
    member,
    workspaces,
    activeWorkspace,
    combinedScope: null as CombinedScope | null,
    isViewerMode,
  }
}

/**
 * Resolve the caller's active member row for an API route running
 * under an admin / service-role client. Used by AI endpoints that
 * bypass RLS but still need to scope to the caller's workspace.
 *
 * Order of precedence:
 *   1. (user_id, active-workspace cookie slug) — happy path
 *   2. (user_id, first membership) — cookie missing / invalid
 *   3. (email, first membership) + backfill user_id — first login
 *
 * `combined_org_ids` is non-null only when the cookie carries the
 * `__all__` sentinel AND the caller has ≥2 memberships under the
 * same account. Callers that support combined view (e.g. AI parse)
 * use it to fan IN-queries across all involved workspaces.
 */
export async function resolveActiveMember<T extends SupabaseClient>(
  admin: T,
  userId: string,
  userEmail: string | null | undefined,
): Promise<
  | (
      | { id: string; org_id: string; email: string; display_name: string; role: MemberRole }
    ) & { combined_org_ids: string[] | null }
  | null
> {
  const cookieStore = await cookies()
  const requestedSlug = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null

  // 1 & 2: lookup by user_id.
  const { data: byUser } = await admin
    .from('members')
    .select('id, org_id, email, display_name, role, organizations!inner(slug, account_id)')
    .eq('user_id', userId)
    .eq('is_active', true)

  type Row = {
    id: string
    org_id: string
    email: string
    display_name: string
    role: MemberRole
    organizations: { slug: string; account_id: string | null } | { slug: string; account_id: string | null }[]
  }
  const rows = (byUser ?? []) as Row[]
  if (rows.length > 0) {
    const slugOf = (r: Row) =>
      Array.isArray(r.organizations) ? r.organizations[0]?.slug : r.organizations?.slug
    const accountOf = (r: Row) =>
      Array.isArray(r.organizations) ? r.organizations[0]?.account_id : r.organizations?.account_id

    // Combined "Alle CalWin"-mode: same rules as resolveSession() — cookie
    // carries the sentinel and caller has ≥2 memberships sharing an account.
    // We synthesize the active member from the highest-privileged row (admin
    // preferred) so writes resolve through someone with permission, then
    // hand back every involved org so the caller can fan queries out.
    if (requestedSlug === COMBINED_WORKSPACE_SLUG) {
      const accountIds = new Set(rows.map(accountOf).filter((x): x is string => !!x))
      if (accountIds.size === 1 && rows.length >= 2) {
        const adminRow = rows.find((r) => r.role === 'admin') ?? rows[0]
        return {
          id: adminRow.id,
          org_id: adminRow.org_id,
          email: adminRow.email,
          display_name: adminRow.display_name,
          role: adminRow.role,
          combined_org_ids: rows.map((r) => r.org_id),
        }
      }
    }

    // Match the active-workspace cookie to one of the caller's memberships.
    // When it doesn't match — a stale cookie, an archived workspace, or one
    // the caller can only *view* (account-wide viewer access) — fall back to
    // their own (first) membership instead of refusing. The write then lands
    // in the caller's real workspace and can never escalate, mirroring
    // resolveSession()'s graceful workspace fallback. Returning null here
    // surfaced a misleading "user not linked" error for correctly-linked
    // users carrying a stale cookie.
    const match = requestedSlug ? rows.find((r) => slugOf(r) === requestedSlug) : undefined
    const picked = match ?? rows[0]
    return {
      id: picked.id,
      org_id: picked.org_id,
      email: picked.email,
      display_name: picked.display_name,
      role: picked.role,
      combined_org_ids: null,
    }
  }

  // 3: first-login fallback by email. The unique index is
  // (org_id, email) so multiple rows may exist across workspaces;
  // prefer the one matching the cookie, else the first by name.
  if (!userEmail) return null

  const { data: byEmail } = await admin
    .from('members')
    .select('id, org_id, email, display_name, role, organizations!inner(slug, name)')
    .ilike('email', userEmail)
    .eq('is_active', true)
    .is('user_id', null)
    .order('org_id', { ascending: true })

  type Row2 = {
    id: string
    org_id: string
    email: string
    display_name: string
    role: MemberRole | null
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
    role: picked.role ?? 'member',
    combined_org_ids: null,
  }
}
