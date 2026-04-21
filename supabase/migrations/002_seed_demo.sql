-- ============================================================
-- TeamPulse — CalWin AS seed data
-- Run this in Supabase SQL Editor AFTER 001_initial.sql.
--
-- Step 1: Run this entire file
-- Step 2: Each team member logs in with their @calwin email via
--         magic link — they are auto-linked on first login.
-- ============================================================

-- CalWin org ID: '00000000-0000-0000-0000-000000000001'

-- ============================================================
-- MEMBERS (15 CalWin-ansatte)
-- ============================================================

INSERT INTO members (org_id, display_name, email, nicknames, role, is_active)
VALUES
  -- Norge (Oslo)
  ('00000000-0000-0000-0000-000000000001', 'Øystein Fosshagen',  'oystein@calwin.no',      ARRAY['Øystein', 'ØF', 'Fosshagen'],  'admin',  true),
  ('00000000-0000-0000-0000-000000000001', 'Johan Lindqvist',    'johan@calwin.no',         ARRAY['Johan', 'JL'],                 'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Maria Eriksen',      'maria@calwin.no',         ARRAY['Maria', 'ME'],                 'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Lars Haugen',        'lars@calwin.no',          ARRAY['Lars', 'LH'],                  'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Astrid Vold',        'astrid@calwin.no',        ARRAY['Astrid'],                      'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Kari Nilsen',        'kari@calwin.no',          ARRAY['Kari', 'KN'],                  'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Petter Andersen',    'petter@calwin.no',        ARRAY['Petter', 'PA'],                'member', true),
  -- Sverige (Stockholm)
  ('00000000-0000-0000-0000-000000000001', 'Erik Karlsson',      'erik@calwin.se',          ARRAY['Erik', 'EK'],                  'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Sara Johansson',     'sara@calwin.se',          ARRAY['Sara', 'SJ'],                  'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Mikael Lindberg',    'mikael@calwin.se',        ARRAY['Mikael', 'ML'],                'member', true),
  -- Litauen (Vilnius)
  ('00000000-0000-0000-0000-000000000001', 'Tomas Kazlauskas',   'tomas@calwin.lt',         ARRAY['Tomas', 'TK'],                 'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Ruta Petrauskiene',  'ruta@calwin.lt',          ARRAY['Ruta', 'RP'],                  'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Darius Simkus',      'darius@calwin.lt',        ARRAY['Darius', 'DS'],                'member', true),
  -- Storbritannia (London)
  ('00000000-0000-0000-0000-000000000001', 'James Wilson',       'james@calwin.co.uk',      ARRAY['James', 'JW'],                 'member', true),
  ('00000000-0000-0000-0000-000000000001', 'Sophie Clarke',      'sophie@calwin.co.uk',     ARRAY['Sophie', 'SC'],                'member', true)
ON CONFLICT (org_id, email) DO NOTHING;

-- ============================================================
-- DEMO ENTRIES — uke 17 (2026-04-20 til 2026-04-24)
-- ============================================================

DO $$
DECLARE
  v_org  uuid := '00000000-0000-0000-0000-000000000001';
  m_oystein uuid; m_johan   uuid; m_maria   uuid;
  m_lars    uuid; m_astrid  uuid; m_kari    uuid;
  m_petter  uuid; m_erik    uuid; m_sara    uuid;
  m_mikael  uuid; m_tomas   uuid; m_ruta    uuid;
  m_darius  uuid; m_james   uuid; m_sophie  uuid;
