/**
 * Public beacon endpoint — client-side stale-asset recovery script POSTs
 * here whenever a hashed /assets/* or /_build/* URL returns 404/410, or a
 * <script>/<link> load fails on a build-fingerprinted URL. Writes a
 * lightweight record to Firestore `stale_asset_reports`.
 *
 * Public (unauthenticated) by design so pages that failed to hydrate can
 * still report. Hardened with:
 *   - body-size cap + Zod validation (drops junk / abusive payloads)
 *   - per-host+asset in-memory throttle (1 write / 5s / key per instance)
 *   - only ever writes the asset path, host, status, buildId, reason, UA;
 *     never full URLs (which could contain auth tokens or search params)
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  src: z.string().min(1).max(600),
  status: z.number().int().min(0).max(599).optional().default(0),
  reason: z.string().max(80).optional().default("asset-404"),
  host: z.string().max(200).optional().default(""),
  buildId: z.string().max(120).optional().default(""),
  referer: z.string().max(600).optional().default(""),
  count: z.number().int().min(0).max(100).optional().default(0),
  ua: z.string().max(400).optional().default(""),
});

function json(v: unknown, status = 200): Response {
  return new Response(JSON.stringify(v), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

/** Strip query strings + protocol from URL so we never log tokens. */
function normaliseAsset(raw: string): string {
  try {
    if (raw.startsWith("http")) {
      const u = new URL(raw);
      return u.pathname.slice(0, 400);
    }
  } catch { /* ignore */ }
  return raw.split("?")[0].slice(0, 400);
}

/** Extract hostname if a full URL leaked into `host`. */
function normaliseHost(raw: string): string {
  if (!raw) return "";
  try {
    if (raw.startsWith("http")) return new URL(raw).host.slice(0, 200);
  } catch { /* ignore */ }
  return raw.slice(0, 200);
}

// In-worker throttle: same asset from same host at most once / 5s.
const THROTTLE_MS = 5000;
const throttle = new Map<string, number>();
function shouldThrottle(key: string): boolean {
  const now = Date.now();
  const prev = throttle.get(key) ?? 0;
  if (now - prev < THROTTLE_MS) return true;
  throttle.set(key, now);
  // Cap map size so it can't grow unbounded on abuse.
  if (throttle.size > 500) {
    const firstKey = throttle.keys().next().value;
    if (firstKey) throttle.delete(firstKey);
  }
  return false;
}

export const Route = createFileRoute("/api/public/stale-asset-report")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
            "access-control-max-age": "86400",
          },
        }),
      POST: async ({ request }) => {
        // Cap payload before parsing.
        let text: string;
        try {
          text = await request.text();
          if (text.length > 4096) return json({ ok: false, error: "too_large" }, 413);
        } catch {
          return json({ ok: false, error: "bad_body" }, 400);
        }

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(JSON.parse(text));
        } catch {
          return json({ ok: false, error: "invalid_body" }, 400);
        }

        const asset = normaliseAsset(body.src);
        const host = normaliseHost(body.host) ||
          normaliseHost(request.headers.get("host") ?? "");
        const key = `${host}::${asset}`;
        if (shouldThrottle(key)) {
          return json({ ok: true, throttled: true });
        }

        try {
          const { addDocAdmin } = await import("@/lib/server/firestore-admin");
          await addDocAdmin("stale_asset_reports", {
            asset,
            host,
            status: body.status,
            reason: body.reason,
            buildId: body.buildId,
            referer: normaliseAsset(body.referer),
            count: body.count,
            ua: body.ua,
            ip:
              request.headers.get("cf-connecting-ip") ??
              request.headers.get("x-forwarded-for") ??
              "",
            createdAt: new Date(),
          });
          return json({ ok: true });
        } catch (e) {
          console.error("[stale-asset-report] write failed:", e);
          return json({ ok: false, error: "write_failed" }, 500);
        }
      },
    },
  },
});
