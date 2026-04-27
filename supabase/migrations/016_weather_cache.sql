-- ============================================================
-- Migration 016 — Weather cache
--
-- 30-minutters cache av Open-Meteo-respons. Per "lat,lng" rundet
-- til 2 desimaler (~1.1km presisjon, mer enn nok for ikon+grader
-- på TV-dashboardet) — så Oslo-sentrum-kontorer deler én rad.
--
-- Skriving skjer kun fra serverside-ruta /api/weather med
-- service-role; klienten leser aldri direkte fra denne tabellen,
-- så ingen RLS-policy. Tabellen står bare som en "lazy KV-cache"
-- som unngår å hamre Open-Meteo med samme koordinat.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.weather_cache (
  location_key text PRIMARY KEY,
  data         jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weather_cache_fetched_idx
  ON public.weather_cache(fetched_at);

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;
