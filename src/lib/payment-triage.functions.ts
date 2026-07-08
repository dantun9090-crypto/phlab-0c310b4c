/**
 * Admin-only payment triage dashboard data source.
 *
 * Joins:
 *   - Supabase `wallid_payments` (each payment attempt)
 *   - Supabase `wallid_webhook_events` (every webhook we received)
 *   - Supabase `wallid_webhook_duplicates` (dedup hits)
 *   - Firestore `orders/{id}` (current internal order state)
 *   - Firestore `orders/{id}/paymentTimeline` (audit trail)
 *
 * Used by the "Payment Triage" admin tab so support can see, for every
 * payment attempt, whether the webhook landed, whether the reconcile
 * cron had to fix it, and every state transition on the order.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

// ---------- shared shapes ---------------------------------------------

export interface TriageListRow {
  orderId: string;
  apiPaymentId: string;
  amount: number | null;
  currency: string | null;
  customerEmail: string | null;
  providerStatus: string; // last known Wallid status (from wallid_payments)
  orderStatus: string; // current Firestore order status
  createdAt: string; // wallid_payments.created_at
  updatedAt: string;
  paidAt: string | null;
  webhookCount: number;
  webhookOkCount: number;
  webhookFailedCount: number;
  lastWebhookStatus: string | null;
  lastWebhookAt: string | null;
  duplicateCount: number;
  reconciledManually: boolean;
  reconciledByCron: boolean;
  needsAttention: boolean;
}

export interface TriageDetail extends TriageListRow {
  paymentLink: string | null;
  /** JSON-encoded metadata blob from wallid_payments. */
  metadataJson: string | null;
  /** JSON-encoded Firestore order doc. */
  orderDocJson: string | null;
  webhookEvents: Array<{
    id: string;
    eventId: string;
    status: string;
    source: string | null;
    occurredAt: string | null;
    processedAt: string | null;
    errorMessage: string | null;
    /** JSON-encoded raw payload. */
    rawJson: string | null;
  }>;
  duplicates: Array<{
    id: string;
    eventId: string;
    ip: string | null;
    originalProcessedAt: string | null;
    duplicateReceivedAt: string | null;
  }>;
  timeline: Array<{
    id: string;
    timestamp: string | null;
    actor: string;
    eventType: string;
    statusFrom: string;
    statusTo: string;
    apiPaymentId: string | null;
    /** JSON-encoded metadata map. */
    metadataJson: string | null;
  }>;
}


// ---------- helpers ----------------------------------------------------

const NEEDS_ATTENTION_ORDER_STATES = new Set([
  "pending",
  "pending_payment",
  "awaiting_payment",
  "processing_payment",
  "needs_review",
]);

function computeNeedsAttention(providerStatus: string, orderStatus: string): boolean {
  const p = providerStatus.toUpperCase();
  const o = orderStatus.toLowerCase();
  // Wallid says paid/failed but the order is still mid-flight => triage.
  if ((p === "SUCCESS" || p === "FAILED" || p === "EXPIRED") && NEEDS_ATTENTION_ORDER_STATES.has(o)) {
    return true;
  }
  // Order in a stuck state for more than a few minutes with a NEW/PENDING payment => triage.
  return false;
}

// ---------- list -------------------------------------------------------

const ListInput = z.object({
  idToken: z.string().min(10).max(4096),
  limit: z.number().int().min(1).max(200).optional(),
  status: z.enum(["all", "needs_attention", "success", "pending", "failed"]).optional(),
  search: z.string().max(200).optional(),
});

