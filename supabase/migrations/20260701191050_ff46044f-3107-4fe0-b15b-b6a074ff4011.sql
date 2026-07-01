
DROP POLICY IF EXISTS "Anon can update monitor alert state" ON public.monitor_alert_state;
DROP POLICY IF EXISTS "Anon can insert monitor alert state" ON public.monitor_alert_state;

CREATE OR REPLACE FUNCTION public.record_monitor_alert(
  _host text,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _host IS NULL OR length(_host) = 0 OR length(_host) > 200 THEN
    RAISE EXCEPTION 'invalid host';
  END IF;
  IF _reason IS NOT NULL AND length(_reason) > 500 THEN
    _reason := substring(_reason, 1, 500);
  END IF;

  INSERT INTO public.monitor_alert_state (host, last_alert_at, last_reason, alerts_sent, updated_at)
  VALUES (_host, now(), _reason, 1, now())
  ON CONFLICT (host) DO UPDATE
    SET last_alert_at = now(),
        last_reason   = EXCLUDED.last_reason,
        alerts_sent   = public.monitor_alert_state.alerts_sent + 1,
        updated_at    = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_monitor_alert(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_monitor_alert(text, text) TO anon, authenticated, service_role;
