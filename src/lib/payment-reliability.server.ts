/**
 * Server-only helpers for the payment-reliability layer.
 *
 * Talks to Firestore via the REST API using the service-account token
 * (bypasses security rules). Kept separate from `firestore-admin.ts` so
 * we can freely address SUB-collections (`orders/{id}/paymentTimeline`)
 * which the generic `addDocAdmin` URL-encodes and thus rejects.
 *
 * Callers: Wallid webhook handlers + reconcile-payments cron. Every write
 * is best-effort and MUST NOT throw into the caller — a failure to write
 * an audit row cannot block ack'ing a webhook or advancing an order.
 */
import { getServiceAccount, getAccessToken } from "@/lib/server/firestore-admin";
import { RETRY_BACKOFF_MINUTES } from "@/lib/paymentStatus";
import type {
  PaymentTimelineActor,
  PaymentTimelineEventType,
  WebhookEventSource,
  WebhookEventStatus,
} from "@/types/payments";

// ---------- tiny local Firestore-value coder ---------------------------

// Mirrors the private helper in firestore-admin.ts. Kept local so this
// module has no circular deps.
function toFirestoreValue(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v))
    return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function objectToFields(obj: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return fields;
}

function baseUrl(): string {
  const acct = getServiceAccount();
  return `https://firestore.googleapis.com/v1/projects/${acct.project_id}/databases/(default)/documents`;
}

// ---------- public API -------------------------------------------------

export interface PaymentTimelineWrite {
  actor: PaymentTimelineActor;
  eventType: PaymentTimelineEventType;
  statusFrom: string;
  statusTo: string;
  amount?: number;
  currency?: string;
  apiPaymentId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append an event to `orders/{orderId}/paymentTimeline`. Best-effort:
 * failures are logged and swallowed.
 */
export async function writePaymentTimelineAdmin(
  orderId: string,
  event: PaymentTimelineWrite,
): Promise<void> {
  if (!orderId) return;
  try {
    const token = await getAccessToken();
    const url = `${baseUrl()}/orders/${encodeURIComponent(orderId)}/paymentTimeline`;
    const body = {
      fields: objectToFields({
        timestamp: new Date(),
        actor: event.actor,
        eventType: event.eventType,
        statusFrom: event.statusFrom || "",
        statusTo: event.statusTo || "",
        ...(event.amount !== undefined ? { amount: event.amount } : {}),
        ...(event.currency ? { currency: event.currency } : {}),
        ...(event.apiPaymentId ? { apiPaymentId: event.apiPaymentId } : {}),
        ...(event.metadata ? { metadata: event.metadata } : {}),
      }),
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(
        "[payment-reliability] timeline write failed",
        res.status,
        (await res.text()).slice(0, 200),
      );
    }
  } catch (e) {
    console.warn(
      "[payment-reliability] timeline write threw",
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Upsert `webhookEvents/{apiPaymentId}` — the Firestore mirror of the
 * Wallid event log. Idempotency in this project is enforced by Supabase's
 * UNIQUE index on `wallid_webhook_events.event_id`; this mirror exists so
 * the admin UI and cron can reason about processing history without
 * cross-database joins.
 */
export async function recordWebhookEventAdmin(
  apiPaymentId: string,
  data: {
    orderId: string;
    source: WebhookEventSource;
    status: WebhookEventStatus;
    payload: Record<string, unknown>;
    errorMessage?: string;
  },
): Promise<void> {
  if (!apiPaymentId) return;
  try {
    const token = await getAccessToken();
    // PATCH with updateMask acts as an upsert (docs are auto-created).
    const fields = {
      orderId: data.orderId || "",
      source: data.source,
      status: data.status,
      payload: data.payload,
      processedAt: data.status === "processed" ? new Date() : null,
      createdAt: new Date(),
      attemptCount: 1,
      ...(data.errorMessage ? { errorMessage: data.errorMessage } : {}),
    };
    const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
    const url = `${baseUrl()}/webhookEvents/${encodeURIComponent(apiPaymentId)}?${mask}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ fields: objectToFields(fields) }),
    });
    if (!res.ok) {
      console.warn(
        "[payment-reliability] webhookEvents write failed",
        res.status,
        (await res.text()).slice(0, 200),
      );
    }
  } catch (e) {
    console.warn(
      "[payment-reliability] webhookEvents write threw",
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Enqueue an item into `retryQueue/{apiPaymentId}` for the cron to pick up.
 * Uses REST PATCH (upsert). The cron reads `nextAttemptAt` for eligibility.
 */
export async function enqueueRetryAdmin(args: {
  orderId: string;
  apiPaymentId: string;
  payload: Record<string, unknown>;
  error: string;
  source?: string;
  attemptCount?: number; // pass explicit value when incrementing
}): Promise<void> {
  const { orderId, apiPaymentId, payload, error, source = "wallid_webhook" } = args;
  if (!apiPaymentId) return;
  try {
    const token = await getAccessToken();
    const attempt = Math.max(1, args.attemptCount ?? 1);
    const backoffIdx = Math.min(attempt - 1, RETRY_BACKOFF_MINUTES.length - 1);
    const nextAttemptAt = new Date(Date.now() + RETRY_BACKOFF_MINUTES[backoffIdx] * 60_000);
    const fields = {
      orderId,
      apiPaymentId,
      payload,
      nextAttemptAt,
      attemptCount: attempt,
      maxAttempts: 5,
      lastError: String(error || "").slice(0, 2000),
      createdAt: new Date(),
      source,
    };
    const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
    const url = `${baseUrl()}/retryQueue/${encodeURIComponent(apiPaymentId)}?${mask}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ fields: objectToFields(fields) }),
    });
    if (!res.ok) {
      console.warn(
        "[payment-reliability] retryQueue write failed",
        res.status,
        (await res.text()).slice(0, 200),
      );
    }
  } catch (e) {
    console.warn(
      "[payment-reliability] retryQueue write threw",
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Remove a `retryQueue/{apiPaymentId}` row (success path). 404 is ignored.
 */
export async function dequeueRetryAdmin(apiPaymentId: string): Promise<void> {
  if (!apiPaymentId) return;
  try {
    const token = await getAccessToken();
    const url = `${baseUrl()}/retryQueue/${encodeURIComponent(apiPaymentId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) {
      console.warn(
        "[payment-reliability] retryQueue delete failed",
        res.status,
        (await res.text()).slice(0, 200),
      );
    }
  } catch (e) {
    console.warn(
      "[payment-reliability] retryQueue delete threw",
      e instanceof Error ? e.message : e,
    );
  }
}
