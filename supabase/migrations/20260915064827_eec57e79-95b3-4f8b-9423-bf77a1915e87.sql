CREATE TABLE public.lab_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product text NOT NULL,
  label_mg text,
  batch text,
  cap_color text,
  test_date date,
  mass_1 numeric,
  purity_1 numeric,
  mass_2 numeric,
  purity_2 numeric,
  avg_mass numeric GENERATED ALWAYS AS (
    CASE
      WHEN mass_1 IS NOT NULL AND mass_2 IS NOT NULL THEN (mass_1 + mass_2) / 2
      ELSE COALESCE(mass_1, mass_2)
    END
  ) STORED,
  avg_purity numeric GENERATED ALWAYS AS (
    CASE
      WHEN purity_1 IS NOT NULL AND purity_2 IS NOT NULL THEN (purity_1 + purity_2) / 2
      ELSE COALESCE(purity_1, purity_2)
    END
  ) STORED,
  test_link text,
  lab_source text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_tests_purity_1_range CHECK (purity_1 IS NULL OR (purity_1 >= 0 AND purity_1 <= 100)),
  CONSTRAINT lab_tests_purity_2_range CHECK (purity_2 IS NULL OR (purity_2 >= 0 AND purity_2 <= 100))
);

GRANT SELECT ON public.lab_tests TO anon;
GRANT SELECT ON public.lab_tests TO authenticated;
GRANT ALL ON public.lab_tests TO service_role;

ALTER TABLE public.lab_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published lab tests"
  ON public.lab_tests FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

CREATE INDEX lab_tests_product_idx ON public.lab_tests (lower(product));
CREATE INDEX lab_tests_batch_idx ON public.lab_tests (lower(batch));
CREATE INDEX lab_tests_test_date_idx ON public.lab_tests (test_date DESC);
CREATE INDEX lab_tests_public_idx ON public.lab_tests (is_public);

CREATE OR REPLACE FUNCTION public.lab_tests_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER lab_tests_updated_at
  BEFORE UPDATE ON public.lab_tests
  FOR EACH ROW EXECUTE FUNCTION public.lab_tests_set_updated_at();