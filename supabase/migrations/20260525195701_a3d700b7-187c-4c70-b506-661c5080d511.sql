-- 1. Harden has_role: explicit search_path, revoke broad execute, grant to api roles only
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

-- 2. Tighten analytics_events INSERT: scope to anon/authenticated, keep payload bounds
DROP POLICY IF EXISTS "Anyone can record valid analytics events" ON public.analytics_events;

CREATE POLICY "Clients can record valid analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_type IS NOT NULL
  AND length(event_type) BETWEEN 1 AND 100
  AND (path IS NULL OR length(path) <= 2048)
  AND (user_agent IS NULL OR length(user_agent) <= 1024)
  AND (metadata IS NULL OR pg_column_size(metadata) <= 4096)
);
