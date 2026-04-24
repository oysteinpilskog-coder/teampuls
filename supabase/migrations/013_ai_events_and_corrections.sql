-- ============================================================
-- Migration 013 — AI category inference: event status, entry
-- confidence, and corrections learning loop.
--
-- Three changes land together because they ship the same feature
-- ("AI picks the right category exceptionally well"):
--
-- 1. entry_status gains a new value 'event' — messer, konferanser,
--    kurs, kickoffs. Previously these were crammed into 'customer'
--    or 'travel' and lost the visual distinction.
--
-- 2. entries gains a nullable 'confidence' column (0..1). Manual
--    entries stay NULL; AI-written entries carry the parser's
--    confidence so the UI can show a subtle "?" marker when the
--    assistant wasn't sure. This lets us write ALWAYS rather than
--    dropping low-confidence parses on the floor — the user sees
--    something and can correct it, instead of blank cells.
--
-- 3. ai_corrections logs every time a user edits an AI-written cell
--    into something materially different. The parser few-shots from
--    the org's recent corrections so it gets better week by week
--    without prompt edits or fine-tuning.
-- ============================================================

-- ── 1. Add 'event' to entry_status enum ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'entry_status' AND e.enumlabel = 'event'
  ) THEN
    ALTER TYPE entry_status ADD VALUE 'event';
  END IF;
END $$;

-- ── 2. Allow 'event' in members.default_status check ─────────
-- The per-member default must mirror the enum. Drop & recreate the
-- CHECK constraint since we can't edit it in place.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.members'::regclass
    AND pg_get_constraintdef(oid) ILIKE '%default_status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE members DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE members
  ADD CONSTRAINT members_default_status_check
  CHECK (default_status IS NULL OR default_status IN (
    'office', 'remote', 'customer', 'event', 'travel',
    'vacation', 'sick', 'off'
  ));

-- ── 3. entries.confidence (0..1, NULL = manual) ──────────────
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS confidence numeric(3, 2)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

COMMENT ON COLUMN entries.confidence IS
  'AI parser confidence 0..1. NULL for manual edits. UI shows a "?" marker when < 0.7.';

-- ── 4. ai_corrections: learn from user edits to AI entries ───
--
-- When a user edits an entry whose source is 'ai_web' or 'ai_email'
-- AND the status or location actually changes, we insert a row here.
-- The parser fetches the last ~20 corrections per org and slots them
-- into the prompt as few-shot examples — so "messe" being mistagged
-- as 'customer' today becomes 'event' tomorrow, automatically.
CREATE TABLE IF NOT EXISTS ai_corrections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,

  -- The raw AI input that produced the entry being corrected.
  -- Stored verbatim so the model can recognize the same phrasing.
  input_text text NOT NULL,

  -- What the AI wrote
  ai_status text,
  ai_location text,

  -- What the human corrected it to
  corrected_status text NOT NULL,
  corrected_location text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_corrections_org_created
  ON ai_corrections(org_id, created_at DESC);

ALTER TABLE ai_corrections ENABLE ROW LEVEL SECURITY;

-- Read: any member of the org can see corrections (for settings / debug).
CREATE POLICY ai_corrections_read ON ai_corrections FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM members WHERE user_id = auth.uid()
    )
  );

-- Insert: any member of the org. Service role bypasses RLS, which is
-- what the /api/ai/parse route uses.
CREATE POLICY ai_corrections_insert ON ai_corrections FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM members WHERE user_id = auth.uid()
    )
  );
