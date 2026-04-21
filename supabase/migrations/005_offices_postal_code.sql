-- ============================================================
-- Add postal_code column to offices for precise auto-geocoding.
-- (Nominatim returns far better hits when given a postal code.)
-- ============================================================

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS postal_code text;
