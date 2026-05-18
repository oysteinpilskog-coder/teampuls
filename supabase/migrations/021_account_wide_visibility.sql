-- ============================================================
-- Migration 021 — Account-wide read visibility
--
-- Before: a user could only see workspaces they were an explicit
-- `members` row in. To let admin Øystein switch between CalWin
-- Nordic and CalWin UK, migration 010 had to create a duplicate
-- membership for him in UK. Regular users (Johan, Maria, James,
-- Sophie) were locked to their own side and could never see what
-- the other office was doing.
--
-- After: every user with a membership in any workspace under an
-- account automatically gains *read* access to all the other
-- workspaces under the same account. The switcher shows them all,
-- the grid/dashboard/wheel render their data, and Supabase realtime
-- broadcasts updates across the whole account.
--
-- Write access stays strict — `current_user_is_admin(org_id)` is
-- left untouched, so admin operations (adding members, editing org
-- settings) still require an actual membership row with the admin
-- role in that specific workspace. The AI/parse and AI/query
-- endpoints additionally hard-fail with 403 when the caller has no
-- real membership in the active workspace, so registering absence
-- on someone else's behalf cross-org is blocked at the API layer.
--
-- The `visits` table previously trusted `current_user_org_ids()`
-- for writes (migration 020) — that helper now resolves to the
-- whole account, so we re-anchor `visits_write` to a new helper
-- `current_user_has_membership(org_id)` to preserve the original
-- intent: viewers can read visits but only actual members can
-- register them.
-- ============================================================

-- ------------------------------------------------------------
-- 1. current_user_org_ids() — account-wide
--
-- Returns the union of all non-archived org ids belonging to any
-- account where the caller has at least one active membership.
-- This drives every existing SELECT policy across the schema
-- (accounts, customers, visits, …) so opening it up cascades
-- naturally without touching any policy definitions.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_org_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[])
  FROM organizations o
  WHERE o.archived_at IS NULL
    AND o.account_id IN (
      SELECT DISTINCT o2.account_id
      FROM members m
      JOIN organizations o2 ON o2.id = m.org_id
      WHERE m.user_id = auth.uid()
        AND m.is_active = true
        AND o2.account_id IS NOT NULL
    );
$$;

-- ------------------------------------------------------------
-- 2. current_user_has_membership(org_id) — strict membership check
--
-- Returns true only when the caller has an active membership row
-- in the given workspace. Used by write policies that must reject
-- viewer-mode (account-wide read but no real seat).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_has_membership(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM members m
    WHERE m.user_id = auth.uid()
      AND m.org_id  = p_org_id
      AND m.is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_membership(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 3. current_user_workspaces() — account-wide, with viewer role
--
-- Returns one row per workspace under the caller's account(s).
-- `role` is the caller's actual role in that workspace, or the
-- synthetic string 'viewer' for workspaces the caller can read but
-- has no membership in. The session layer (src/lib/supabase/session.ts)
-- uses 'viewer' to gate write-only UI surfaces (AI input,
-- InactivityNudge, settings pages).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_workspaces()
RETURNS TABLE (
  org_id       uuid,
  account_id   uuid,
  name         text,
  slug         text,
  short_name   text,
  region       text,
  country_code text,
  accent_color text,
  logo_url     text,
  role         text
)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_accounts AS (
    SELECT DISTINCT o.account_id
    FROM members m
    JOIN organizations o ON o.id = m.org_id
    WHERE m.user_id = auth.uid()
      AND m.is_active = true
      AND o.account_id IS NOT NULL
  )
  SELECT
    o.id,
    o.account_id,
    o.name,
    o.slug,
    o.short_name,
    o.region,
    o.country_code,
    o.accent_color,
    o.logo_url,
    COALESCE(m.role::text, 'viewer') AS role
  FROM organizations o
  LEFT JOIN members m
    ON m.org_id = o.id
   AND m.user_id = auth.uid()
   AND m.is_active = true
  WHERE o.account_id IN (SELECT account_id FROM my_accounts)
    AND o.archived_at IS NULL
  ORDER BY o.name;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_workspaces() TO authenticated;

-- ------------------------------------------------------------
-- 4. Re-anchor visits_write to require real membership
--
-- Migration 020 set `visits_write` to allow anyone in
-- `current_user_org_ids()`. With (1) above that now equals the
-- whole account — and we don't want a Nordic viewer to register
-- guests for the UK reception. Switch to the strict helper.
-- Lese-policyen forblir bred (alle i accountet kan se besøk).
-- ------------------------------------------------------------

DROP POLICY IF EXISTS visits_write ON visits;
CREATE POLICY visits_write ON visits FOR ALL
  USING (current_user_has_membership(org_id))
  WITH CHECK (current_user_has_membership(org_id));

-- ------------------------------------------------------------
-- 5. Entries — lock down writes to real members
--
-- Before this migration the entries table had no RLS (writes were
-- gated only by application code via .in('org_id', ...) filters).
-- That was tolerable when every user could only see their own
-- workspace — the UI never offered a way to write elsewhere. With
-- account-wide visibility a viewer can now load the team grid for
-- another workspace, so we need real database-level guards: viewers
-- read freely (matching the new visibility surface), but only real
-- members may insert/update/delete entries in a given workspace.
-- ------------------------------------------------------------

ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entries_read ON entries;
CREATE POLICY entries_read ON entries FOR SELECT
  USING (org_id = ANY(current_user_org_ids()));

DROP POLICY IF EXISTS entries_write ON entries;
CREATE POLICY entries_write ON entries FOR ALL
  USING (current_user_has_membership(org_id))
  WITH CHECK (current_user_has_membership(org_id));
