/**
 * Public login-lockout endpoint (actions: check / fail / clear).
 *
 * 2026-11-21: the lockout counter moved server-side. The old browser-side
 * implementation could never engage — firestore.rules made loginAttempts
 * reads admin-only while the login form ran anonymously, so every check
 * failed open. The browser now talks only to this route; the route owns
 * the counter via the service account (rules deny client access entirely).
 *
 * Abuse posture: pre-auth by nature, so no session is possible. Origin
 * allowlist + per-IP rate limit + per-email minimum failure interval +
 * no lock extension while locked keep scripted tampering expensive, and a
 * lock can never exceed COOLDOWN_MS. Firebase Auth's native throttling
 * remains the authoritative brute-force protection underneath this gate.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDocAdmin, updateDocAdmin } from "@/lib/server/firestore-admin";
import {
  emailKey,
  evaluate,
  nextFailure,
  type LockoutDocShape,
} from "@/lib/server/login-lockout-core";

const COLLECTION = "loginAttempts";

// ---- Origin allowlist (same policy as /api/public/send-mail) ----
// Browsers without an Origin header (server-to-server, curl) pass through —
// the rate limits and the state machine's own brakes still apply.
const ALLOWED_ORIGINS = new Set<string>([
  "https://phlabs.co.uk",
  "https://www.phlabs.co.uk",
]);
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    // Lovable preview / published domains.
    if (host.endsWith(".lovable.app") || host.endsWith(".lovable.dev")) return true;
  } catch {
    return false;
  }
  return false;
}
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && isAllowedOrigin(origin) ? origin : "https://phlabs.co.uk";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "origin",
  };
}

// ---- best-effort per-IP rate limit (per worker isolate) ----
const HITS = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || cur.resetAt < now) {
    HITS.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  cur.count++;
  return cur.count > RATE_MAX;
}

const Body = z.object({
  action: z.enum(["check", "fail", "clear"]),
  email: z.email().max(320),
});

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

function tsToMs(v: unknown): number | null {
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.seconds === "number") return o.seconds * 1000;
  }
  return null;
}

function toShape(d: Record<string, unknown> | null): LockoutDocShape | null {
  if (!d) return null;
  return {
    failures: typeof d.failures === "number" ? d.failures : 0,
    firstFailureAtMs: tsToMs(d.firstFailureAt),
    lastFailureAtMs: tsToMs(d.lastFailureAt),
    lockedUntilMs: tsToMs(d.lockedUntil),
  };
}

export const Route = createFileRoute("/api/public/login-lockout")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request.headers.get("origin")),
        });
      },
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (!isAllowedOrigin(origin)) {
          return json({ error: "forbidden_origin" }, 403, origin);
        }
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";
        if (rateLimited(ip)) {
          return json({ error: "rate_limited" }, 429, origin);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, origin);
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "invalid_body" }, 400, origin);
        }

        const { action, email } = parsed.data;
        const id = emailKey(email);
        const nowMs = Date.now();

        try {
          const existing = await getDocAdmin(COLLECTION, id);
          const shape = toShape(existing);

          if (action === "check") {
            return json(evaluate(shape, nowMs), 200, origin);
          }

          if (action === "clear") {
            if (existing) {
              await updateDocAdmin(COLLECTION, id, {
                failures: 0,
                lockedUntil: null,
                updatedAt: new Date(nowMs),
              });
            }
            return json({ locked: false, remainingMs: 0, failures: 0 }, 200, origin);
          }

          // action === "fail"
          const { state, patch } = nextFailure(shape, nowMs);
          if (patch) {
            // security-cleanup TTLs docs by createdAt — set it on first write.
            if (!existing) patch.createdAt = new Date(nowMs);
            await updateDocAdmin(COLLECTION, id, patch);
          }
          return json(state, 200, origin);
        } catch (err) {
          console.error("login-lockout: firestore error", err);
          return json({ error: "lockout_unavailable" }, 503, origin);
        }
      },
    },
  },
});
