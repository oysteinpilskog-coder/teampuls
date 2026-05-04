-- ============================================================
-- Migration 028 — Seed strategy themes for 2026
--
-- Konkrete tema for hvert kvartal 2026 så det nye strategi-
-- årshjulet (#217) ikke står tomt på første visning. Mål er
-- formulert som korte resultatmål — ikke aktivitet — og status
-- speiler en realistisk fordeling (mest «på sporet», ett «risiko»
-- og ett «fullført» tilbake i Q1).
--
-- Seedet for begge CalWin-orgs:
--   00000000-0000-0000-0000-000000000001  Nordic
--   00000000-0000-0000-0000-000000000002  UK
--
-- Idempotent: ON CONFLICT DO NOTHING på UNIQUE(org_id, year, quarter)
-- så denne migrasjonen ikke overskriver tema en admin allerede har
-- lagt inn manuelt.
-- ============================================================

INSERT INTO strategy_themes (org_id, year, quarter, title, goal, status) VALUES
  -- Nordic (Norge / Sverige / Litauen)
  ('00000000-0000-0000-0000-000000000001', 2026, 1,
   'Fundament på plass',
   'Ny core-platform i prod hos alle eksisterende kunder. Onboarding-tid ned fra 6 uker til under 2.',
   'done'),

  ('00000000-0000-0000-0000-000000000001', 2026, 2,
   'Skalering Norden',
   'Tre nye SaaS-kunder signert i Sverige + Finland. MRR opp 35 %. Selvbetjent prøveperiode live.',
   'on_track'),

  ('00000000-0000-0000-0000-000000000001', 2026, 3,
   'Sommerro & resilience',
   'Bemanning kontinuerlig over 60 % gjennom juli. Null kritiske incident-er på vakt-rotasjonen.',
   'at_risk'),

  ('00000000-0000-0000-0000-000000000001', 2026, 4,
   'Plattform & 2027-runway',
   'AI-modul i open beta. Series A-deck ferdig. Budsjett 2027 vedtatt før julefri.',
   'on_track'),

  -- UK
  ('00000000-0000-0000-0000-000000000002', 2026, 1,
   'Bridgehead London',
   'Første tre UK-pilotkunder live. Lokalisert prising og avtaler godkjent av juridisk.',
   'done'),

  ('00000000-0000-0000-0000-000000000002', 2026, 2,
   'Salgsmotor i drift',
   'Outbound-team på fire fullt operativt. Pipeline £1M kvalifisert ARR.',
   'on_track'),

  ('00000000-0000-0000-0000-000000000002', 2026, 3,
   'Kundesuksess-løft',
   'NPS over 40. Renewal-prosess automatisert. Første referansekunde-case publisert.',
   'on_track'),

  ('00000000-0000-0000-0000-000000000002', 2026, 4,
   'Q4-press og Q1-2027',
   'Ti betalende UK-kunder ved årsskiftet. Plan for partnerskap med to systemintegratører.',
   'on_track')
ON CONFLICT (org_id, year, quarter) DO NOTHING;
