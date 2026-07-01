
CREATE TABLE public.monitor_alert_state (
  host text PRIMARY KEY,
  last_alert_at timestamptz NOT NULL DEFAULT now(),
  last_reason text,
  alerts_sent integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.monitor_alert_state TO service_role;
ALTER TABLE public.monitor_alert_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read monitor alert state"
  ON public.monitor_alert_state
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role
  ));
