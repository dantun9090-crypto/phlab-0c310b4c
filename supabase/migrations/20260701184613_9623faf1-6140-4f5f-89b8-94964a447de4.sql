
REVOKE EXECUTE ON FUNCTION public.prune_monitor_head_get_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_monitor_head_get_log() TO service_role;
