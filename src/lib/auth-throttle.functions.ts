/**
 * Rate-limited Firebase Auth wrappers.
 *
 * Firebase's client SDK calls Identity Toolkit directly from the browser,
 * so per-IP throttling has to happen on our edge. These server fns proxy
 * the two abuse-prone flows (password reset, email verification re-send)
 * through the Cloudflare Worker, applying `enforceRateLimit` per
 * cf-connecting-ip BEFORE forwarding to Identity Toolkit.
 *
 * Limits: max 5 requests / 15 min / IP per flow.
 * Responses are intentionally generic — they never reveal whether the
 * supplied email exists (prevents user enumeration).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";

const FIREBASE_API_KEY = "AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM";
const OOB_ENDPOINT = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`;

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 5;

const ResetInput = z.object({
  email: z.string().trim().email().max(320),
  continueUrl: z.string().url().max(500).optional(),
});

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) => ResetInput.parse(d))
  .handler(async ({ data }) => {
    const req = getRequest();
    const blocked = await enforceRateLimit(req, "auth.password-reset", {
      limit: LIMIT,
      windowMs: WINDOW_MS,
      retryAfterSec: 900,
    });
    if (blocked) {
      // Map the 429 Response body to a typed result the client can render.
      return { ok: true as const, throttled: true as const };
    }

    try {
      await fetch(OOB_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestType: "PASSWORD_RESET",
          email: data.email,
          ...(data.continueUrl ? { continueUrl: data.continueUrl } : {}),
        }),
      });
    } catch {
      /* swallow — never reveal whether the email exists */
    }
    return { ok: true as const, throttled: false as const };
  });

const VerifyInput = z.object({
  idToken: z.string().min(10).max(4096),
});

export const requestEmailVerification = createServerFn({ method: "POST" })
  .inputValidator((d) => VerifyInput.parse(d))
  .handler(async ({ data }) => {
    const req = getRequest();
    const blocked = await enforceRateLimit(req, "auth.email-verify", {
      limit: LIMIT,
      windowMs: WINDOW_MS,
      retryAfterSec: 900,
    });
    if (blocked) {
      return { ok: false as const, throttled: true as const };
    }
    try {
      const res = await fetch(OOB_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestType: "VERIFY_EMAIL",
          idToken: data.idToken,
        }),
      });
      if (!res.ok) {
        return { ok: false as const, throttled: false as const };
      }
    } catch {
      return { ok: false as const, throttled: false as const };
    }
    return { ok: true as const, throttled: false as const };
  });
