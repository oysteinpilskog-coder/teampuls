-- ============================================================
-- TeamPulse — Seed: fødselsdag og startdato for medlemmer
--
-- Idempotent: oppdaterer kun rader der feltet er NULL, så det
-- er trygt å re-kjøre. Påvirker ikke Øystein.
--
-- Spesifikke verdier (alder/CW per 2026-04-27):
--   Sindre  54 år, CW 29 år
--   Fredrik 52 år, CW 25 år
--   Ola     54 år, CW 4 år
--   Trond   59 år, CW 23 år
--   Ingar   59 år, CW 3 år
-- Resten av aktive medlemmer (utenom Øystein) får tilfeldige
-- plausible datoer (fødsel 1965–1995, start 2014–2025).
-- ============================================================

DO $$
DECLARE
  v_org uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Sindre
  UPDATE members SET birth_date = DATE '1972-03-15', birthday_visible = TRUE
   WHERE org_id = v_org AND display_name ILIKE 'Sindre%' AND birth_date IS NULL;
  UPDATE members SET start_date = DATE '1997-02-15'
   WHERE org_id = v_org AND display_name ILIKE 'Sindre%' AND start_date IS NULL;

  -- Fredrik
  UPDATE members SET birth_date = DATE '1974-01-22', birthday_visible = TRUE
   WHERE org_id = v_org AND display_name ILIKE 'Fredrik%' AND birth_date IS NULL;
  UPDATE members SET start_date = DATE '2001-03-08'
   WHERE org_id = v_org AND display_name ILIKE 'Fredrik%' AND start_date IS NULL;

  -- Ola
  UPDATE members SET birth_date = DATE '1972-02-08', birthday_visible = TRUE
   WHERE org_id = v_org AND display_name ILIKE 'Ola%' AND birth_date IS NULL;
  UPDATE members SET start_date = DATE '2022-01-10'
   WHERE org_id = v_org AND display_name ILIKE 'Ola%' AND start_date IS NULL;

  -- Trond
  UPDATE members SET birth_date = DATE '1967-03-12', birthday_visible = TRUE
   WHERE org_id = v_org AND display_name ILIKE 'Trond%' AND birth_date IS NULL;
  UPDATE members SET start_date = DATE '2003-04-01'
   WHERE org_id = v_org AND display_name ILIKE 'Trond%' AND start_date IS NULL;

  -- Ingar
  UPDATE members SET birth_date = DATE '1967-04-03', birthday_visible = TRUE
   WHERE org_id = v_org AND display_name ILIKE 'Ingar%' AND birth_date IS NULL;
  UPDATE members SET start_date = DATE '2023-02-20'
   WHERE org_id = v_org AND display_name ILIKE 'Ingar%' AND start_date IS NULL;

  -- Resten av aktive medlemmer (ikke Øystein, ikke de 5 over) — tilfeldige datoer
  UPDATE members
     SET birth_date = DATE '1965-01-01' + (random() * 365 * 30)::int
   WHERE org_id = v_org
     AND is_active = TRUE
     AND birth_date IS NULL
     AND email NOT ILIKE 'oystein@%'
     AND display_name NOT ILIKE 'Øystein%'
     AND display_name NOT ILIKE 'Sindre%'
     AND display_name NOT ILIKE 'Fredrik%'
     AND display_name NOT ILIKE 'Ola%'
     AND display_name NOT ILIKE 'Trond%'
     AND display_name NOT ILIKE 'Ingar%';

  UPDATE members
     SET start_date = DATE '2014-01-01' + (random() * 365 * 11)::int
   WHERE org_id = v_org
     AND is_active = TRUE
     AND start_date IS NULL
     AND email NOT ILIKE 'oystein@%'
     AND display_name NOT ILIKE 'Øystein%'
     AND display_name NOT ILIKE 'Sindre%'
     AND display_name NOT ILIKE 'Fredrik%'
     AND display_name NOT ILIKE 'Ola%'
     AND display_name NOT ILIKE 'Trond%'
     AND display_name NOT ILIKE 'Ingar%';
END $$;
