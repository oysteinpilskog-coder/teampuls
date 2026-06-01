-- ============================================================
-- Migration 037 — Slå CalWin UK inn i ett samlet register
--
-- Before: to workspaces under CalWin-kontoen — "CalWin Nordic"
-- (org …0001) og "CalWin UK" (org …0002). UK-ansatte og London-
-- kontoret lå i UK-org-en, og Øystein hadde et skygge-medlemskap
-- der for cross-workspace-visning.
--
-- After: ALLE ansatte i én org ("CalWin", …0001). Hver ansatt er
-- knyttet til et kontor (home_office_id), og NO/UK-skillet avledes
-- fra kontorets country_code (GB → UK-side, ellers NO-side) i UI-et.
-- London-kontoret re-foreldres til CalWin-org-en med samme id, så
-- UK-ansattes home_office_id forblir gyldig.
--
-- Workspace-skjelettet beholdes: UK-org-raden slettes ikke, den
-- arkiveres (archived_at) slik at den faller ut av switcher og
-- combined-view, men kan gjenopplives for fremtidig SaaS.
--
-- Idempotent: guardet med existence-sjekker, trygg å kjøre på nytt.
-- ============================================================

DO $$
DECLARE
  v_calwin_org uuid := '00000000-0000-0000-0000-000000000001';  -- beholdes, blir "CalWin"
  v_uk_org     uuid := '00000000-0000-0000-0000-000000000002';  -- arkiveres
  o_london     uuid;
  m_uk         uuid;
BEGIN
  -- ----------------------------------------------------------
  -- 1. Re-forelder London-kontoret til CalWin-org-en (samme id).
  --    Append-es bakerst i kontorlista (sort_order = 3).
  -- ----------------------------------------------------------
  SELECT id INTO o_london
  FROM offices
  WHERE org_id = v_uk_org AND country_code = 'GB'
  ORDER BY sort_order, created_at LIMIT 1;

  IF o_london IS NOT NULL THEN
    UPDATE offices
    SET org_id     = v_calwin_org,
        sort_order = 3,
        is_hq      = false        -- Oslo forblir HQ
    WHERE id = o_london;
  END IF;

  -- ----------------------------------------------------------
  -- 2. Flytt UK-ansatte (alle ekte medlemmer i UK-org-en som ikke
  --    er Øystein-skyggeraden) inn i CalWin-org-en. Entries følger
  --    via member_id → org_id. home_office_id beholdes (kontoret
  --    flyttet med i steg 1, samme id).
  -- ----------------------------------------------------------
  FOR m_uk IN
    SELECT id FROM members
    WHERE org_id = v_uk_org
      AND email <> 'oystein@calwin.no'
  LOOP
    UPDATE entries SET org_id = v_calwin_org WHERE member_id = m_uk;
    UPDATE members SET org_id = v_calwin_org WHERE id = m_uk;
  END LOOP;

  -- ----------------------------------------------------------
  -- 3. Fjern Øysteins skygge-medlemskap i UK-org-en. Hoved-
  --    medlemskapet i CalWin-org-en (samme e-post) er urørt.
  --    Slett evt. entries på skyggeraden først for å unngå at
  --    FK-en blokkerer slettingen (normalt ingen).
  -- ----------------------------------------------------------
  DELETE FROM entries
  WHERE member_id IN (
    SELECT id FROM members
    WHERE org_id = v_uk_org AND email = 'oystein@calwin.no'
  );
  DELETE FROM members
  WHERE org_id = v_uk_org AND email = 'oystein@calwin.no';

  -- ----------------------------------------------------------
  -- 4. Døp om CalWin-org-en til ett samlet register, og arkiver
  --    UK-org-en (skjelett beholdt for fremtidig SaaS).
  -- ----------------------------------------------------------
  UPDATE organizations
  SET name = 'CalWin',
      slug = 'calwin'
  WHERE id = v_calwin_org;

  UPDATE organizations
  SET archived_at = COALESCE(archived_at, now())
  WHERE id = v_uk_org;
END $$;
