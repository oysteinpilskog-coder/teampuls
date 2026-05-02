-- ============================================================
-- HQ-flag på offices.
--
-- Én org kan markere ett kontor som hovedkontor. Brukes til å
-- ankre dashbordet («X på Oslo i dag») og kan senere drive
-- HQ-klokke, HQ-vær, HQ-pin på kart, osv. Partial unique index
-- garanterer at kun ett kontor per org har is_hq = TRUE — uten
-- å hindre at flere har FALSE.
-- ============================================================

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS is_hq BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS offices_one_hq_per_org
  ON offices (org_id) WHERE is_hq = TRUE;
