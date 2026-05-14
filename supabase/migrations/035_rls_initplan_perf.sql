-- ============================================================
-- RLS performance pass: kutt per-row auth.uid() + dobbel
-- policy-evaluering på SELECT
--
-- Supabase Database Linter rapporterte to klasser av problemer:
--
-- 1. auth_rls_initplan (4 policies)
--    Inline `auth.uid()` re-evalueres for HVER rad. Wrap-en
--    `(SELECT auth.uid())` lar Postgres pakke det inn i en
--    InitPlan og kjøre én gang per query.
--
-- 2. multiple_permissive_policies (48 entries — 8 tables × 6 roles)
--    `_write FOR ALL` policies dekket også SELECT, så hver
--    SELECT trigger BÅDE `_read` og `_write`-evalueringene per
--    rad. Splitter `FOR ALL` i `FOR INSERT/UPDATE/DELETE` så
--    bare `_read` evalueres for SELECTs.
--
-- Forventet effekt på cold-load av oversikten: matrisen-querien
-- (entries × members med RLS) faller fra (auth.uid_per_row +
-- 2_policies_per_row) til (1_initplan + 1_policy_per_row). På
-- 105+ entries × 15+ members = stor reduksjon i evalueringer.
--
-- Refs:
--   https://supabase.com/docs/guides/database/database-linter
--     ?lint=0003_auth_rls_initplan
--     ?lint=0006_multiple_permissive_policies
-- ============================================================

-- ─── 1. Wrap inline auth.uid() i (SELECT auth.uid()) ─────────

DROP POLICY IF EXISTS members_update_self ON members;
CREATE POLICY members_update_self ON members FOR UPDATE
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS ai_corrections_read ON ai_corrections;
CREATE POLICY ai_corrections_read ON ai_corrections FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS ai_corrections_insert ON ai_corrections;
CREATE POLICY ai_corrections_insert ON ai_corrections FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM members WHERE user_id = (SELECT auth.uid())
    )
  );

-- ─── 2. Splitt _write FOR ALL i per-action policies ──────────
-- Hver `FOR ALL`-policy dekket også SELECT, så hver matrise-
-- query trigget BÅDE `_read` og `_write` på hver rad. Etter
-- splittingen er det én policy per rad for SELECT.

-- entries — også wrap auth.uid() inni
DROP POLICY IF EXISTS entries_write ON entries;
CREATE POLICY entries_insert ON entries FOR INSERT
  WITH CHECK (
    (member_id IN (
      SELECT id FROM members
      WHERE user_id = (SELECT auth.uid()) AND is_active = true
    ))
    OR current_user_is_admin(org_id)
  );
CREATE POLICY entries_update ON entries FOR UPDATE
  USING (
    (member_id IN (
      SELECT id FROM members
      WHERE user_id = (SELECT auth.uid()) AND is_active = true
    ))
    OR current_user_is_admin(org_id)
  );
CREATE POLICY entries_delete ON entries FOR DELETE
  USING (
    (member_id IN (
      SELECT id FROM members
      WHERE user_id = (SELECT auth.uid()) AND is_active = true
    ))
    OR current_user_is_admin(org_id)
  );

-- customers
DROP POLICY IF EXISTS customers_write ON customers;
CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (current_user_is_admin(org_id));
CREATE POLICY customers_update ON customers FOR UPDATE
  USING (current_user_is_admin(org_id))
  WITH CHECK (current_user_is_admin(org_id));
CREATE POLICY customers_delete ON customers FOR DELETE
  USING (current_user_is_admin(org_id));

-- events
DROP POLICY IF EXISTS events_write ON events;
CREATE POLICY events_insert ON events FOR INSERT
  WITH CHECK (current_user_is_admin(org_id));
CREATE POLICY events_update ON events FOR UPDATE
  USING (current_user_is_admin(org_id))
  WITH CHECK (current_user_is_admin(org_id));
CREATE POLICY events_delete ON events FOR DELETE
  USING (current_user_is_admin(org_id));

-- offices
DROP POLICY IF EXISTS offices_write ON offices;
CREATE POLICY offices_insert ON offices FOR INSERT
  WITH CHECK (current_user_is_admin(org_id));
CREATE POLICY offices_update ON offices FOR UPDATE
  USING (current_user_is_admin(org_id))
  WITH CHECK (current_user_is_admin(org_id));
CREATE POLICY offices_delete ON offices FOR DELETE
  USING (current_user_is_admin(org_id));

-- strategy_themes
DROP POLICY IF EXISTS strategy_themes_write ON strategy_themes;
CREATE POLICY strategy_themes_insert ON strategy_themes FOR INSERT
  WITH CHECK (current_user_is_admin(org_id));
CREATE POLICY strategy_themes_update ON strategy_themes FOR UPDATE
  USING (current_user_is_admin(org_id))
  WITH CHECK (current_user_is_admin(org_id));
CREATE POLICY strategy_themes_delete ON strategy_themes FOR DELETE
  USING (current_user_is_admin(org_id));

-- visits
DROP POLICY IF EXISTS visits_write ON visits;
CREATE POLICY visits_insert ON visits FOR INSERT
  WITH CHECK (org_id = ANY (current_user_org_ids()));
CREATE POLICY visits_update ON visits FOR UPDATE
  USING (org_id = ANY (current_user_org_ids()))
  WITH CHECK (org_id = ANY (current_user_org_ids()));
CREATE POLICY visits_delete ON visits FOR DELETE
  USING (org_id = ANY (current_user_org_ids()));

-- ─── 3. Drop redundant duplikat ──────────────────────────────
-- members hadde to identiske INSERT-policies (members_admin_insert
-- + members_admin_write) som begge sjekker current_user_is_admin.
DROP POLICY IF EXISTS members_admin_write ON members;