export const listPaymentTriageAdmin = createServerFn({ method: "POST" })
  .validator((d) => ListInput.parse(d))
  .handler(async ({ data }): Promise<{ rows: TriageListRow[]; total: number }> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getDocAdmin } = await import("@/lib/server/firestore-admin");

    const limit = data.limit ?? 100;

    let q = supabaseAdmin
      .from("wallid_payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (data.status === "success") q = q.eq("status", "SUCCESS");
    else if (data.status === "failed") q = q.in("status", ["FAILED", "DECLINED", "CANCELLED", "EXPIRED"]);
    else if (data.status === "pending") q = q.in("status", ["NEW", "PENDING", "PROCESSING"]);

    if (data.search) {
      const s = data.search.trim();
      if (s) q = q.or(`order_id.ilike.%${s}%,api_payment_id.ilike.%${s}%,customer_email.ilike.%${s}%`);
    }

    const { data: payments, error } = await q;
    if (error) throw new Error(`wallid_payments query failed: ${error.message}`);

    const paymentRows = payments ?? [];
    if (paymentRows.length === 0) return { rows: [], total: 0 };

    const apiIds = paymentRows.map((p) => String(p.api_payment_id)).filter(Boolean);

    // Batch webhook event summary for the visible payments.
    const { data: events } = await supabaseAdmin
      .from("wallid_webhook_events")
      .select("api_payment_id, status, processed_at, occurred_at")
      .in("api_payment_id", apiIds);

    const eventsByPayment = new Map<
      string,
      { count: number; ok: number; failed: number; lastAt: string | null; lastStatus: string | null }
    >();
    for (const ev of events ?? []) {
      const key = String(ev.api_payment_id);
      const entry =
        eventsByPayment.get(key) ??
        { count: 0, ok: 0, failed: 0, lastAt: null as string | null, lastStatus: null as string | null };
      entry.count += 1;
      if (ev.status === "processed") entry.ok += 1;
      else if (ev.status === "failed" || ev.status === "conflict") entry.failed += 1;
      const at = String(ev.processed_at ?? ev.occurred_at ?? "");
      if (at && (!entry.lastAt || at > entry.lastAt)) {
        entry.lastAt = at;
        entry.lastStatus = String(ev.status ?? "");
      }
      eventsByPayment.set(key, entry);
    }

    // Duplicate counts.
    const { data: dupes } = await supabaseAdmin
      .from("wallid_webhook_duplicates")
      .select("api_payment_id")
      .in("api_payment_id", apiIds);
    const dupeCounts = new Map<string, number>();
    for (const d of dupes ?? []) {
      const k = String(d.api_payment_id);
      dupeCounts.set(k, (dupeCounts.get(k) ?? 0) + 1);
    }

    // Firestore order docs in parallel.
    const orderDocs = await Promise.all(
      paymentRows.map(async (p) => {
        try {
          return await getDocAdmin("orders", String(p.order_id));
        } catch {
          return null;
        }
      }),
    );

    const rows: TriageListRow[] = paymentRows.map((p, i) => {
      const apiId = String(p.api_payment_id);
      const ev = eventsByPayment.get(apiId);
      const doc = orderDocs[i];
      const providerStatus = String(p.status ?? "");
      const orderStatus = doc ? String((doc as { status?: string }).status ?? "") : "";
      return {
        orderId: String(p.order_id),
        apiPaymentId: apiId,
        amount: p.amount != null ? Number(p.amount) / 100 : null,
        currency: p.currency ? String(p.currency) : null,
        customerEmail: p.customer_email ? String(p.customer_email) : null,
        providerStatus,
        orderStatus,
        createdAt: String(p.created_at),
        updatedAt: String(p.updated_at),
        paidAt: doc && (doc as { paidAt?: string }).paidAt
          ? new Date((doc as { paidAt?: string | number }).paidAt as string | number).toISOString()
          : null,
        webhookCount: ev?.count ?? 0,
        webhookOkCount: ev?.ok ?? 0,
        webhookFailedCount: ev?.failed ?? 0,
        lastWebhookStatus: ev?.lastStatus ?? null,
        lastWebhookAt: ev?.lastAt ?? null,
        duplicateCount: dupeCounts.get(apiId) ?? 0,
        reconciledManually: Boolean(doc && (doc as { reconciledManually?: boolean }).reconciledManually),
        reconciledByCron: Boolean(doc && (doc as { lastReconciledAt?: unknown }).lastReconciledAt),
        needsAttention: computeNeedsAttention(providerStatus, orderStatus),
      };
    });

    const filtered = data.status === "needs_attention" ? rows.filter((r) => r.needsAttention) : rows;
    return { rows: filtered, total: filtered.length };
  });

// ---------- detail -----------------------------------------------------

