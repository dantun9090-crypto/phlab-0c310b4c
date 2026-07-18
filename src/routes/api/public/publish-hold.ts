/**
 * Publish-hold flag endpoint.
 *
 * Called by the canary workflow when the failure/boot-bad threshold is
 * sustained across the rolling window — writes a Firestore doc under
 * `publish_hold/{buildId}` so the admin UI can surface "current build is
 * flagged, avoid re-publish" and downstream automation (release workflow)
 * can refuse to promote a held build.
 *
 * Auth: HMAC-SHA256 over the raw body, keyed by PUBLISH_HOLD_SECRET.
 *   header: x-phl-signature: sha256=<hex>
 *
 * Body:
 *   { buildId: string, reason: string, source: "canary"|"manual",
 *     bootBadInWindow?: number, failuresInWindow?: number, hold: boolean }
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { addDocAdmin, getDocAdmin, listDocsAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import { selectLatestActiveHold, type PublishHoldRow } from "@/lib/publish-hold-select";


const Body = z.object({
  buildId: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(500),
  source: z.enum(["canary", "manual"]),
  bootBadInWindow: z.number().int().nonnegative().optional(),
  failuresInWindow: z.number().int().nonnegative().optional(),
  hold: z.boolean(),
});

function verify(sig: string | null, body: string): boolean {
  const secret = process.env.PUBLISH_HOLD_SECRET;
  if (!secret || !sig) return false;
  const [alg, hex] = sig.split("=");
  if (alg !== "sha256" || !hex) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(hex, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

function json(v: unknown, status = 200): Response {
  return new Response(JSON.stringify(v), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/publish-hold")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!verify(request.headers.get("x-phl-signature"), raw)) {
          return json({ error: "bad_signature" }, 401);
        }
        let parsed;
        try {
          parsed = Body.parse(JSON.parse(raw));
        } catch (err) {
          console.warn("[publish-hold] invalid input", err);
          return json({ error: "invalid_input" }, 400);
        }
        const now = new Date().toISOString();
        const docId = parsed.buildId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
        try {
          const existing = await getDocAdmin("publish_hold", docId);
          const payload = {
            buildId: parsed.buildId,
            reason: parsed.reason,
            source: parsed.source,
            hold: parsed.hold,
            bootBadInWindow: parsed.bootBadInWindow ?? 0,
            failuresInWindow: parsed.failuresInWindow ?? 0,
            updatedAt: now,
            createdAt: existing?.createdAt || now,
          } as Record<string, unknown>;
          if (existing) {
            await updateDocAdmin("publish_hold", docId, payload);
          } else {
            await addDocAdmin("publish_hold", payload, docId);
          }
          return json({ ok: true, buildId: parsed.buildId, hold: parsed.hold });
        } catch (err) {
          console.error("[publish-hold] write failed", err);
          return json({ error: "write_failed" }, 500);
        }
      },
      GET: async ({ request }) => {
        // Public read: admin UI + release pipeline poll this.
        // - ?buildId=X       → single doc status
        // - (no params)      → latest active holds (for the admin banner)
        const url = new URL(request.url);
        const buildId = url.searchParams.get("buildId");
        if (buildId) {
          const docId = buildId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
          try {
            const doc = await getDocAdmin("publish_hold", docId);
            return json({ ok: true, buildId, hold: !!doc?.hold, doc: doc ?? null });
          } catch {
            return json({ ok: true, buildId, hold: false, doc: null });
          }
        }
        try {
          const rows = (await listDocsAdmin("publish_hold", {
            orderBy: "updatedAt",
            direction: "DESCENDING",
            limit: 10,
          })) as PublishHoldRow[];
          return json({ ok: true, ...selectLatestActiveHold(rows) });
        } catch (err) {
          console.error("[publish-hold] list failed", err);
          return json({ ok: true, hold: false, current: null, active: [], recent: [], error: "list_failed" });

        }
      },

    },
  },
});
