-- Cloud storage is unused in this project (0 buckets, 0 objects); all files live in Firebase Storage.
-- The previous policies denied only bucket 'phlabd' and implicitly allowed client roles on any other bucket.
-- Replace them with policies that grant nothing to anon/authenticated.
DROP POLICY IF EXISTS "phlabd deny all select" ON storage.objects;
DROP POLICY IF EXISTS "phlabd deny all insert" ON storage.objects;
DROP POLICY IF EXISTS "phlabd deny all update" ON storage.objects;
DROP POLICY IF EXISTS "phlabd deny all delete" ON storage.objects;

CREATE POLICY "client roles cannot read storage objects"
  ON storage.objects FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "client roles cannot insert storage objects"
  ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "client roles cannot update storage objects"
  ON storage.objects FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "client roles cannot delete storage objects"
  ON storage.objects FOR DELETE TO anon, authenticated USING (false);