const DetailInput = z.object({
  idToken: z.string().min(10).max(4096),
  orderId: z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export const getPaymentTriageDetailAdmin = createServerFn({ method: "POST" })
  .validator((d) => DetailInput.parse(d))
  .handler(async ({ data }): Promise<TriageDetail | null> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getDocAdmin, getServiceAccount, getAccessToken } = await import("@/lib/server/firestore-admin");

    const { data: payment } = await supabaseAdmin
      .from("wallid_payments")
      .select("*")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) return null;

    const apiId = String(payment.api_payment_id);
    const [orderDoc, eventsRes, dupesRes] = await Promise.all([
      getDocAdmin("orders", data.orderId).catch(() => null),
      supabaseAdmin
        .from("wallid_webhook_events")
        .select("*")
        .eq("api_payment_id", apiId)
        .order("occurred_at", { ascending: false }),
      supabaseAdmin
        .from("wallid_webhook_duplicates")
        .select("*")
        .eq("api_payment_id", apiId)
        .order("duplicate_received_at", { ascending: false }),
    ]);

    // paymentTimeline subcollection via Firestore REST runQuery.
    let timeline: TriageDetail["timeline"] = [];
    try {
      const acct = getServiceAccount();
      const token = await getAccessToken();
      const parent = `projects/${acct.project_id}/databases/(default)/documents/orders/${encodeURIComponent(
        data.orderId,
      )}`;
      const res = await fetch(
        `https://firestore.googleapis.com/v1/${parent}:runQuery`,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: "paymentTimeline" }],
              orderBy: [{ field: { fieldPath: "timestamp" }, direction: "DESCENDING" }],
              limit: 100,
            },
          }),
        },
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{
          document?: { name: string; fields?: Record<string, { [k: string]: unknown }> };
        }>;
        timeline = rows.flatMap((r) => {
          if (!r.document) return [];
          const f = r.document.fields ?? {};
          const val = (v: { [k: string]: unknown } | undefined): unknown => {
            if (!v) return null;
            if ("stringValue" in v) return v.stringValue;
            if ("timestampValue" in v) return v.timestampValue;
            if ("integerValue" in v) return Number(v.integerValue);
            if ("doubleValue" in v) return v.doubleValue;
            if ("booleanValue" in v) return v.booleanValue;
            if ("mapValue" in v) {
              const m = (v.mapValue as { fields?: Record<string, { [k: string]: unknown }> }).fields ?? {};
              const out: Record<string, unknown> = {};
              for (const [k, vv] of Object.entries(m)) out[k] = val(vv);
              return out;
            }
            return null;
          };
          const meta = val(f.metadata) as Record<string, unknown> | null;
          return [{
            id: r.document.name.split("/").pop() ?? "",
            timestamp: (val(f.timestamp) as string) ?? null,
            actor: String(val(f.actor) ?? ""),
            eventType: String(val(f.eventType) ?? ""),
            statusFrom: String(val(f.statusFrom) ?? ""),
            statusTo: String(val(f.statusTo) ?? ""),
            apiPaymentId: (val(f.apiPaymentId) as string) ?? null,
            metadataJson: meta ? JSON.stringify(meta) : null,
          }];

        });
      }
    } catch {
      // best-effort; leave timeline empty
    }

    const providerStatus = String(payment.status ?? "");
    const orderStatus = orderDoc ? String((orderDoc as { status?: string }).status ?? "") : "";

    const webhookEvents = (eventsRes.data ?? []).map((e) => ({
      id: String(e.id),
      eventId: String(e.event_id ?? ""),
      status: String(e.status ?? ""),
      source: (e as { source?: string }).source ? String((e as { source?: string }).source) : null,
      occurredAt: e.occurred_at ? String(e.occurred_at) : null,
      processedAt: e.processed_at ? String(e.processed_at) : null,
      errorMessage: (e as { error_message?: string }).error_message
        ? String((e as { error_message?: string }).error_message)
        : null,
      raw: e.raw ?? null,
    }));

    const duplicates = (dupesRes.data ?? []).map((d) => ({
      id: String(d.id),
      eventId: String(d.event_id ?? ""),
      ip: d.ip ? String(d.ip) : null,
      originalProcessedAt: d.original_processed_at ? String(d.original_processed_at) : null,
      duplicateReceivedAt: d.duplicate_received_at ? String(d.duplicate_received_at) : null,
    }));

    const lastEvent = webhookEvents[0] ?? null;

    return {
      orderId: String(payment.order_id),
      apiPaymentId: apiId,
      amount: payment.amount != null ? Number(payment.amount) / 100 : null,
      currency: payment.currency ? String(payment.currency) : null,
      customerEmail: payment.customer_email ? String(payment.customer_email) : null,
      providerStatus,
      orderStatus,
      createdAt: String(payment.created_at),
      updatedAt: String(payment.updated_at),
      paidAt: orderDoc && (orderDoc as { paidAt?: string | number }).paidAt
        ? new Date((orderDoc as { paidAt?: string | number }).paidAt as string | number).toISOString()
        : null,
      webhookCount: webhookEvents.length,
      webhookOkCount: webhookEvents.filter((e) => e.status === "processed").length,
      webhookFailedCount: webhookEvents.filter((e) => e.status === "failed" || e.status === "conflict").length,
      lastWebhookStatus: lastEvent?.status ?? null,
      lastWebhookAt: lastEvent?.processedAt ?? lastEvent?.occurredAt ?? null,
      duplicateCount: duplicates.length,
      reconciledManually: Boolean(orderDoc && (orderDoc as { reconciledManually?: boolean }).reconciledManually),
      reconciledByCron: Boolean(orderDoc && (orderDoc as { lastReconciledAt?: unknown }).lastReconciledAt),
      needsAttention: computeNeedsAttention(providerStatus, orderStatus),
      paymentLink: payment.payment_link ? String(payment.payment_link) : null,
      metadata: (payment.metadata as Record<string, unknown>) ?? null,
      orderDoc,
      webhookEvents,
      duplicates,
      timeline,
    };
  });
