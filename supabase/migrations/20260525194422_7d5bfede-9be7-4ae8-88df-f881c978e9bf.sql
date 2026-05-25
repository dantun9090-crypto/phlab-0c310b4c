
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Anyone can record analytics events" ON public.analytics_events;

CREATE POLICY "Anyone can record valid analytics events"
  ON public.analytics_events FOR INSERT
  WITH CHECK (
    event_type IS NOT NULL
    AND length(event_type) BETWEEN 1 AND 100
    AND (path IS NULL OR length(path) <= 2048)
    AND (user_agent IS NULL OR length(user_agent) <= 1024)
  );
