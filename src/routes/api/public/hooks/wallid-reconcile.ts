/**
 * Wallid reconciliation cron.
 *
 * Runs every 5 minutes (pg_cron). For each `wallid_payments` row stuck on
 * NEW/PENDING from the last 48h, polls Wallid /status and fans the result
 * out to Firestore + supabase exactly like the webhook does. Covers cases
 * where the webhook is missed or never delivered.
 *
 * Security: /api/public/* prefix bypasses Lovable edge auth; we require a
 * server-only shared secret (`CLEANUP_SECRET`) passed via
 * `Authorization: Bearer <secret>` or `x-cron-secret`. The Supabase
 * publishable/anon key is intentionally public and MUST NOT gate this
 * endpoint — anyone could otherwise trigger reconciliation runs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getWallidStatus, WallidError } from "@/lib/wallid.server";
import { timingSafeEqualStr } from "@/lib/timing-safe-equal";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function mapStatus(s: string): "SUCCESS" | "FAILED" | "EXPIRED" | "PENDING" | "OTHER" {
  const u = String(s || "").toUpperCase();
  if (u === "SUCCESS" || u === "PAID" || u === "COMPLETED") return "SUCCESS";
  if (u === "FAILED" || u === "DECLINED" || u === "CANCELLED" || u === "CANCELED") return "FAILED";
  if (u === "EXPIRED") return "EXPIRED";
  if (u === "NEW" || u === "PENDING" || u === "PROCESSING") return "PENDING";
  return "OTHER";
}

export const Route = createFileRoute("/api/public/hooks/wallid-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Per-IP rate limit BEFORE auth — defeats secret-guessing scans.
        const ip = getClientIp(request);
        const rl = checkRateLimit(ip, "wallid:reconcile", 6, 60_000);
        if (!rl.allowed) return rateLimitedResponse(rl.retryAfterSec);

        // Auth: server-only shared secret. Accept either
        // `Authorization: Bearer <secret>` or `x-cron-secret`. Compared in
        // constant time so response time doesn't leak prefix length.
        // NOTE: the Supabase publishable/anon key is intentionally public
        // and is NOT accepted here.
        const authHeader = request.headers.get("authorization") || "";
        const bearer = authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : "";
        const provided = bearer || request.headers.get("x-cron-secret") || "";
        const expected = process.env.CLEANUP_SECRET || "";
        if (!expected || !provided || !timingSafeEqualStr(provided, expected)) {
          return json({ error: "Unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await supabaseAdmin
          .from("wallid_payments")
          .select("order_id, api_payment_id, status, created_at")
          .in("status", ["NEW", "PENDING", "PROCESSING"])
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) {
          console.error("[Wallid reconcile] DB lookup failed:", error.message);
          return json({ error: "Lookup failed" }, 500);
        }
        if (!rows || rows.length === 0) {
          return json({ checked: 0, updated: 0 });
        }

        let updated = 0;
        const results: Array<{ orderId: string; from: string; to: string }> = [];

        // Atomic transition helper is loaded per-iteration above; nothing
        // more needed at this scope.

        for (const row of rows) {
          if (!row.api_payment_id || !row.order_id) continue;
          let remoteStatus: string;
          try {
            const remote = await getWallidStatus(row.api_payment_id);
            remoteStatus = String(remote.status || "").toUpperCase();
          } catch (e) {
            if (e instanceof WallidError) {
              console.warn(`[Wallid reconcile] ${row.order_id} status fetch failed: ${e.status}`);
            } else {
              console.warn(`[Wallid reconcile] ${row.order_id} unexpected:`, e);
            }
            continue;
          }

          const mapped = mapStatus(remoteStatus);
          if (mapped === "PENDING" || mapped === "OTHER") {
            // Still pending at Wallid — leave alone.
            continue;
          }

          // Persist remote status on the supabase row.
          await supabaseAdmin
            .from("wallid_payments")
            .update({ status: remoteStatus })
            .eq("api_payment_id", row.api_payment_id);

          const firestoreStatus =
            mapped === "SUCCESS" ? "paid"
            : mapped === "FAILED" ? "failed"
            : "expired";

          try {
            const { transitionDocStatusAdmin } = await import("@/lib/server/firestore-admin");
            // ATOMIC: cron is racing the webhook + status poll. If either
            // already moved this order to a terminal state we get
            // transitioned:false and skip the duplicate write + email.
            const { transitioned, prior } = await transitionDocStatusAdmin(
              "orders",
              row.order_id,
              {
                allowFrom: ["pending", "pending_payment", "awaiting_payment", "processing_payment", ""],
                updates: {
                  status: firestoreStatus,
                  paymentProvider: "wallid",
                  paymentRef: row.api_payment_id,
                  paymentUpdatedAt: new Date(),
                  paymentTokenHash: null,
                  reconciledViaCron: true,
                  ...(firestoreStatus === "paid" ? { paidAt: new Date() } : {}),
                  ...(firestoreStatus !== "paid"
                    ? { paymentFailureReason: remoteStatus }
                    : {}),
                },
              },
            );
            if (!transitioned) continue;
            if (!prior) continue;
            const priorStatus = String(prior.status ?? "").toLowerCase();
            updated += 1;
            results.push({ orderId: row.order_id, from: priorStatus, to: firestoreStatus });

            // First paid transition → enqueue confirmation email.
            if (firestoreStatus === "paid") {
              const customerObj = (prior.customer as Record<string, unknown> | undefined) || {};
              const to = String(prior.customerEmail ?? prior.email ?? customerObj.email ?? "");
              if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
                try {
                  const { paymentConfirmedEmail } = await import("@/templates/paymentConfirmedEmail");
                  const firstName =
                    String(
                      (prior.firstName as string) ||
                        (customerObj.firstName as string) ||
                        (prior.customerName as string) ||
                        "",
                    ).split(" ")[0] || "there";
                  const amount = Number(
                    (prior.totalAmount as number) ??
                      (prior.total as number) ??
                      0,
                  );
                  const reference = String(prior.orderNumber ?? row.order_id);
                  const { subject, html, text } = paymentConfirmedEmail({
                    firstName,
                    orderNumber: reference,
                    amount,
                    paymentMethod: "Open Banking (Wallid)",
                    paidAt: new Date(),
                  });
                  const { enqueueMailOnce } = await import("@/lib/server/enqueue-mail");
                  await enqueueMailOnce(`payment-confirmed:${row.order_id}`, {
                    to,
                    message: { subject, html, text },
                    source: "wallid:reconcile-cron",
                  });
                } catch (mailErr) {
                  console.warn(
                    "[Wallid reconcile] Mail enqueue failed:",
                    mailErr instanceof Error ? mailErr.message : mailErr,
                  );
                }
              }
            }
          } catch (e) {
            console.warn(
              `[Wallid reconcile] ${row.order_id} Firestore update failed:`,
              e instanceof Error ? e.message : e,
            );
          }
        }

        return json({ checked: rows.length, updated, results });
      },
    },
  },
});
