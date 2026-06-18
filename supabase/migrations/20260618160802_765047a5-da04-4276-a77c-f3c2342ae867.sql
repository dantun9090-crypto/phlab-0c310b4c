
CREATE TABLE public.wallid_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL,
  api_payment_id TEXT,
  payment_link TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'pending',
  customer_email TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX wallid_payments_order_id_idx ON public.wallid_payments (order_id);
CREATE INDEX wallid_payments_api_payment_id_idx ON public.wallid_payments (api_payment_id);

GRANT ALL ON public.wallid_payments TO service_role;

ALTER TABLE public.wallid_payments ENABLE ROW LEVEL SECURITY;

-- No client policies: this table is only accessed server-side via service role
-- from the /api/payments/* routes. RLS is enabled with no policies so any
-- direct anon/authenticated access is denied by default.

CREATE OR REPLACE FUNCTION public.wallid_payments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER wallid_payments_updated_at
BEFORE UPDATE ON public.wallid_payments
FOR EACH ROW EXECUTE FUNCTION public.wallid_payments_set_updated_at();

CREATE TABLE IF NOT EXISTS public.wallid_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallid_rate_limits_ip_created_idx
  ON public.wallid_rate_limits (ip, created_at DESC);

GRANT ALL ON public.wallid_rate_limits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.wallid_rate_limits_id_seq TO service_role;

ALTER TABLE public.wallid_rate_limits ENABLE ROW LEVEL SECURITY;
