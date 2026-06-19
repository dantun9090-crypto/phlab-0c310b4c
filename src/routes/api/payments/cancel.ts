/**
 * POST /api/payments/cancel — mark a pending Wallid payment as cancelled.
 *
 * Security model:
 *   - Caller MUST authenticate as either:
 *       a) the logged-in owner (Firebase ID token, verified server-side and
 *          matched against `orders/{orderId}.userId`), or
 *       b) the guest who placed the order (one-time high-entropy
 *          `paymentToken` whose SHA-256 hash matches
 *          `orders/{orderId}.paymentTokenHash`).
 *   - The wallid_payments row may only transition to CANCELLED from a
 *     non-final state (pending/created/NEW/PENDING). Final states
 *     (SUCCESS/FAILED/EXPIRED/CANCELLED) are rejected with 400.
 *   - The Firestore order doc is flipped to `cancelled` through the atomic
 *     `transitionDocStatusAdmin` helper, so a webhook landing at the same
 *     moment cannot overwrite a real `paid` transition with `cancelled`.
 *   - Per-IP rate limit (20 req/min) to defeat order-id enumeration scans.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyFirebaseIdToken } from "@/lib/server/firebase-auth-admin";
import { getDocAdmin, transitionDocStatusAdmin } from "@/lib/server/firestore-admin";
import { enforceRateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  idToken: z.string().min(10).max(4096).optional().nullable(),
  paymentToken: z.string().min(32).max(256).optional().nullable(),
  orderId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

const FINAL_STATES = new Set([
  "success",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "canceled",
  "refunded",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function verifyPaymentTokenHash(rawToken: string, storedHash: unknown): Promise<boolean> {
  if (typeof storedHash !== "string" || !storedHash) return false;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  const candidate = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

export const Route = createFileRoute("/api/payments/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await enforceRateLimit(request, "wallid:cancel", {
          limit: 20,
          windowMs: 60_000,
          retryAfterSec: 30,
        });
        if (limited) return limited;

        let raw: unknown;
        try { raw = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid request" }, 400);
        const { idToken, paymentToken, orderId } = parsed.data;

        if (!idToken && !paymentToken) {
          return json({ error: "Authentication required" }, 401);
        }

        // 1) Authenticate caller (idToken preferred; fall back to paymentToken).
        let userUid: string | null = null;
        if (idToken) {
          try {
            const user = await verifyFirebaseIdToken(idToken);
            userUid = user.uid;
          } catch {
            // fall through to paymentToken
          }
        }

        // 2) Verify order ownership via Firestore.
        const order = await getDocAdmin("orders", orderId).catch(() => null);
        if (!order) return json({ error: "Order not found" }, 404);

        const ownerUid = typeof order.userId === "string" ? order.userId : null;
        const ownsByUid = userUid !== null && ownerUid !== null && ownerUid === userUid;
        const ownsByToken = paymentToken
          ? await verifyPaymentTokenHash(paymentToken, (order as { paymentTokenHash?: unknown }).paymentTokenHash)
          : false;

        if (!ownsByUid && !ownsByToken) {
          return json({ error: "Forbidden" }, 403);
        }

        // 3) Look up the wallid_payments row and ensure it's not already final.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error: readErr } = await supabaseAdmin
          .from("wallid_payments")
          .select("status")
          .eq("order_id", orderId)
          .maybeSingle();
        if (readErr) {
          console.error("[Wallid] cancel read failed:", readErr.message);
          return json({ error: "Lookup failed" }, 500);
        }
        if (row) {
          const currentStatus = String(row.status ?? "").toLowerCase();
          if (FINAL_STATES.has(currentStatus)) {
            return json({ error: `Payment is in final state (${row.status}) and cannot be cancelled` }, 400);
          }

          // 4) Transition the supabase row to CANCELLED.
          const { error: updErr } = await supabaseAdmin
            .from("wallid_payments")
            .update({ status: "CANCELLED" })
            .eq("order_id", orderId);
          if (updErr) {
            console.error("[Wallid] cancel update failed:", updErr.message);
            return json({ error: "Cancel failed" }, 500);
          }
        }

        // 5) Mirror the cancellation onto the Firestore order doc — atomic
        //    so a webhook arriving at the same instant with status=SUCCESS
        //    can't be silently overwritten. Only flips from non-terminal
        //    states; if the order already moved to paid/failed/expired we
        //    leave it alone and report that back to the caller.
        let firestoreTransitioned = false;
        let firestorePrior: string | null = null;
        try {
          const result = await transitionDocStatusAdmin("orders", orderId, {
            allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
            updates: {
              status: "cancelled",
              paymentUpdatedAt: new Date(),
              cancelledAt: new Date(),
              cancelledBy: ownsByUid ? "owner" : "guest",
              cancelReason: "user_initiated",
              // Burn the guest paymentToken so it can't be reused.
              paymentTokenHash: null,
            },
          });
          firestoreTransitioned = result.transitioned;
          firestorePrior = result.prior
            ? String((result.prior as { status?: unknown }).status ?? "")
            : null;
        } catch (e) {
          console.warn("[Wallid] cancel Firestore transition failed:", e instanceof Error ? e.message : e);
        }

        return json({
          ok: true,
          status: "CANCELLED",
          orderCancelled: firestoreTransitioned,
          orderPriorStatus: firestorePrior,
        });
      },
    },
  },
});
