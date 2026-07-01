
CREATE TABLE public.monitor_head_get_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  host text NOT NULL,
  head_status text,
  get_status text,
  head_attempts int,
  get_attempts int,
  assets_total int,
  assets_ok int,
  has_module_entry boolean,
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  info jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_bundles jsonb NOT NULL DEFAULT '[]'::jsonb,
  html_snippet text,
  had_alert boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'ci',
  run_url text,
  CONSTRAINT monitor_log_host_len CHECK (char_length(host) <= 200),
  CONSTRAINT monitor_log_snippet_len CHECK (html_snippet IS NULL OR char_length(html_snippet) <= 4000),
  CONSTRAINT monitor_log_source_len CHECK (char_length(source) <= 40),
  CONSTRAINT monitor_log_run_url_len CHECK (run_url IS NULL OR char_length(run_url) <= 500)
);

CREATE INDEX monitor_head_get_log_created_at_idx ON public.monitor_head_get_log (created_at DESC);
CREATE INDEX monitor_head_get_log_host_created_at_idx ON public.monitor_head_get_log (host, created_at DESC);
CREATE INDEX monitor_head_get_log_had_alert_idx ON public.monitor_head_get_log (had_alert, created_at DESC) WHERE had_alert;

GRANT SELECT ON public.monitor_head_get_log TO authenticated;
GRANT INSERT ON public.monitor_head_get_log TO anon, authenticated;
GRANT ALL ON public.monitor_head_get_log TO service_role;

ALTER TABLE public.monitor_head_get_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read monitor logs"
  ON public.monitor_head_get_log
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role
  ));

CREATE POLICY "Anon can insert monitor log rows"
  ON public.monitor_head_get_log
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(host) BETWEEN 4 AND 200
    AND pg_column_size(alerts) < 4000
    AND pg_column_size(info) < 4000
    AND pg_column_size(missing_bundles) < 4000
    AND (html_snippet IS NULL OR char_length(html_snippet) <= 4000)
  );

CREATE OR REPLACE FUNCTION public.prune_monitor_head_get_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.monitor_head_get_log
   WHERE created_at < now() - interval '30 days';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_prune_monitor_head_get_log
AFTER INSERT ON public.monitor_head_get_log
FOR EACH STATEMENT
EXECUTE FUNCTION public.prune_monitor_head_get_log();
