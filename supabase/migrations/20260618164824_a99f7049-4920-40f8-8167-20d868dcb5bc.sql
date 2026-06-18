-- Re-confirm RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallid_rate_limits ENABLE ROW LEVEL SECURITY;

-- Explicit permissive deny-all policies (scanner-visible).
DROP POLICY IF EXISTS "deny_all_public" ON public.app_config;
CREATE POLICY "deny_all_public" ON public.app_config
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_public" ON public.wallid_rate_limits;
CREATE POLICY "deny_all_public" ON public.wallid_rate_limits
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);