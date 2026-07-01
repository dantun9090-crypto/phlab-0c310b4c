
CREATE POLICY "Anon can read monitor alert state"
  ON public.monitor_alert_state
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert monitor alert state"
  ON public.monitor_alert_state
  FOR INSERT
  TO anon
  WITH CHECK (
    length(host) <= 200
    AND (last_reason IS NULL OR length(last_reason) <= 500)
    AND alerts_sent >= 0 AND alerts_sent <= 1000000
  );

CREATE POLICY "Anon can update monitor alert state"
  ON public.monitor_alert_state
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    length(host) <= 200
    AND (last_reason IS NULL OR length(last_reason) <= 500)
    AND alerts_sent >= 0 AND alerts_sent <= 1000000
  );
