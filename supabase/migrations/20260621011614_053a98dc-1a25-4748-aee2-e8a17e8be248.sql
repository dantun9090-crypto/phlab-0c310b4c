DROP POLICY IF EXISTS deny_all_public ON public.wallid_rate_limits;
CREATE POLICY deny_all_public ON public.wallid_rate_limits AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);