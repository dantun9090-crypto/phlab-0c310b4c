/**
 * Admin "Force reconciliation" control for a stuck order.
 *
 * Writes to `retryQueue/{apiPaymentId}` with nextAttemptAt = now so the
 * reconcile cron picks it up on its next tick (≤ 5 min). Also appends a
 * `reconciliation_run` event to the order's paymentTimeline for the audit
 * trail.
 *
 * Read/write is done client-side via the Firestore client SDK. Assumes
 * admin auth guard is already enforced by the parent route.
 */
import { useState } from "react";
import {
  db,
  doc,
  setDoc,
  addDoc,
  collection,
  Timestamp,
} from "@/lib/firebase";
import { RefreshCw, Play, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  orderId: string;
  apiPaymentId?: string;
  currentStatus: string;
}

export default function WebhookRetryCard({
  orderId,
  apiPaymentId,
  currentStatus,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const disabled = !apiPaymentId || loading;

  async function handleRetry() {
    if (!apiPaymentId) return;
    setLoading(true);
    setMessage(null);
    try {
      // Merge-write only the fields needed to (re)schedule the run — do NOT
      // clobber an existing `payload` or reset `attemptCount` on a live retry
      // row queued by the webhook path. `source: manual_retry` signals the
      // cron drain loop to poll the provider (and to dequeue even when the
      // provider still reports no terminal status) so the row can't jam.
      await setDoc(
        doc(db, "retryQueue", apiPaymentId),
        {
          orderId,
          apiPaymentId,
          nextAttemptAt: Timestamp.now(),
          maxAttempts: 5,
          lastError: "manual retry",
          source: "manual_retry",
          manualRetryAt: Timestamp.now(),
        },
        { merge: true },
      );
      await addDoc(collection(doc(db, "orders", orderId), "paymentTimeline"), {
        timestamp: Timestamp.now(),
        actor: "admin_panel",
        eventType: "reconciliation_run",
        statusFrom: currentStatus || "",
        statusTo: currentStatus || "",
        apiPaymentId,
        metadata: { reason: "Manual retry triggered by admin" },
      });
      setMessage({
        kind: "ok",
        text: "Retry queued. Check timeline in ~30 seconds.",
      });
    } catch (e) {
      setMessage({
        kind: "err",
        text: e instanceof Error ? e.message : "Failed to queue retry",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#0b1a30]/60 border border-white/[0.07] rounded-xl p-4 mt-3">
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw className="w-4 h-4 text-emerald-400" />
        <h3 className="text-white text-sm font-semibold">Webhook Retry</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <p className="text-[#9cb8d9] uppercase tracking-wide text-[10px]">
            api_payment_id
          </p>
          <p className="text-white font-mono break-all">
            {apiPaymentId || "—"}
          </p>
        </div>
        <div>
          <p className="text-[#9cb8d9] uppercase tracking-wide text-[10px]">
            Current status
          </p>
          <p className="text-white font-mono">{currentStatus || "—"}</p>
        </div>
      </div>

      <button
        onClick={handleRetry}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-200 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px]"
      >
        {loading ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
        Force Reconciliation
      </button>
      {!apiPaymentId && (
        <p className="mt-2 text-[11px] text-[#9cb8d9] flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          No api_payment_id on this order — cannot queue a retry.
        </p>
      )}
      {message && (
        <p
          className={`mt-2 text-[11px] flex items-center gap-1.5 ${
            message.kind === "ok" ? "text-emerald-300" : "text-red-300"
          }`}
        >
          {message.kind === "ok" ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <AlertCircle className="w-3 h-3" />
          )}
          {message.text}
        </p>
      )}
    </div>
  );
}
