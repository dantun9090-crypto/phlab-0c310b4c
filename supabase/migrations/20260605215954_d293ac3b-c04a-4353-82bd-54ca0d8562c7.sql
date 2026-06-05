-- Storage for shared secrets used by pg_cron HTTP calls.
-- Created so the daily security-cleanup cron can pass the
-- x-cleanup-secret header without hard-coding it in SQL.
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.app_config FROM PUBLIC;
REVOKE ALL ON public.app_config FROM anon;
REVOKE ALL ON public.app_config FROM authenticated;
GRANT ALL ON public.app_config TO service_role;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- No policies = no client access. Only service_role (and pg_cron-owner via SECURITY DEFINER if needed) can read.

INSERT INTO public.app_config (key, value)
VALUES ('cleanup_secret', 'SET-ME-MANUALLY')
ON CONFLICT (key) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;