-- ============================================================
-- Migration 031 — Dashboard views H (Kunder UK) + I (Kunder Nordic)
--
-- CalWin AS sin kundebase splittes på to avdelinger:
--   H = Kunder UK     — country_code = 'GB'
--   I = Kunder Nordic — alt som ikke er 'GB'
--
-- Begge er samme visuelle visning som D (Kunder), bare med
-- ulike customer-filter og ulik tittel. Splittingen skjer i
-- klienten — DB-skjemaet trenger kun å akseptere de nye nøklene
-- i `dashboard_rotation_views`.
--
-- Migration 025 låste constraint-en til {A,B,C,D,E,G}. Vi
-- dropper den og legger til en ny som også aksepterer H og I.
-- F (Velkomst) er fortsatt utelatt — injiseres dynamisk fra
-- `visits`-tabellen og skal aldri lagres i denne kolonnen.
-- ============================================================

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_dashboard_rotation_views_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_dashboard_rotation_views_check
    CHECK (dashboard_rotation_views <@ ARRAY['A', 'B', 'C', 'D', 'E', 'G', 'H', 'I']::TEXT[]);
