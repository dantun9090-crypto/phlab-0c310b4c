
CREATE TABLE public.wallid_webhook_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  api_payment_id text,
  order_id text,
  original_processed_at timestamptz,
  duplicate_received_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  payload_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallid_webhook_duplicates_event_id_idx ON public.wallid_webhook_duplicates(event_id);
CREATE INDEX wallid_webhook_duplicates_created_at_idx ON public.wallid_webhook_duplicates(created_at DESC);

GRANT ALL ON public.wallid_webhook_duplicates TO service_role;
ALTER TABLE public.wallid_webhook_duplicates ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_public ON public.wallid_webhook_duplicates AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.wallid_alert_state (
  alert_type text PRIMARY KEY,
  active boolean NOT NULL DEFAULT false,
  last_count integer NOT NULL DEFAULT 0,
  first_alert_at timestamptz,
  last_alert_at timestamptz,
  last_resolved_at timestamptz,
  last_digest_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.wallid_alert_state TO service_role;
ALTER TABLE public.wallid_alert_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_public ON public.wallid_alert_state AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
