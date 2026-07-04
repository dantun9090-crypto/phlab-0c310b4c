/**
 * Temporary debug endpoint — lists Sentry unresolved issues.
 * Protected by SENTRY_PEEK_SECRET header. REMOVE after use.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/_sentry-peek")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.SENTRY_PEEK_SECRET;
        const token = process.env.SENTRY_AUTH_TOKEN;
        const provided = request.headers.get("x-peek-secret");
        if (!secret || !token || provided !== secret) {
          return new Response("nope", { status: 404 });
        }
        const url = new URL(request.url);
        const statsPeriod = url.searchParams.get("statsPeriod") || "30d";
        const limit = url.searchParams.get("limit") || "100";

        async function sf(path: string) {
          const r = await fetch(`https://sentry.io/api/0${path}`, {
            headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          });
          return { status: r.status, body: await r.text() };
        }

        const orgs = await sf("/organizations/");
        let orgSlug = "";
        try {
          orgSlug = JSON.parse(orgs.body)[0]?.slug || "";
        } catch { /* */ }
        if (!orgSlug) return Response.json({ error: "no org", orgs });

        const qs = new URLSearchParams({
          project: "4511662778286160",
          statsPeriod,
          limit,
          query: "is:unresolved",
          sort: "freq",
        });
        const issues = await sf(`/organizations/${orgSlug}/issues/?${qs}`);
        return new Response(issues.body, {
          status: issues.status,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
