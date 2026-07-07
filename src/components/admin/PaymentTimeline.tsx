/**
 * Payment timeline for a single order.
 *
 * Subscribes to `orders/{orderId}/paymentTimeline` (Firestore) ordered by
 * `timestamp desc` and renders a vertical audit trail. Written by:
 *   - Wallid webhook handler (actor = "wallid_webhook")
 *   - reconcile-payments cron (actor = "cron_job")
 *   - Admin "Force reconciliation" button (actor = "admin_panel")
 *
 * Read-only. Admin-only surface — assumes the parent route already
 * enforces the admin auth guard.
 */
import { useEffect, useMemo, useState } from "react";
import {
  db,
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from "@/lib/firebase";
import type { PaymentTimelineEvent } from "@/types/payments";
import {
  CreditCard,
  RefreshCw,
  Shield,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

interface Props {
  orderId: string;
}

const ACTOR_ICON: Record<PaymentTimelineEvent["actor"], typeof CreditCard> = {
  wallid_webhook: CreditCard,
  cron_job: RefreshCw,
  admin_panel: Shield,
  system: AlertTriangle,
};

const ACTOR_LABEL: Record<PaymentTimelineEvent["actor"], string> = {
  wallid_webhook: "Wallid webhook",
  cron_job: "Reconcile cron",
  admin_panel: "Admin action",
  system: "System",
};

const EVENT_LABEL: Record<PaymentTimelineEvent["eventType"], string> = {
  payment_initiated: "Payment initiated",
  payment_received: "Payment received",
  payment_failed: "Payment failed",
  reconciliation_run: "Reconciliation run",
  fulfilment_state_changed: "Fulfilment state changed",
  conflict_detected: "Conflict detected",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  paid: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
  cancelled: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  refunded: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  conflict_detected: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  unknown: "bg-slate-700/40 text-slate-300 border-slate-600/40",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status?.toLowerCase()] || STATUS_STYLE.unknown;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-mono uppercase tracking-wide ${cls}`}
    >
      {status || "—"}
    </span>
  );
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  const anyV = v as { toDate?: () => Date; seconds?: number };
  if (typeof anyV.toDate === "function") return anyV.toDate();
  if (typeof anyV.seconds === "number") return new Date(anyV.seconds * 1000);
  return null;
}

export default function PaymentTimeline({ orderId }: Props) {
  const [events, setEvents] = useState<PaymentTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    const q = query(
      collection(doc(db, "orders", orderId), "paymentTimeline"),
      orderBy("timestamp", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: PaymentTimelineEvent[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            timestamp: toDate(data.timestamp) || new Date(),
            actor: (data.actor as PaymentTimelineEvent["actor"]) || "system",
            eventType:
              (data.eventType as PaymentTimelineEvent["eventType"]) ||
              "reconciliation_run",
            statusFrom: String(data.statusFrom || ""),
            statusTo: String(data.statusTo || ""),
            amount: typeof data.amount === "number" ? data.amount : undefined,
            currency:
              typeof data.currency === "string" ? data.currency : undefined,
            apiPaymentId:
              typeof data.apiPaymentId === "string" ? data.apiPaymentId : undefined,
            metadata: (data.metadata as Record<string, unknown>) || undefined,
          };
        });
        setEvents(rows);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [orderId]);

  const latest = events[0];
  const lastUpdate = useMemo(
    () => (latest ? format(latest.timestamp, "HH:mm:ss dd MMM yyyy") : "—"),
    [latest],
  );

  return (
    <div className="bg-[#0b1a30]/60 border border-white/[0.07] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          Payment Timeline
        </h3>
        <span className="text-[#9cb8d9] text-xs">{events.length} event(s)</span>
      </div>

      {loading && <p className="text-[#9cb8d9] text-sm py-4">Loading…</p>}
      {error && (
        <p className="text-red-400 text-sm py-2">Failed to load timeline: {error}</p>
      )}
      {!loading && !error && events.length === 0 && (
        <p className="text-[#9cb8d9] text-sm py-4">
          No payment events recorded yet.
        </p>
      )}

      {events.length > 0 && (
        <ol className="relative border-l border-white/10 pl-5 space-y-4">
          {events.map((ev) => {
            const Icon = ACTOR_ICON[ev.actor] || AlertTriangle;
            return (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[29px] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 border border-white/10">
                  <Icon className="w-3 h-3 text-emerald-300" />
                </span>
                <div className="bg-[#08182c] border border-white/[0.06] rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-white text-sm font-medium">
                      {EVENT_LABEL[ev.eventType] || ev.eventType}
                    </span>
                    <span className="text-[#8caad4] text-[11px] font-mono">
                      {format(ev.timestamp, "HH:mm:ss dd MMM yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-[#9cb8d9]">{ACTOR_LABEL[ev.actor]}</span>
                    <span className="text-[#4a6a94]">·</span>
                    <StatusBadge status={ev.statusFrom || "—"} />
                    <span className="text-[#4a6a94]">→</span>
                    <StatusBadge status={ev.statusTo || "—"} />
                  </div>
                  {(ev.amount !== undefined || ev.apiPaymentId) && (
                    <div className="flex items-center gap-3 text-xs text-[#9cb8d9] font-mono">
                      {ev.amount !== undefined && (
                        <span>
                          {ev.currency || "GBP"} {ev.amount.toFixed(2)}
                        </span>
                      )}
                      {ev.apiPaymentId && (
                        <span className="truncate">pay: {ev.apiPaymentId}</span>
                      )}
                    </div>
                  )}
                  {ev.metadata?.retryAttempt !== undefined && (
                    <p className="text-[11px] text-[#8caad4]">
                      Retry attempt #{String(ev.metadata.retryAttempt)}
                    </p>
                  )}
                  {typeof ev.metadata?.reason === "string" && (
                    <p className="text-[11px] text-[#9cb8d9] bg-slate-800/50 rounded px-2 py-1">
                      {ev.metadata.reason}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {latest && (
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
          <div>
            <p className="text-[#9cb8d9] text-[10px] uppercase tracking-wide">
              Current state
            </p>
            <div className="mt-1">
              <StatusBadge status={latest.statusTo} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-[#9cb8d9] text-[10px] uppercase tracking-wide">
              Last update
            </p>
            <p className="text-white text-xs font-mono mt-1">{lastUpdate}</p>
          </div>
        </div>
      )}
    </div>
  );
}
