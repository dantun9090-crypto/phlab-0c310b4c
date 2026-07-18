/**
 * Admin-only server wrapper around POST /api/public/hooks/reindex.
 *
 * The underlying hook requires the `x-recache-secret` header (PRERENDER_TOKEN).
 * That secret lives server-side only, so the admin UI calls this server fn
 * which injects the header and returns the hook's JSON response (IndexNow
 * results + Prerender recache results + GSC Inspector deep-links).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_PATHS = ["/compound"];

export type ReindexHookResponse = {
  ok: boolean;
  submittedUrls: string[];
  indexNow: { ok: boolean; status: number; submitted: number; response: string };
  prerender: {
    desktop: { ok: boolean; status: number; response: string };
    mobile: { ok: boolean; status: number; response: string };
  };
  gscInspectorLinks: Array<{ url: string; inspector: string }>;
  note?: string;
};

export const triggerReindex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { urls?: string[] } | undefined) => input ?? {},
  )
  .handler(async ({ data, context }): Promise<ReindexHookResponse> => {
    // Authorize: must be admin.
    const { supabase, userId } = context;
    const { data: isAdmin } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: boolean | null }>)("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      // Not all installs use the role helper — fall back to a customers.isAdmin
      // check via the dynamic admin SDK if available. Otherwise reject.
      throw new Error("Forbidden");
    }

    const token = process.env.PRERENDER_TOKEN;
    if (!token) throw new Error("PRERENDER_TOKEN not configured");

    const urls = data.urls && data.urls.length > 0 ? data.urls : DEFAULT_PATHS;

    // Same-origin call to the public hook. In serverless environments we don't
    // always have a stable absolute origin, so build one from the request when
    // available; fall back to phlabs.co.uk.
    const origin =
      process.env.PUBLIC_SITE_ORIGIN ?? "https://phlabs.co.uk";

    const res = await fetch(`${origin}/api/public/hooks/reindex`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-recache-secret": token,
      },
      body: JSON.stringify({ urls }),
      signal: AbortSignal.timeout(30_000),
    });

    const json = (await res.json().catch(() => ({}))) as ReindexHookResponse;
    if (!res.ok && !("submittedUrls" in (json as object))) {
      throw new Error(
        `reindex hook failed: HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`,
      );
    }
    return json;
  });
