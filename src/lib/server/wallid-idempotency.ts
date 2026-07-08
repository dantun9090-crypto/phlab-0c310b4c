/**
 * Idempotent apply-helpers for Wallid webhook events.
 *
 * Two guards on top of the UNIQUE(event_id) index that already dedupes
 * exact replays:
 *
 *  1. Terminal-state guard — once `wallid_payments.status` is SUCCESS,
 *     FAILED or EXPIRED we NEVER overwrite it with a lower-priority
 *     status (PENDING / OTHER). Prevents a late PENDING callback with a
 *     new event_id from silently rolling a paid order back.
 *
 *  2. Out-of-order guard — if the currently-stored `metadata.lastEvent`
 *     has a later `occurred_at` than the incoming event, skip the
 *     update. Prevents webhook re-orderings on retry from stomping the
 *     newest state.
 *
 * The Firestore side is already guarded by `transitionDocStatusAdmin`'s
 * `allowFrom` list, so we only add the guard for the Supabase row here.
 *
 * `wallid_webhook_events.processed_at` is already stamped by the DB
 * default at insert time, so the admin triage UI + duplicate audit rows
 * always see a value.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type NormalisedStatus = "SUCCESS" | "FAILED" | "EXPIRED" | "PENDING" | "OTHER";

const TERMINAL: ReadonlySet<NormalisedStatus> = new Set(["SUCCESS", "FAILED", "EXPIRED"]);

// Priority ranking. Higher = more authoritative; we never move down.
const PRIORITY: Record<NormalisedStatus, number> = {
  SUCCESS: 3,
  FAILED: 3,
  EXPIRED: 3,
  PENDING: 1,
  OTHER: 0,
};

function toMillis(v: unknown): number {
  if (!v) return 0;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : 0;
}

export interface ApplyArgs {
  supabaseAdmin: SupabaseClient;
  apiPaymentId: string | null;
  orderId: string | null;
  status: NormalisedStatus;
  occurredAt: string | null;
  event: Record<string, unknown>;
}

export interface ApplyResult {
  applied: boolean;
  reason?: "no_identifier" | "no_row" | "terminal_locked" | "stale_event";
  currentStatus?: NormalisedStatus | null;
}

/**
 * Guarded UPDATE against `wallid_payments`. Returns `applied:false`
 * (with a reason) when the guards refused the write — the caller can
 * still log/audit but should NOT treat that as an error.
 */
export async function applyWallidPaymentUpdate(args: ApplyArgs): Promise<ApplyResult> {
  const { supabaseAdmin, apiPaymentId, orderId, status, occurredAt, event } = args;

  if (!apiPaymentId && !orderId) {
    return { applied: false, reason: "no_identifier" };
  }

  // Read the current row so we can decide whether to overwrite.
  const sel = supabaseAdmin
    .from("wallid_payments")
    .select("status, metadata")
    .limit(1);
  const { data: rows, error: selErr } = apiPaymentId
    ? await sel.eq("api_payment_id", apiPaymentId)
    : await sel.eq("order_id", orderId!);

  if (selErr) {
    // Fall through to an unguarded update — surfacing the DB error here
    // would break Wallid delivery. The UPDATE below is scoped by the
    // same identifier so a bad SELECT can't broaden its blast radius.
    console.warn("[wallid-idempotency] select failed:", selErr.message);
  }

  const current = rows && rows[0] ? (rows[0] as { status?: string; metadata?: Record<string, unknown> | null }) : null;
  const currentStatus = (current?.status as NormalisedStatus | undefined) ?? null;

  if (!current) {
    // No matching payment row — nothing to update (create.ts inserts the
    // row at checkout, so this only happens for out-of-band callbacks).
    return { applied: false, reason: "no_row", currentStatus: null };
  }

  // Guard 1 — terminal states are locked.
  if (currentStatus && TERMINAL.has(currentStatus) && PRIORITY[status] < PRIORITY[currentStatus]) {
    console.warn("[wallid-idempotency] refusing downgrade", {
      apiPaymentId, orderId, currentStatus, incomingStatus: status,
    });
    return { applied: false, reason: "terminal_locked", currentStatus };
  }

  // Guard 2 — out-of-order.
  const priorLast = (current.metadata as { lastEvent?: Record<string, unknown> } | null | undefined)?.lastEvent;
  const priorOccurred = toMillis(
    priorLast?.occurred_at ?? priorLast?.occurredAt,
  );
  const incomingOccurred = toMillis(occurredAt);
  if (
    priorOccurred &&
    incomingOccurred &&
    incomingOccurred < priorOccurred &&
    PRIORITY[status] <= PRIORITY[currentStatus ?? "OTHER"]
  ) {
    console.warn("[wallid-idempotency] refusing stale event", {
      apiPaymentId, orderId, priorOccurred, incomingOccurred, currentStatus, incomingStatus: status,
    });
    return { applied: false, reason: "stale_event", currentStatus };
  }

  const upd = supabaseAdmin
    .from("wallid_payments")
    .update({ status, metadata: { lastEvent: event } as never });
  const { error: updErr } = apiPaymentId
    ? await upd.eq("api_payment_id", apiPaymentId)
    : await upd.eq("order_id", orderId!);
  if (updErr) {
    console.warn("[wallid-idempotency] update failed:", updErr.message);
  }
  return { applied: !updErr, currentStatus };
}

/**
 * Stamp `processed_at` on the event row once fan-out completes. Read by
 * the admin triage UI + reconciliation cron to distinguish
 * "received but never processed" from "fully applied".
 */
export async function markEventProcessed(
  supabaseAdmin: SupabaseClient,
  eventId: string,
): Promise<void> {
  try {
    await supabaseAdmin
      .from("wallid_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .is("processed_at", null);
  } catch (e) {
    console.warn("[wallid-idempotency] markEventProcessed failed:", e instanceof Error ? e.message : e);
  }
}
