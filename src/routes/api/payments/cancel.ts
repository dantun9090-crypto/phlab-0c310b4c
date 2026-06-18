/**
 * POST /api/payments/cancel — mark a pending Wallid payment as cancelled.
 *
 * Security model:
 *   - Caller MUST provide a Firebase ID token (verified server-side).
 *   - The order must exist in Firestore and belong to the caller.
 *   - The wallid_payments row may only transition to CANCELLED from a
 *     non-final state (pending/created/NEW/PENDING). Final states
 *     (SUCCESS/FAILED/EXPIRED/CANCELLED) are rejected with 400.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyFirebaseIdToken } from "@/lib/server/firebase-auth-admin";
import { getDocAdmin } from "@/lib/server/firestore-admin";

const BodySchema = z.object({
  idToken: z.string().min(10).max(4096),
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
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/payments/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try { raw = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid request" }, 400);
        const { idToken, orderId } = parsed.data;

        // 1) Authenticate
        let user;
        try {
          user = await verifyFirebaseIdToken(idToken);
        } catch {
          return json({ error: "Authentication required" }, 401);
        }

        // 2) Verify order ownership via Firestore
        const order = await getDocAdmin("orders", orderId).catch(() => null);
        if (!order) return json({ error: "Order not found" }, 404);
        if (order.userId && order.userId !== user.uid) {
          return json({ error: "Forbidden" }, 403);
        }

        // 3) Look up the wallid_payments row and ensure it's not already final
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
        if (!row) {
          // Nothing to cancel — treat as no-op.
          return json({ ok: true, status: "none" });
        }
        const currentStatus = String(row.status ?? "").toLowerCase();
        if (FINAL_STATES.has(currentStatus)) {
          return json({ error: `Payment is in final state (${row.status}) and cannot be cancelled` }, 400);
        }

        // 4) Transition to CANCELLED
        const { error: updErr } = await supabaseAdmin
          .from("wallid_payments")
          .update({ status: "CANCELLED" })
          .eq("order_id", orderId);
        if (updErr) {
          console.error("[Wallid] cancel update failed:", updErr.message);
          return json({ error: "Cancel failed" }, 500);
        }
        return json({ ok: true, status: "CANCELLED" });
      },
    },
  },
});
