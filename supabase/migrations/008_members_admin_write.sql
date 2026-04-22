-- ============================================================
-- Allow admins to add and remove members in their org.
-- (Fixes: "Legg til medlem" failed silently because only
--  members_admin_update existed — no INSERT or DELETE policy,
--  so RLS blocked the insert and the UI showed "Noe gikk galt".)
-- ============================================================

CREATE POLICY members_admin_insert ON members FOR INSERT
  WITH CHECK (current_user_is_admin(org_id));

CREATE POLICY members_admin_delete ON members FOR DELETE
  USING (current_user_is_admin(org_id));
