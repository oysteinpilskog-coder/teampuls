-- ============================================================
-- Migration 038 — Backfill home_office for UK-ansatte uten kontor
--
-- Etter sammenslåingen (037) ligger alle ansatte i CalWin-org-en,
-- og NO/UK-skillet avledes fra home_office_id → offices.country_code
-- ('GB' → UK-side). Én UK-ansatt (ed@calwin.co.uk) manglet
-- home_office_id og ville derfor feilaktig havne på NO-siden.
--
-- Denne migrasjonen knytter alle @calwin.co.uk-medlemmer i CalWin-
-- org-en som mangler kontor til org-ens GB-kontor (foretrekker HQ-
-- merket GB-kontor, ellers første GB-kontor). Domenebasert backfill,
-- speiler mønsteret fra 018.
--
-- Idempotent: oppdaterer kun rader der home_office_id IS NULL.
-- ============================================================

DO $$
DECLARE
  v_calwin_org uuid := '00000000-0000-0000-0000-000000000001';
  v_gb_office  uuid;
BEGIN
  SELECT id INTO v_gb_office
  FROM offices
  WHERE org_id = v_calwin_org AND country_code = 'GB'
  ORDER BY is_hq DESC, sort_order, created_at
  LIMIT 1;

  IF v_gb_office IS NOT NULL THEN
    UPDATE members
    SET home_office_id = v_gb_office
    WHERE org_id = v_calwin_org
      AND home_office_id IS NULL
      AND lower(email) LIKE '%@calwin.co.uk';
  END IF;
END $$;
