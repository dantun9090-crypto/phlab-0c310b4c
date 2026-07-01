CREATE TABLE public.firestore_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_name text UNIQUE,
  run_id text NOT NULL UNIQUE,
  output_uri_prefix text NOT NULL,
  collection_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','DONE','FAILED')),
  triggered_by text NOT NULL DEFAULT 'cron',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX firestore_backups_started_at_idx ON public.firestore_backups (started_at DESC);
CREATE INDEX firestore_backups_status_idx ON public.firestore_backups (status);

GRANT ALL ON public.firestore_backups TO service_role;

ALTER TABLE public.firestore_backups ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: all access goes through service_role in server routes.
CREATE POLICY "service role manages firestore_backups"
  ON public.firestore_backups
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
