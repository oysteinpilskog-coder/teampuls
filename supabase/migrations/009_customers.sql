-- ============================================================
-- Migration 007 — Customers registry
--
-- Before: customer visits were recorded as free text in
-- entries.location_label ("Diplomat", "Oslo sentrum", …). The map
-- tried to resolve them against a city dictionary / Nominatim,
-- which fails for customer names and picks wrong cities when
-- names are ambiguous ("Newcastle" → Australia).
--
-- After: the org maintains a small customer registry with
-- geocoded lat/lng. The map resolver checks customers first,
-- so "Diplomat" renders on the customer's real address.
--
-- Mirrors the `offices` shape closely for UI consistency.
-- ============================================================

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name text NOT NULL,              -- "Diplomat", "Nordea Liv", …
  address text,
  city text,
  postal_code text,
  country_code text,               -- ISO 3166-1 alpha-2

  latitude numeric(9, 6),
  longitude numeric(9, 6),

  -- Optional free-text aliases the AI / resolver should match in
  -- addition to `name` (handles short codes, misspellings, etc.)
  aliases text[] NOT NULL DEFAULT '{}',

  notes text,

  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Two customers with the same name inside one org would make
  -- resolver matches ambiguous.
  UNIQUE (org_id, name)
);

CREATE INDEX idx_customers_org_id ON customers(org_id);
CREATE INDEX idx_customers_org_name ON customers(org_id, lower(name));

CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS mirrors offices: every member of the org can read; only
-- admins can write. Customer addresses are often sensitive.
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_read ON customers FOR SELECT
  USING (org_id = ANY(current_user_org_ids()));

CREATE POLICY customers_write ON customers FOR ALL
  USING (current_user_is_admin(org_id));
