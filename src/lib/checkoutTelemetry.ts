/**
 * Checkout / Wallid telemetry.
 *
 * Structured Firestore logging for the Wallid checkout flow. Every write is
 * fire-and-forget and wrapped in try/catch — telemetry MUST NEVER block
 * checkout. When `?checkout_debug=1` is in the URL, events are also mirrored
 * to `console.log`.
 *
 * Collection: `checkoutTelemetry` (auto-generated document IDs).
 */

import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type CheckoutErrorType = 'network' | 'validation' | 'timeout' | 'unknown';

export type CheckoutEvent =
  | { stage: 'preflight_start'; cartId: string; timestamp: number }
  | {
      stage: 'preflight_success';
      cartId: string;
      responseSummary: string;
      durationMs: number;
    }
  | {
      stage: 'preflight_fail';
      cartId: string;
      errorType: CheckoutErrorType;
      errorMessage: string;
      statusCode?: number;
      durationMs: number;
      retryCount?: number;
    }
  | { stage: 'redirect_target'; cartId: string; url: string; timestamp: number }
  | {
      stage: 'gateway_error';
      cartId: string;
      gateway: 'wallid' | 'peptidepay' | 'brokkrpay' | 'nowpayments';
      errorCode: string;
      errorMessage: string;
      timestamp: number;
    }
  | { stage: 'pay_click'; cartId: string; timestamp: number }
  | { stage: 'create_order_start'; cartId: string; timestamp: number }
  | {
      stage: 'create_order_success' | 'create_order_fail';
      cartId: string;
      orderId?: string;
      error?: string;
      durationMs: number;
    };

function isDebug(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.location.search.includes('checkout_debug=1');
  } catch {
    return false;
  }
}

function safeUA(): string {
  if (typeof navigator === 'undefined') return '';
  try {
    return String(navigator.userAgent || '').slice(0, 300);
  } catch {
    return '';
  }
}

function safeUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.location.href || '').slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Log a checkout telemetry event. Never throws; failures are swallowed so
 * telemetry cannot break the payment flow.
 */
export async function logCheckoutEvent(event: CheckoutEvent): Promise<void> {
  if (isDebug()) {
    try {
      // eslint-disable-next-line no-console
      console.log('[checkout-event]', event.stage, event);
    } catch {
      /* ignore */
    }
  }
  try {
    // Shape-locked payload — must match the /checkoutTelemetry rule in
    // firestore.rules (hasOnly type/sessionId/createdAt/path/source/code/
    // message/extra, with per-field size limits).
    const e = event as Record<string, unknown>;
    const code =
      e.statusCode !== undefined
        ? String(e.statusCode)
        : typeof e.errorCode === 'string'
          ? e.errorCode
          : typeof e.errorType === 'string'
            ? e.errorType
            : null;
    const message =
      typeof e.errorMessage === 'string'
        ? e.errorMessage
        : typeof e.error === 'string'
          ? e.error
          : null;
    const extraSource: Record<string, unknown> = {};
    for (const key of ['gateway', 'orderId', 'durationMs', 'retryCount', 'responseSummary', 'url', 'userAgent'] as const) {
      if (e[key] !== undefined) extraSource[key] = e[key];
    }
    extraSource.userAgent = safeUA().slice(0, 200);

    await addDoc(collection(db, 'checkoutTelemetry'), {
      type: String(event.stage).slice(0, 63),
      sessionId: String(e.cartId ?? 'unknown').slice(0, 79),
      createdAt: serverTimestamp(),
      path: safeUrl().slice(0, 319),
      source: 'checkout',
      code: code ? code.slice(0, 99) : null,
      message: message ? message.slice(0, 499) : null,
      extra: JSON.stringify(extraSource).slice(0, 599),
    });
  } catch {
    /* telemetry must never block checkout */
  }
}
