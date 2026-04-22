-- ============================================================
-- Allow admins to add and remove members in their org.
-- (Fixes: "Legg til medlem" failed silently because only
--  members_admin_update existed — no INSERT or DELETE policy,
--  so RLS blocked the insert and the UI showed "Noe gikk galt".)
--
-- Idempotent: a prior deploy may already have created one or
-- both policies, so we drop-if-exists before re-creating.
-- ============================================================

DROP POLICY IF EXISTS members_admin_insert ON members;
DROP POLICY IF EXISTS members_admin_delete ON members;

CREATE POLICY members_admin_insert ON members FOR INSERT
  WITH CHECK (current_user_is_admin(org_id));

CREATE POLICY members_admin_delete ON members FOR DELETE
  USING (current_user_is_admin(org_id));
