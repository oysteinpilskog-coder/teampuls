-- ============================================================
-- 021 — Spre fødselsdager/jubileer utover året + 2 demo-medlemmer
--
-- Seeden i 017 klumpet birth_date/start_date i januar–april, så
-- årshjulet ble tett i én kvadrant. Vi beholder årstallet og
-- omfordeler dag-i-året deterministisk via hashtext(id) — dvs.
-- re-kjøring gir samme datoer (idempotent).
--
-- I tillegg: to demo-medlemmer som garanterer at hjulet alltid
-- har noe ferskt å vise:
--   * Anniken Solheim — bursdag mandag 2026-05-04 (fyller 41)
--   * Bjørn Halvorsen — 25-årsjubileum fredag 2026-05-08
-- ============================================================

DO $$
DECLARE
  v_org uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- ----------------------------------------------------------
  -- Spre måned/dag for aktive medlemmer (Øystein urørt — admin
  -- har ikke datoer satt, og hvis de blir det skal de ikke flyttes).
  -- Hash gir et stabilt tall 0–364 per medlem; vi legger det på
  -- 1. januar i medlemmets opprinnelige år, så året beholdes.
  -- ----------------------------------------------------------

  UPDATE members
  SET birth_date = make_date(EXTRACT(YEAR FROM birth_date)::int, 1, 1)
                 + ((abs(hashtext(id::text || ':birth')) % 365)) * INTERVAL '1 day'
  WHERE org_id = v_org
    AND is_active = TRUE
    AND birth_date IS NOT NULL
    AND email NOT ILIKE 'oystein@%';

  UPDATE members
  SET start_date = make_date(EXTRACT(YEAR FROM start_date)::int, 1, 1)
                 + ((abs(hashtext(id::text || ':start')) % 365)) * INTERVAL '1 day'
  WHERE org_id = v_org
    AND is_active = TRUE
    AND start_date IS NOT NULL
    AND email NOT ILIKE 'oystein@%';

  -- ----------------------------------------------------------
  -- Anniken — bursdag på mandag (2026-05-04). Opt-in for synlig
  -- bursdag siden vi skal vise pin på årshjulet.
  -- ----------------------------------------------------------

  INSERT INTO members (
    org_id, display_name, full_name, email, nicknames, role, is_active,
    birth_date, birthday_visible,
    start_date, anniversary_visible
  )
  VALUES (
    v_org, 'Anniken', 'Anniken Solheim', 'anniken@calwin.no',
    ARRAY['Anniken','AS'], 'member', TRUE,
    DATE '1985-05-04', TRUE,
    DATE '2018-09-12', TRUE
  )
  ON CONFLICT (org_id, email) DO UPDATE
    SET full_name           = EXCLUDED.full_name,
        is_active            = TRUE,
        birth_date           = EXCLUDED.birth_date,
        birthday_visible     = TRUE,
        start_date           = EXCLUDED.start_date,
        anniversary_visible  = TRUE;

  -- ----------------------------------------------------------
  -- Bjørn — 25-årsjubileum på ansiennitet (2001-05-08 → 2026-05-08).
  -- Bursdag også opt-in så han ikke er en datotom rad.
  -- ----------------------------------------------------------

  INSERT INTO members (
    org_id, display_name, full_name, email, nicknames, role, is_active,
    birth_date, birthday_visible,
    start_date, anniversary_visible
  )
  VALUES (
    v_org, 'Bjørn', 'Bjørn Halvorsen', 'bjorn@calwin.no',
    ARRAY['Bjørn','BH'], 'member', TRUE,
    DATE '1976-08-22', TRUE,
    DATE '2001-05-08', TRUE
  )
  ON CONFLICT (org_id, email) DO UPDATE
    SET full_name           = EXCLUDED.full_name,
        is_active            = TRUE,
        birth_date           = EXCLUDED.birth_date,
        birthday_visible     = TRUE,
        start_date           = EXCLUDED.start_date,
        anniversary_visible  = TRUE;
END $$;
