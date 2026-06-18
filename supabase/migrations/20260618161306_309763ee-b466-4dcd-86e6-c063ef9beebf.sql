
CREATE TABLE public.wallid_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  api_payment_id TEXT,
  order_id TEXT,
  status TEXT,
  occurred_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX wallid_webhook_events_order_id_idx ON public.wallid_webhook_events (order_id);
CREATE INDEX wallid_webhook_events_api_payment_id_idx ON public.wallid_webhook_events (api_payment_id);

GRANT ALL ON public.wallid_webhook_events TO service_role;

ALTER TABLE public.wallid_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: server-only via service_role.
