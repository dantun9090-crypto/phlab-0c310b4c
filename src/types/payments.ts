/**
 * Shared TypeScript types for the payment-reliability layer:
 *   - webhookEvents           (Firestore collection, keyed by api_payment_id)
 *   - orders/{id}/paymentTimeline  (audit trail per order)
 *   - retryQueue              (Firestore collection, keyed by api_payment_id)
 *
 * Safe to import on the client — no server-only modules referenced.
 */

export type WebhookEventSource = "wallid_webhook" | "cron_reconciliation" | "manual_retry";
export type WebhookEventStatus = "pending" | "processed" | "failed" | "conflict";

export interface WebhookEvent {
  id: string;
  orderId: string;
  source: WebhookEventSource;
  status: WebhookEventStatus;
  payload: Record<string, unknown>;
  processedAt: Date | null;
  createdAt: Date;
  errorMessage?: string;
  attemptCount: number;
}

export type PaymentTimelineActor =
  | "wallid_webhook"
  | "cron_job"
  | "admin_panel"
  | "system";

export type PaymentTimelineEventType =
  | "payment_initiated"
  | "payment_received"
  | "payment_failed"
  | "reconciliation_run"
  | "fulfilment_state_changed"
  | "conflict_detected";

export interface PaymentTimelineEvent {
  id: string;
  timestamp: Date;
  actor: PaymentTimelineActor;
  eventType: PaymentTimelineEventType;
  statusFrom: string;
  statusTo: string;
  amount?: number;
  currency?: string;
  apiPaymentId?: string;
  metadata?: Record<string, unknown>;
}

export interface RetryQueueItem {
  id: string;
  orderId: string;
  apiPaymentId: string;
  payload: Record<string, unknown>;
  nextAttemptAt: Date;
  attemptCount: number;
  maxAttempts: number;
  lastError: string;
  createdAt: Date;
  source?: string;
}
