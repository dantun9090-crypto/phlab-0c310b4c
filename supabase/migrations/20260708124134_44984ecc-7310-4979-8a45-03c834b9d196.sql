DO $$
BEGIN
  PERFORM cron.unschedule('prerender-recache-auto');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'prerender-recache-auto',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://phlabs.co.uk/api/public/hooks/prerender-recache',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-recache-secret', current_setting('app.prerender_token', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);