CREATE INDEX idx_monitor_head_get_log_missing_bundles_gin
  ON public.monitor_head_get_log USING GIN (missing_bundles);

CREATE INDEX idx_monitor_head_get_log_alerts_gin
  ON public.monitor_head_get_log USING GIN (alerts);