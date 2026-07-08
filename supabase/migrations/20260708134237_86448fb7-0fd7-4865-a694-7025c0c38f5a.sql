CREATE TABLE IF NOT EXISTS public.wallid_webhook_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  route text NOT NULL DEFAULT '/api/webhooks/wallid',
  ip text,
  user_agent text,
  sig_header_name text,
  timestamp_header text,
  event_id_header text,
  event_count integer,
  content_length integer,
  outcome text NOT NULL,
  http_status integer NOT NULL,
  duration_ms integer NOT NULL,
  error_message text,
  notes jsonb
);

GRANT ALL ON public.wallid_webhook_attempts TO service_role;

ALTER TABLE public.wallid_webhook_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallid_webhook_attempts service role only" ON public.wallid_webhook_attempts;
CREATE POLICY "wallid_webhook_attempts service role only"
  ON public.wallid_webhook_attempts FOR ALL
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS wallid_webhook_attempts_received_at_desc
  ON public.wallid_webhook_attempts (received_at DESC);
CREATE INDEX IF NOT EXISTS wallid_webhook_attempts_outcome
  ON public.wallid_webhook_attempts (outcome, received_at DESC);