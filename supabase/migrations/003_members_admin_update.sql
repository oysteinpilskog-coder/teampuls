-- ============================================================
-- Allow admins to update members in their org
-- (Fixes: admin could not toggle is_active / role / nicknames
-- on other members — only members_update_self existed.)
-- ============================================================

CREATE POLICY members_admin_update ON members FOR UPDATE
  USING (current_user_is_admin(org_id))
  WITH CHECK (current_user_is_admin(org_id));
