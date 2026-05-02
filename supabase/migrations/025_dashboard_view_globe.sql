-- ============================================================
-- Migration 025 — Dashboard view G (Globus)
--
-- Migration 014 lockede `dashboard_rotation_views` til subset av
-- {'A','B','C','D','E'} via en CHECK-constraint. Den nye visningen
-- G (Globus, roterende verdensglobus) trenger en utvidet liste.
--
-- Vi dropper den gamle constraint-en og legger til en ny som
-- aksepterer A-E + G. F (Velkomst) er fortsatt utelatt — den
-- injiseres dynamisk basert på `visits`-tabellen og skal ALDRI
-- lagres i denne kolonnen (samme regel som siden 014).
-- ============================================================

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_dashboard_rotation_views_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_dashboard_rotation_views_check
    CHECK (dashboard_rotation_views <@ ARRAY['A', 'B', 'C', 'D', 'E', 'G']::TEXT[]);
