CREATE INDEX idx_monitor_head_get_log_host ON public.monitor_head_get_log (host);
CREATE INDEX idx_monitor_head_get_log_created_at ON public.monitor_head_get_log (created_at DESC);
CREATE INDEX idx_monitor_head_get_log_had_alert ON public.monitor_head_get_log (had_alert, created_at DESC);