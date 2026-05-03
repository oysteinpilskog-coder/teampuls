-- ============================================================
-- Migration 026 — members.hidden_from_overview
--
-- Lar et medlem være aktivt (admin-rolle, RLS-tilgang, workspace-
-- switcher, AI-matching osv.) uten å dukke opp på selve
-- teamoversikten. Brukes for cross-workspace-administratorer som
-- har et "skygge-medlemskap" i et workspace de ikke jobber i —
-- f.eks. Øystein i CalWin UK.
--
-- Filteret legges på *visualiserings*-spørringer (team grid,
-- dashboard, presence-heatmap, bursdag/jubileum, team health).
-- Auth-, AI-parse- og admin-flater leser fortsatt alle aktive
-- medlemmer.
-- ============================================================

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS hidden_from_overview boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN members.hidden_from_overview IS
  'Skjul medlemmet fra team-oversikt og dashboard. Påvirker ikke RLS, admin-rolle eller AI-navnegjenkjenning. Brukes typisk for cross-workspace-admins.';

-- Skjul Øystein i CalWin UK fra UK-oversikten. Hovedmedlemskapet
-- i CalWin Nordic (samme e-post) påvirkes ikke.
UPDATE members
SET hidden_from_overview = true
WHERE email = 'oystein@calwin.no'
  AND org_id = '00000000-0000-0000-0000-000000000002';
