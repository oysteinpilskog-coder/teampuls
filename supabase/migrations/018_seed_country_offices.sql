-- ============================================================
-- 018: Country offices + home_office_id backfill
--
-- Seed one office per country for CalWin Nordic + UK so that the
-- per-member holiday rendering (team-grid corner-stripe / cell-tint)
-- has a country signal to follow:
--   Member.home_office_id → Office.country_code → date-holidays lookup
--
-- Today no offices are seeded and home_office_id is NULL on every
-- member, so the team-grid only paints flags in the day-header (which
-- is org-wide) — Tomas/Ruta/Darius (LT) and James/Sophie (GB) get no
-- per-row signal on their actual public holidays.
--
-- This migration is idempotent: existing offices and members keep
-- their values, only NULL home_office_id rows are touched.
-- ============================================================

DO $$
DECLARE
  v_nordic_org uuid := '00000000-0000-0000-0000-000000000001';
  v_uk_org     uuid := '00000000-0000-0000-0000-000000000002';
  o_oslo       uuid;
  o_stockholm  uuid;
  o_vilnius    uuid;
  o_london     uuid;
BEGIN
  -- ----------------------------------------------------------
  -- 1. Nordic offices: Oslo (NO), Stockholm (SE), Vilnius (LT)
  -- ----------------------------------------------------------

  SELECT id INTO o_oslo
  FROM offices
  WHERE org_id = v_nordic_org AND country_code = 'NO'
  ORDER BY sort_order, created_at LIMIT 1;
  IF o_oslo IS NULL THEN
    INSERT INTO offices (org_id, name, city, country_code, timezone, sort_order)
    VALUES (v_nordic_org, 'Oslo', 'Oslo', 'NO', 'Europe/Oslo', 0)
    RETURNING id INTO o_oslo;
  END IF;

  SELECT id INTO o_stockholm
  FROM offices
  WHERE org_id = v_nordic_org AND country_code = 'SE'
  ORDER BY sort_order, created_at LIMIT 1;
  IF o_stockholm IS NULL THEN
    INSERT INTO offices (org_id, name, city, country_code, timezone, sort_order)
    VALUES (v_nordic_org, 'Stockholm', 'Stockholm', 'SE', 'Europe/Stockholm', 1)
    RETURNING id INTO o_stockholm;
  END IF;

  SELECT id INTO o_vilnius
  FROM offices
  WHERE org_id = v_nordic_org AND country_code = 'LT'
  ORDER BY sort_order, created_at LIMIT 1;
  IF o_vilnius IS NULL THEN
    INSERT INTO offices (org_id, name, city, country_code, timezone, sort_order)
    VALUES (v_nordic_org, 'Vilnius', 'Vilnius', 'LT', 'Europe/Vilnius', 2)
    RETURNING id INTO o_vilnius;
  END IF;

  -- ----------------------------------------------------------
  -- 2. UK office: London (GB)
  -- ----------------------------------------------------------

  SELECT id INTO o_london
  FROM offices
  WHERE org_id = v_uk_org AND country_code = 'GB'
  ORDER BY sort_order, created_at LIMIT 1;
  IF o_london IS NULL THEN
    INSERT INTO offices (org_id, name, city, country_code, timezone, sort_order)
    VALUES (v_uk_org, 'London', 'London', 'GB', 'Europe/London', 0)
    RETURNING id INTO o_london;
  END IF;

  -- ----------------------------------------------------------
  -- 3. Backfill home_office_id from email domain.
  --    Only touches rows where home_office_id IS NULL so manual
  --    assignments via the settings UI win on re-run.
  -- ----------------------------------------------------------

  UPDATE members
  SET home_office_id = o_oslo
  WHERE org_id = v_nordic_org
    AND home_office_id IS NULL
    AND email ILIKE '%@calwin.no';

  UPDATE members
  SET home_office_id = o_stockholm
  WHERE org_id = v_nordic_org
    AND home_office_id IS NULL
    AND email ILIKE '%@calwin.se';

  UPDATE members
  SET home_office_id = o_vilnius
  WHERE org_id = v_nordic_org
    AND home_office_id IS NULL
    AND email ILIKE '%@calwin.lt';

  UPDATE members
  SET home_office_id = o_london
  WHERE org_id = v_uk_org
    AND home_office_id IS NULL
    AND email ILIKE '%@calwin.co.uk';
END $$;
