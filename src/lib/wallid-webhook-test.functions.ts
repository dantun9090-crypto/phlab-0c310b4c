/**
 * Admin-only Wallid webhook test harness.
 *
 * Builds a fake Wallid event, signs it with WALLID_WEBHOOK_SECRET, POSTs it
 * to the real `/api/public/hooks/wallid` receiver, and reads back the
 * persisted `wallid_webhook_events` row and `wallid_payments` status so the
 * admin tab can show end-to-end results.
 *
 * Tampering modes (for edge-case verification):
 *   - "normal"      → valid signature, fresh timestamp
 *   - "bad-sig"     → fresh timestamp, wrong signature
 *   - "stale"       → valid signature for a 10-minute-old timestamp
 *   - "duplicate"   → sends the same event_id twice
 *
 * Never exposes WALLID_WEBHOOK_SECRET to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

const Mode = z.enum(["normal", "bad-sig", "stale", "duplicate"]);

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  eventType: z.enum(["SUCCESS", "FAILED", "EXPIRED", "PENDING"]),
  orderId: z.string().min(1).max(120),
  apiPaymentId: z.string().min(1).max(120),
  amount: z.number().int().min(1).max(10_000_00),
  mode: Mode.default("normal"),
  targetOrigin: z.string().url().optional(),
});

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const view = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, "0");
  return hex;
}

interface DispatchResult {
  status: number;
  body: string;
}

async function dispatchOne(
  url: string,
  payload: unknown,
  timestamp: number,
  signature: string,
): Promise<DispatchResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": String(timestamp),
      "x-webhook-signature": signature,
      "x-webhook-event-count": "1",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { status: res.status, body };
}

export const sendTestWallidWebhook = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);

    const secret = process.env.WALLID_WEBHOOK_SECRET;
    if (!secret) {
      return {
        ok: false as const,
        error: "WALLID_WEBHOOK_SECRET not configured on the server.",
      };
    }

    const origin = data.targetOrigin || "https://phlabs.co.uk";
    const url = `${origin.replace(/\/$/, "")}/api/public/hooks/wallid`;

    const eventId = `test_evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const event = {
      event_id: eventId,
      api_payment_id: data.apiPaymentId,
      order_id: data.orderId,
      status: data.eventType,
      status_error: data.eventType === "FAILED" ? "insufficient_funds" : "",
      amount: data.amount,
      currency: "GBP",
      occurred_at: new Date().toISOString(),
    };
    const payload = { events: [event] };
    const rawBody = JSON.stringify(payload);

    // Capture pre-state so the UI can show before/after for wallid_payments.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const beforeRow = await supabaseAdmin
      .from("wallid_payments")
      .select("status, api_payment_id, order_id, amount, updated_at")
      .or(
        `api_payment_id.eq.${data.apiPaymentId},order_id.eq.${data.orderId}`,
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Pick timestamp + signature per mode.
    const now = Math.floor(Date.now() / 1000);
    const timestamp = data.mode === "stale" ? now - 600 : now;
    const message = `${timestamp}.${rawBody}`;
    const realSig = "sha256=" + (await hmacHex(secret, message));
    const sentSig = data.mode === "bad-sig"
      ? "sha256=" + "0".repeat(64)
      : realSig;

    const first = await dispatchOne(url, payload, timestamp, sentSig);
    let second: DispatchResult | null = null;
    if (data.mode === "duplicate") {
      // Send a second time with the SAME signature/timestamp/body — receiver
      // must dedupe by event_id and return 200 with processed=0.
      second = await dispatchOne(url, payload, timestamp, sentSig);
    }

    // Read back what landed in wallid_webhook_events for this event_id.
    const { data: stored } = await supabaseAdmin
      .from("wallid_webhook_events")
      .select("event_id, status, api_payment_id, order_id, occurred_at, processed_at")
      .eq("event_id", eventId)
      .maybeSingle();

    const afterRow = await supabaseAdmin
      .from("wallid_payments")
      .select("status, api_payment_id, order_id, amount, updated_at")
      .or(
        `api_payment_id.eq.${data.apiPaymentId},order_id.eq.${data.orderId}`,
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ok: true as const,
      request: {
        url,
        timestamp,
        signature: sentSig,
        realSignature: realSig,
        mode: data.mode,
        eventId,
        payload,
      },
      response: first,
      duplicateResponse: second,
      stored: stored ?? null,
      payment: {
        before: beforeRow.data ?? null,
        after: afterRow.data ?? null,
      },
    };
  });

// Last N webhook event rows for the debug feed.
export const listRecentWebhookEvents = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ idToken: z.string().min(10).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("wallid_webhook_events")
      .select("event_id, status, order_id, api_payment_id, occurred_at, processed_at, raw")
      .order("processed_at", { ascending: false })
      .limit(10);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, rows: rows ?? [] };
  });
