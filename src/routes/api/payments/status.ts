import { createFileRoute } from "@tanstack/react-router";
import { getWallidStatus, WallidError } from "@/lib/wallid.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/payments/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const orderId = url.searchParams.get("orderId") || url.searchParams.get("order_id");
        if (!orderId || !/^[A-Za-z0-9_-]{3,128}$/.test(orderId)) {
          return json({ error: "Invalid orderId" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin
          .from("wallid_payments")
          .select("api_payment_id, status, amount, currency, payment_link")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) {
          console.error("[Wallid] status DB lookup failed:", error.message);
          return json({ error: "Lookup failed" }, 500);
        }
        const row = rows?.[0];
        if (!row || !row.api_payment_id) {
          return json({ status: "unknown", found: false }, 404);
        }

        try {
          const remote = await getWallidStatus(row.api_payment_id);
          const status = String(remote.status || "unknown").toUpperCase();
          // Persist latest status.
          await supabaseAdmin
            .from("wallid_payments")
            .update({ status })
            .eq("api_payment_id", row.api_payment_id);

          // Fan out terminal status to the Firestore order so the UI / admin
          // panel don't keep showing "pending_payment" when Wallid never
          // delivered a webhook (or delivered to a stale URL).
          const firestoreStatus =
            status === "SUCCESS" || status === "PAID" || status === "COMPLETED" ? "paid"
            : status === "FAILED" || status === "DECLINED" || status === "CANCELLED" || status === "CANCELED" ? "failed"
            : status === "EXPIRED" ? "expired"
            : null;
          if (firestoreStatus) {
            try {
              const { updateDocAdmin } = await import("@/lib/server/firestore-admin");
              await updateDocAdmin("orders", orderId, {
                status: firestoreStatus,
                paymentProvider: "wallid",
                paymentRef: row.api_payment_id,
                paymentUpdatedAt: new Date(),
              });
            } catch (e) {
              console.warn(
                "[Wallid status] Firestore order update skipped:",
                e instanceof Error ? e.message : e,
              );
            }
          }

          return json({
            status,
            order_id: orderId,
            api_payment_id: row.api_payment_id,
            amount: row.amount,
            currency: row.currency,
          });
        } catch (err) {
          if (err instanceof WallidError) {
            return json({ error: err.userMessage }, err.status === 401 ? 502 : 502);
          }
          console.error("[Wallid] status unexpected error:", err);
          return json({ error: "Could not fetch payment status" }, 502);
        }
      },
    },
  },
});
