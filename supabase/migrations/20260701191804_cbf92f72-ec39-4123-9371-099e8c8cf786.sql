ALTER TABLE public.monitor_head_get_log
  ALTER COLUMN run_url SET DEFAULT '',
  ALTER COLUMN run_url SET NOT NULL;

ALTER TABLE public.monitor_head_get_log
  ADD CONSTRAINT uq_monitor_head_get_log_run_host
  UNIQUE (run_url, host);