BEGIN
  SELECT id INTO m_oystein FROM members WHERE org_id = v_org AND email = 'oystein@calwin.no';
  SELECT id INTO m_johan   FROM members WHERE org_id = v_org AND email = 'johan@calwin.no';
  SELECT id INTO m_maria   FROM members WHERE org_id = v_org AND email = 'maria@calwin.no';
  SELECT id INTO m_lars    FROM members WHERE org_id = v_org AND email = 'lars@calwin.no';
  SELECT id INTO m_astrid  FROM members WHERE org_id = v_org AND email = 'astrid@calwin.no';
  SELECT id INTO m_kari    FROM members WHERE org_id = v_org AND email = 'kari@calwin.no';
  SELECT id INTO m_petter  FROM members WHERE org_id = v_org AND email = 'petter@calwin.no';
  SELECT id INTO m_erik    FROM members WHERE org_id = v_org AND email = 'erik@calwin.se';
  SELECT id INTO m_sara    FROM members WHERE org_id = v_org AND email = 'sara@calwin.se';
  SELECT id INTO m_mikael  FROM members WHERE org_id = v_org AND email = 'mikael@calwin.se';
  SELECT id INTO m_tomas   FROM members WHERE org_id = v_org AND email = 'tomas@calwin.lt';
  SELECT id INTO m_ruta    FROM members WHERE org_id = v_org AND email = 'ruta@calwin.lt';
  SELECT id INTO m_darius  FROM members WHERE org_id = v_org AND email = 'darius@calwin.lt';
  SELECT id INTO m_james   FROM members WHERE org_id = v_org AND email = 'james@calwin.co.uk';
  SELECT id INTO m_sophie  FROM members WHERE org_id = v_org AND email = 'sophie@calwin.co.uk';

  INSERT INTO entries (org_id, member_id, date, status, location_label, source) VALUES
    -- Øystein: Fjerdingstad (kunde) hele uken
    (v_org, m_oystein, '2026-04-20', 'customer', 'Fjerdingstad', 'manual'),
    (v_org, m_oystein, '2026-04-21', 'customer', 'Fjerdingstad', 'manual'),
    (v_org, m_oystein, '2026-04-22', 'customer', 'Fjerdingstad', 'manual'),
    (v_org, m_oystein, '2026-04-23', 'customer', 'Fjerdingstad', 'manual'),
    (v_org, m_oystein, '2026-04-24', 'customer', 'Fjerdingstad', 'manual'),
    -- Johan: kontor man–ons, hjemme tor–fre
    (v_org, m_johan,   '2026-04-20', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_johan,   '2026-04-21', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_johan,   '2026-04-22', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_johan,   '2026-04-23', 'remote',   NULL,           'manual'),
    (v_org, m_johan,   '2026-04-24', 'remote',   NULL,           'manual'),
    -- Maria: hjemmekontor hele uken
    (v_org, m_maria,   '2026-04-20', 'remote',   NULL,           'manual'),
    (v_org, m_maria,   '2026-04-21', 'remote',   NULL,           'manual'),
    (v_org, m_maria,   '2026-04-22', 'remote',   NULL,           'manual'),
    (v_org, m_maria,   '2026-04-23', 'remote',   NULL,           'manual'),
    (v_org, m_maria,   '2026-04-24', 'office',   'Oslo kontor',  'manual'),
    -- Lars: syk man, kontor resten
    (v_org, m_lars,    '2026-04-20', 'sick',     NULL,           'manual'),
    (v_org, m_lars,    '2026-04-21', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_lars,    '2026-04-22', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_lars,    '2026-04-23', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_lars,    '2026-04-24', 'office',   'Oslo kontor',  'manual'),
    -- Astrid: reise Stockholm man–tir, kontor resten
    (v_org, m_astrid,  '2026-04-20', 'travel',   'Stockholm',    'manual'),
    (v_org, m_astrid,  '2026-04-21', 'travel',   'Stockholm',    'manual'),
    (v_org, m_astrid,  '2026-04-22', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_astrid,  '2026-04-23', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_astrid,  '2026-04-24', 'remote',   NULL,           'manual'),
    -- Kari: kontor man–tir, fri ons–fre
    (v_org, m_kari,    '2026-04-20', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_kari,    '2026-04-21', 'office',   'Oslo kontor',  'manual'),
    (v_org, m_kari,    '2026-04-22', 'off',      NULL,           'manual'),
    (v_org, m_kari,    '2026-04-23', 'off',      NULL,           'manual'),
    (v_org, m_kari,    '2026-04-24', 'off',      NULL,           'manual'),
    -- Petter: hjemme man, kunde Drammen tir–tor, hjemme fre
    (v_org, m_petter,  '2026-04-20', 'remote',   NULL,           'manual'),
    (v_org, m_petter,  '2026-04-21', 'customer', 'Drammen',      'manual'),
    (v_org, m_petter,  '2026-04-22', 'customer', 'Drammen',      'manual'),
    (v_org, m_petter,  '2026-04-23', 'customer', 'Drammen',      'manual'),
    (v_org, m_petter,  '2026-04-24', 'remote',   NULL,           'manual'),
    -- Erik: kontor Stockholm man–ons, hjemme tor–fre
    (v_org, m_erik,    '2026-04-20', 'office',   'Stockholm',    'manual'),
    (v_org, m_erik,    '2026-04-21', 'office',   'Stockholm',    'manual'),
    (v_org, m_erik,    '2026-04-22', 'office',   'Stockholm',    'manual'),
    (v_org, m_erik,    '2026-04-23', 'remote',   NULL,           'manual'),
    (v_org, m_erik,    '2026-04-24', 'remote',   NULL,           'manual'),
    -- Sara: hjemme man–ons, kontor tor–fre
    (v_org, m_sara,    '2026-04-20', 'remote',   NULL,           'manual'),
    (v_org, m_sara,    '2026-04-21', 'remote',   NULL,           'manual'),
    (v_org, m_sara,    '2026-04-22', 'remote',   NULL,           'manual'),
    (v_org, m_sara,    '2026-04-23', 'office',   'Stockholm',    'manual'),
    (v_org, m_sara,    '2026-04-24', 'office',   'Stockholm',    'manual'),
    -- Mikael: kontor hele uken
    (v_org, m_mikael,  '2026-04-20', 'office',   'Stockholm',    'manual'),
    (v_org, m_mikael,  '2026-04-21', 'office',   'Stockholm',    'manual'),
    (v_org, m_mikael,  '2026-04-22', 'office',   'Stockholm',    'manual'),
    (v_org, m_mikael,  '2026-04-23', 'office',   'Stockholm',    'manual'),
    (v_org, m_mikael,  '2026-04-24', 'remote',   NULL,           'manual'),
    -- Tomas: kontor Vilnius man–tir+fre, kunde ons–tor
    (v_org, m_tomas,   '2026-04-20', 'office',   'Vilnius',      'manual'),
    (v_org, m_tomas,   '2026-04-21', 'office',   'Vilnius',      'manual'),
    (v_org, m_tomas,   '2026-04-22', 'customer', 'Kaunas',       'manual'),
    (v_org, m_tomas,   '2026-04-23', 'customer', 'Kaunas',       'manual'),
    (v_org, m_tomas,   '2026-04-24', 'office',   'Vilnius',      'manual'),
    -- Ruta: ferie hele uken
    (v_org, m_ruta,    '2026-04-20', 'vacation', NULL,           'manual'),
    (v_org, m_ruta,    '2026-04-21', 'vacation', NULL,           'manual'),
    (v_org, m_ruta,    '2026-04-22', 'vacation', NULL,           'manual'),
    (v_org, m_ruta,    '2026-04-23', 'vacation', NULL,           'manual'),
    (v_org, m_ruta,    '2026-04-24', 'vacation', NULL,           'manual'),
    -- Darius: kontor Vilnius man–ons, hjemme tor–fre
    (v_org, m_darius,  '2026-04-20', 'office',   'Vilnius',      'manual'),
    (v_org, m_darius,  '2026-04-21', 'office',   'Vilnius',      'manual'),
    (v_org, m_darius,  '2026-04-22', 'office',   'Vilnius',      'manual'),
    (v_org, m_darius,  '2026-04-23', 'remote',   NULL,           'manual'),
    (v_org, m_darius,  '2026-04-24', 'remote',   NULL,           'manual'),
    -- James: kontor London man–tir+fre, hjemme ons–tor
    (v_org, m_james,   '2026-04-20', 'office',   'London',       'manual'),
    (v_org, m_james,   '2026-04-21', 'office',   'London',       'manual'),
    (v_org, m_james,   '2026-04-22', 'remote',   NULL,           'manual'),
    (v_org, m_james,   '2026-04-23', 'remote',   NULL,           'manual'),
    (v_org, m_james,   '2026-04-24', 'office',   'London',       'manual'),
    -- Sophie: hjemme hele uken
    (v_org, m_sophie,  '2026-04-20', 'remote',   NULL,           'manual'),
    (v_org, m_sophie,  '2026-04-21', 'remote',   NULL,           'manual'),
    (v_org, m_sophie,  '2026-04-22', 'remote',   NULL,           'manual'),
    (v_org, m_sophie,  '2026-04-23', 'office',   'London',       'manual'),
    (v_org, m_sophie,  '2026-04-24', 'office',   'London',       'manual')
  ON CONFLICT (org_id, member_id, date) DO NOTHING;

