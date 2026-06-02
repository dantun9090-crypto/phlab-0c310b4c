-- pg_net ships SECURITY DEFINER functions. Revoke from anon/authenticated;
-- only postgres (used by the cron job) needs to call them.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA extensions FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA extensions FROM anon, authenticated, PUBLIC;
REVOKE USAGE ON SCHEMA extensions FROM anon, authenticated;