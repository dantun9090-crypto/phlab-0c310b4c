-- Deny-all RLS policies on storage.objects for the private 'phlabd' bucket.
-- Only service_role (used server-side) can access these files. service_role bypasses RLS,
-- so these policies effectively block all anon/authenticated direct access.

DROP POLICY IF EXISTS "phlabd deny all select" ON storage.objects;
DROP POLICY IF EXISTS "phlabd deny all insert" ON storage.objects;
DROP POLICY IF EXISTS "phlabd deny all update" ON storage.objects;
DROP POLICY IF EXISTS "phlabd deny all delete" ON storage.objects;

CREATE POLICY "phlabd deny all select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id <> 'phlabd');

CREATE POLICY "phlabd deny all insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id <> 'phlabd');

CREATE POLICY "phlabd deny all update"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id <> 'phlabd')
  WITH CHECK (bucket_id <> 'phlabd');

CREATE POLICY "phlabd deny all delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id <> 'phlabd');
