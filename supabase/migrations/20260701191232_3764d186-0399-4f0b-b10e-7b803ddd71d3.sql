
ALTER TABLE public.monitor_head_get_log
  ADD COLUMN IF NOT EXISTS head_duration_ms integer,
  ADD COLUMN IF NOT EXISTS get_duration_ms integer,
  ADD COLUMN IF NOT EXISTS html_bytes integer,
  ADD COLUMN IF NOT EXISTS head_headers jsonb,
  ADD COLUMN IF NOT EXISTS get_headers jsonb,
  ADD COLUMN IF NOT EXISTS asset_samples jsonb;
