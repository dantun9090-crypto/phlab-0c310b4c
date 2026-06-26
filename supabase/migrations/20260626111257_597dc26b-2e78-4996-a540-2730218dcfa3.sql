select cron.schedule(
  'seo-health-daily-0615',
  '15 6 * * *',
  $cron$
  select net.http_post(
    url := 'https://phlabs.co.uk/api/public/hooks/seo-health-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-watchdog-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);