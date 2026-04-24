-- ============================================================
-- Migration 014 — Dashboard display preferences (privacy + loop)
--
-- Two prefs that shape what the public TV dashboard shows:
--
-- 1. dashboard_show_sick (BOOLEAN, default TRUE)
--      Privacy toggle. A TV in reception exposes health data to
--      anyone walking by — some orgs will want "sick" collapsed
--      into "off" so viewers only see someone is away, not why.
--      Default TRUE preserves current behaviour; admins opt out.
--
-- 2. dashboard_rotation_views (TEXT[], default all five)
--      Which of the rotating dashboard views should appear in the
--      auto-rotate carousel. View keys match dashboard-client.tsx:
--        A = Nå, B = Uken, C = Kontorer, D = Kunder, E = Årshjul
--      An org that never has customer visits on the map can drop
--      'D' so the screen doesn't loop through an empty view. An
--      empty array falls back to the full set client-side so we
--      never show a blank screen.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS dashboard_show_sick BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS dashboard_rotation_views TEXT[]
    NOT NULL DEFAULT ARRAY['A', 'B', 'C', 'D', 'E']::TEXT[]
    CHECK (
      dashboard_rotation_views <@ ARRAY['A', 'B', 'C', 'D', 'E']::TEXT[]
    );
