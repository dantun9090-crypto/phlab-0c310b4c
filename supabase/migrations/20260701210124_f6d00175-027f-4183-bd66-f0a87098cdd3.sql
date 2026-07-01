-- Fix 1: Remove anon SELECT on monitor_alert_state
DROP POLICY IF EXISTS "Anon can read monitor alert state" ON public.monitor_alert_state;
REVOKE SELECT ON public.monitor_alert_state FROM anon;

-- Fix 2: Recreate summary view with security_invoker so RLS of querying user applies
DROP VIEW IF EXISTS public.monitor_head_get_summary;
CREATE VIEW public.monitor_head_get_summary
WITH (security_invoker = true) AS
SELECT DISTINCT ON (host) host,
    created_at AS last_checked_at,
    get_status AS last_get_status,
    head_status AS last_head_status,
    had_alert AS last_had_alert,
    missing_bundles AS last_missing_bundles,
    run_url AS last_run_url,
    source AS last_source,
    head_duration_ms AS last_head_ms,
    get_duration_ms AS last_get_ms,
    html_bytes AS last_html_bytes,
    assets_total AS last_assets_total,
    assets_ok AS last_assets_ok,
    has_module_entry AS last_has_module_entry,
    alerts AS last_alerts
FROM public.monitor_head_get_log
ORDER BY host, created_at DESC;

GRANT SELECT ON public.monitor_head_get_summary TO authenticated;
GRANT ALL ON public.monitor_head_get_summary TO service_role;