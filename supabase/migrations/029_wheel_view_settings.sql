-- ============================================================
-- Migration 029 — Wheel view settings
--
-- Den eksisterende «events»-fanen på årshjulet var hardkodet
-- som alltid synlig. Nå kan admin styre alle fire fanene
-- (events, strategy, birthdays, anniversaries) fra ett sted —
-- /settings/wheel — og velge hvilken som åpnes som standard.
--
-- Nye kolonner på organizations:
--   events_enabled       BOOLEAN, default TRUE — kill switch for
--                        hovedfanen «Hendelser» (firmahendelser,
--                        merkedager, kollektive perioder).
--   wheel_default_view   TEXT, default 'events' — hvilken fane som
--                        åpnes når man besøker /wheel uten ?view=.
--                        Verdier matcher WheelView i koden:
--                        'events' | 'strategy' | 'birthdays' | 'anniversaries'.
--                        WheelShell faller tilbake til en aktiv fane
--                        hvis lagret default er slått av.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS events_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wheel_default_view TEXT NOT NULL DEFAULT 'events'
    CHECK (wheel_default_view IN ('events', 'strategy', 'birthdays', 'anniversaries'));
