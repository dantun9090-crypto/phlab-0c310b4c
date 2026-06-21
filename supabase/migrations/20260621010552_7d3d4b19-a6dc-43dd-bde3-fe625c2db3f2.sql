-- Composite idempotency key for Wallid webhook events.
-- Loosens uniqueness from (event_id) alone to (event_id, api_payment_id),
-- so an event_id recycled across distinct payments isn't falsely deduped.
-- COALESCE backfills NULL api_payment_id with event_id (the existing fallback
-- the webhook code uses), so historical LOG rows and null-keyed rows remain
-- uniquely indexed and dedup behavior stays identical for them.

-- 1. Drop the old single-column unique (was both a constraint and supporting index).
ALTER TABLE public.wallid_webhook_events
  DROP CONSTRAINT IF EXISTS wallid_webhook_events_event_id_key;

DROP INDEX IF EXISTS public.wallid_webhook_events_event_id_key;

-- 2. Composite unique using COALESCE so NULL api_payment_id falls back to event_id.
--    Implemented as a UNIQUE INDEX (only form Postgres accepts for expressions).
CREATE UNIQUE INDEX IF NOT EXISTS wallid_webhook_events_composite_key
  ON public.wallid_webhook_events (event_id, COALESCE(api_payment_id, event_id));

-- 3. Helper lookup index for the audit-trail join we do on duplicate insert.
CREATE INDEX IF NOT EXISTS wallid_webhook_events_event_id_lookup
  ON public.wallid_webhook_events (event_id);
