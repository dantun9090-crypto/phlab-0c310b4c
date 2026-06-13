// Append-only audit trail for privileged admin actions.
// Writes to Firestore `auditLogs` collection; only admins can read.
// Use logAdminAction() from any admin-only client surface that mutates
// products, prices, stock, orders, customers, or permissions.

import { auth, db, collection, addDoc, Timestamp } from '@/lib/firebase';

export type AdminAuditAction =
  | 'customer.role.update'
  | 'customer.vip.toggle'
  | 'customer.deactivate'
  | 'order.status.update'
  | 'order.dispatch'
  | 'order.royal_mail_create'
  | 'order.refund'
  | 'order.delete'
  | 'product.update'
  | 'product.price.update'
  | 'product.stock.update'
  | 'banner.update'
  | 'coupon.create'
  | 'coupon.delete'
  | 'settings.update'
  | 'ipWhitelist.update';

interface LogPayload {
  action: AdminAuditAction;
  target: string; // e.g. `customers/${uid}`, `orders/${id}`
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

function safeDiff(value: unknown): unknown {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

export async function logAdminAction(payload: LogPayload): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;
    await addDoc(collection(db, 'auditLogs'), {
      adminUid: user.uid,
      adminEmail: user.email ?? null,
      action: payload.action,
      target: payload.target,
      before: safeDiff(payload.before) ?? null,
      after: safeDiff(payload.after) ?? null,
      meta: payload.meta ?? null,
      timestamp: Timestamp.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 256) : null,
    });
  } catch (err) {
    // Audit logging must never break the actual admin action.
    // eslint-disable-next-line no-console
    console.warn('[audit] failed to log admin action', payload.action, err);
  }
}
