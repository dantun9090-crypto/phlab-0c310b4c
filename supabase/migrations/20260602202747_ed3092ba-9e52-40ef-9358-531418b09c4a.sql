-- Move pg_net out of public (Supabase linter 0014). pg_net does not support
-- ALTER EXTENSION ... SET SCHEMA, so drop and recreate it in `extensions`.

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Remove dependent cron job first so DROP EXTENSION succeeds
DO $$
BEGIN
  PERFORM cron.unschedule('prerender-recache-auto');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- Recreate cron job using the new schema
SELECT cron.schedule(
  'prerender-recache-auto',
  '*/15 * * * *',
  $cron$
  SELECT extensions.http_post(
    url := 'https://phlabs.co.uk/api/public/hooks/prerender-recache',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-recache-secret', current_setting('app.prerender_token', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);