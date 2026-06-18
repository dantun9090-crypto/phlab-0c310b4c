-- Ensure RLS is enabled on all sensitive tables
ALTER TABLE public.wallid_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallid_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallid_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Revoke any public privileges (defense-in-depth; service_role bypasses RLS)
REVOKE ALL ON public.wallid_payments FROM anon, authenticated;
REVOKE ALL ON public.wallid_webhook_events FROM anon, authenticated;
REVOKE ALL ON public.wallid_rate_limits FROM anon, authenticated;
REVOKE ALL ON public.app_config FROM anon, authenticated;

-- Make sure service_role retains full access for server-side code
GRANT ALL ON public.wallid_payments TO service_role;
GRANT ALL ON public.wallid_webhook_events TO service_role;
GRANT ALL ON public.wallid_rate_limits TO service_role;
GRANT ALL ON public.app_config TO service_role;
GRANT ALL ON public.analytics_events TO service_role;

-- wallid_payments: Access restricted to service_role only
DROP POLICY IF EXISTS "deny_all_public" ON public.wallid_payments;
CREATE POLICY "deny_all_public" ON public.wallid_payments
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- wallid_webhook_events: Access restricted to service_role only
DROP POLICY IF EXISTS "deny_all_public" ON public.wallid_webhook_events;
CREATE POLICY "deny_all_public" ON public.wallid_webhook_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- wallid_rate_limits: Access restricted to service_role only
DROP POLICY IF EXISTS "deny_all_public" ON public.wallid_rate_limits;
CREATE POLICY "deny_all_public" ON public.wallid_rate_limits
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- app_config: Access restricted to service_role only
DROP POLICY IF EXISTS "deny_all_public" ON public.app_config;
CREATE POLICY "deny_all_public" ON public.app_config
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- analytics_events: explicit deny on SELECT/UPDATE/DELETE; keep existing INSERT policy
DROP POLICY IF EXISTS "deny_select_public" ON public.analytics_events;
CREATE POLICY "deny_select_public" ON public.analytics_events
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_update_public" ON public.analytics_events;
CREATE POLICY "deny_update_public" ON public.analytics_events
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_delete_public" ON public.analytics_events;
CREATE POLICY "deny_delete_public" ON public.analytics_events
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);