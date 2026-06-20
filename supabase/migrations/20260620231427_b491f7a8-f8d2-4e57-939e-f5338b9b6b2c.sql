select vault.create_secret($cs$cf976960d866fb5807d227b887bbe46369118360b4b342954031413e81b1000b$cs$, 'cleanup_secret', 'Shared secret for /api/public/hooks/* cron endpoints');
select cron.unschedule('wallid-reconcile-5min');
select cron.schedule(
  'wallid-reconcile-5min',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://phlabs.co.uk/api/public/hooks/wallid-reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret' limit 1)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);