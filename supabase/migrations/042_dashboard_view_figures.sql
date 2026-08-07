-- ============================================================
-- Migration 042 — Dashboard view J (Nøkkeltall)
--
-- «Nøkkeltall» er firmaet i tall: kundebase per land, teamet per
-- land, samlet ansiennitet, kontorer og tidssoner. Visningen leser
-- utelukkende members/offices/customers som dashbordet allerede har
-- i minnet — ingen nye tabeller, kolonner eller spørringer.
--
-- Skjemaet trenger derfor kun å akseptere den nye nøkkelen i
-- `dashboard_rotation_views`. Migration 031 låste constraint-en til
-- {A,B,C,D,E,G,H,I}; vi dropper den og legger til en ny som også
-- aksepterer J. F (Velkomst) er fortsatt utelatt — injiseres
-- dynamisk fra `visits` og lagres aldri i denne kolonnen.
-- ============================================================

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_dashboard_rotation_views_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_dashboard_rotation_views_check
    CHECK (dashboard_rotation_views <@ ARRAY['A', 'B', 'C', 'D', 'E', 'G', 'H', 'I', 'J']::TEXT[]);