END $$;

-- ============================================================
-- ORG EVENTS FOR YEAR WHEEL (2026)
-- Supplement to the events already inserted in 001_initial.sql
-- ============================================================

INSERT INTO events (org_id, title, description, category, start_date, end_date) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Påskeferie',       'Fellesferie påske',              'holiday',    '2026-04-01', '2026-04-06'),
  ('00000000-0000-0000-0000-000000000001', 'Halvårsmøte',      'Halvårsgjennomgang og strategi', 'company',    '2026-06-11', '2026-06-12'),
  ('00000000-0000-0000-0000-000000000001', 'Sommerfest',       'Sommerfest for hele teamet',     'company',    '2026-06-19', '2026-06-19'),
  ('00000000-0000-0000-0000-000000000001', 'Glasstec',         'Messe i Düsseldorf',             'trade_show', '2026-09-22', '2026-09-25'),
  ('00000000-0000-0000-0000-000000000001', 'Produktlansering', 'Lansering av ny produktlinje',   'milestone',  '2026-10-01', '2026-10-01'),
  ('00000000-0000-0000-0000-000000000001', 'Budsjettfrist',    'Budsjettprosess Q4',             'deadline',   '2026-11-15', '2026-11-15'),
  ('00000000-0000-0000-0000-000000000001', 'Kickoff 2027',     'Planlegging av neste år',        'company',    '2027-01-12', '2027-01-14')
ON CONFLICT DO NOTHING;
