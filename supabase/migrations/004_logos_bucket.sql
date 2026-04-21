-- ============================================================
-- Public 'logos' storage bucket for organization logos.
-- - Public read (CDN-servable)
-- - Only admins of the org can upload/update/delete
-- - File path convention: <org_id>/<filename>
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  5242880,  -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop policies first so migration is idempotent
DROP POLICY IF EXISTS "logos_read" ON storage.objects;
DROP POLICY IF EXISTS "logos_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "logos_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "logos_admin_delete" ON storage.objects;

-- Public read
CREATE POLICY "logos_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

-- Admins of the org (= first path segment) can write
CREATE POLICY "logos_admin_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND current_user_is_admin((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "logos_admin_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND current_user_is_admin((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "logos_admin_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'logos'
    AND current_user_is_admin((storage.foldername(name))[1]::uuid)
  );
