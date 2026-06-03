/**
 * Pure helper that computes the Firestore field updates for an `orders`
 * document in response to a Fena payment webhook event. Extracted from
 * `src/routes/api/public/hooks/fena.ts` so the idempotency / overwrite
 * rules can be unit tested without Firebase.
 *
 * Rules:
 * - `fenaStatus`, `fenaEventIds`, `fenaLastEventAt` are always refreshed.
 * - `status: 'paid'`, `paidAt`, `paymentProvider: 'fena'`, `fenaPaymentId`
 *   are only written on the FIRST pending → paid transition.
 * - If the order is already `paid`, OR if `paymentProvider` / `fenaPaymentId`
 *   are already set on the order, those fields MUST NOT be overwritten by
 *   a later webhook event (replay, status echo, refund attempt, etc.).
 * - A pending order seeing a `cancelled`/`expired` event flips to cancelled.
 */
export interface FenaOrderRow {
  status?: unknown;
  paymentProvider?: unknown;
  fenaPaymentId?: unknown;
  fenaEventIds?: unknown;
}

export interface FenaAuthoritative {
  status?: unknown;
  completedAt?: unknown;
}

export interface ComputeFenaUpdatesInput {
  orderRow: FenaOrderRow;
  authoritative: FenaAuthoritative;
  fenaPaymentId: string;
  now?: Date;
}

export interface FenaUpdatePlan {
  updates: Record<string, unknown>;
  eventKey: string;
  isDuplicate: boolean;
  transitionedToPaid: boolean;
}

export function computeFenaOrderUpdates(
  input: ComputeFenaUpdatesInput,
): FenaUpdatePlan {
  const { orderRow, authoritative, fenaPaymentId } = input;
  const now = input.now ?? new Date();

  const seenEvents = Array.isArray(orderRow.fenaEventIds)
    ? (orderRow.fenaEventIds as string[])
    : [];
  const eventKey = `${authoritative.status}:${authoritative.completedAt ?? ""}`;

  if (seenEvents.includes(eventKey)) {
    return { updates: {}, eventKey, isDuplicate: true, transitionedToPaid: false };
  }

  const currentStatus = String(orderRow.status ?? "pending").toLowerCase();
  const fenaStatus = String(authoritative.status ?? "").toLowerCase();
  const isPaid = fenaStatus === "paid";
  const isCancelled = fenaStatus === "cancelled" || fenaStatus === "expired";
  const alreadyPaid = currentStatus === "paid";

  const updates: Record<string, unknown> = {
    fenaStatus,
    fenaEventIds: [...seenEvents.slice(-19), eventKey],
    fenaLastEventAt: now,
  };

  const existingProvider =
    typeof orderRow.paymentProvider === "string" ? orderRow.paymentProvider : "";
  const existingFenaPaymentId =
    typeof orderRow.fenaPaymentId === "string" ? orderRow.fenaPaymentId : "";

  let transitionedToPaid = false;
  if (isPaid && !alreadyPaid) {
    updates.status = "paid";
    updates.paidAt = now;
    if (!existingProvider) updates.paymentProvider = "fena";
    if (fenaPaymentId && !existingFenaPaymentId) {
      updates.fenaPaymentId = fenaPaymentId;
    }
    transitionedToPaid = true;
  } else if (isCancelled && currentStatus === "pending") {
    updates.status = "cancelled";
  }

  return { updates, eventKey, isDuplicate: false, transitionedToPaid };
}
