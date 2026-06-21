import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader, CheckCircle2, AlertCircle, RefreshCw, LifeBuoy } from "lucide-react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { trackPurchase, type GaItem } from "@/lib/analytics";

/**
 * Fire GA4 `purchase` event exactly once per order. Reads the order doc
 * (preferring snapshot data if provided) and converts items → GaItem[].
 * Idempotency: localStorage flag `php_ga_purchase_<orderId>` prevents
 * duplicate events on refresh or when both the snapshot and the polling
 * path resolve simultaneously.
 */
async function fireGaPurchaseOnce(orderId: string, snapData?: Record<string, unknown>) {
  if (!orderId || typeof window === "undefined") return;
  const key = `php_ga_purchase_${orderId}`;
  try { if (localStorage.getItem(key) === "1") return; } catch { /* ignore */ }
  try {
    let data = snapData;
    if (!data) {
      const snap = await getDoc(doc(db, "orders", orderId));
      if (!snap.exists()) return;
      data = snap.data() as Record<string, unknown>;
    }
    const totalRaw = (data.total ?? data.totalPrice ?? data.amount ?? 0) as number | string;
    const value = typeof totalRaw === "string" ? parseFloat(totalRaw) : Number(totalRaw);
    const rawItems = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
    const items: GaItem[] = rawItems.map((it) => ({
      item_id: String(it.id ?? it.productId ?? it.sku ?? it.slug ?? ""),
      item_name: String(it.name ?? it.title ?? "Item"),
      item_variant: it.variantName ? String(it.variantName) : (it.variant ? String(it.variant) : undefined),
      price: Number(it.priceNum ?? it.price ?? 0),
      quantity: Number(it.quantity ?? 1),
      currency: "GBP",
    }));
    trackPurchase(orderId, Number.isFinite(value) ? value : 0, items);
    try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
  } catch { /* ignore — analytics must never break the success page */ }
}

export const Route = createFileRoute("/checkout/success")({
  head: () => ({
    meta: [
      { title: "Payment Confirmed — PH Labs" },
      { name: "description", content: "Your research peptide order with PH Labs UK has been received." },
      { property: "og:title", content: "Payment Confirmed — PH Labs" },
      { property: "og:description", content: "Your research peptide order with PH Labs UK has been received." },
      { property: "og:url", content: "https://phlabs.co.uk/checkout/success" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
    links: [{ rel: "canonical", href: "https://phlabs.co.uk/checkout/success" }],
  }),
  component: CheckoutSuccessPage,
});

type Phase = "checking" | "paid" | "pending" | "error";

// Escalation tiers shown while the order stays non-terminal:
//   pending  → standard "we're confirming" copy (after 8s soft deadline)
//   waiting  → "your bank is taking longer than usual" + manual refresh (after 60s)
//   support  → "if payment was deducted, contact support" + order id (after 5min)
//   alert    → "your payment may have been processed, check your bank" (after 10min)
type Escalation = "none" | "waiting" | "support" | "alert";

function CheckoutSuccessPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [escalation, setEscalation] = useState<Escalation>("none");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const stopRef = useRef(false);
  const phaseRef = useRef<Phase>("checking");
  const startedAtRef = useRef<number>(Date.now());
  const setPhaseSafe = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get("order_id") || params.get("orderId") || "";
    setOrderId(oid);
    if (!oid) {
      setPhaseSafe("error");
      setError("Missing order reference.");
      return;
    }

    startedAtRef.current = Date.now();

    // Soft deadline (8s): flip spinner → "Still processing" with a clear
    // exit (View my orders). Hard deadline (90s): stop polling entirely so
    // we never sit on a spinning loader if the Wallid webhook never lands
    // or the status API keeps erroring.
    const softDeadline = Date.now() + 8_000;
    const hardDeadline = Date.now() + 90_000;
    let attempt = 0;
    let consecutiveErrors = 0;

    // Real-time Firestore listener (Item 1): for authed users only, since
    // orders RLS requires `resource.data.userId == request.auth.uid`. If
    // the webhook lands first while the user is on the page, this fires
    // immediately — no polling lag.
    let unsubSnap: (() => void) | null = null;
    const attachSnapshot = async () => {
      try { await auth.authStateReady(); } catch { /* ignore */ }
      if (stopRef.current || !auth.currentUser) return;
      try {
        unsubSnap = onSnapshot(
          doc(db, "orders", oid),
          (snap) => {
            if (stopRef.current || !snap.exists()) return;
            const s = String((snap.data() as { status?: unknown }).status ?? "").toLowerCase();
            if (s === "paid" || s === "processing" || s === "shipped" || s === "delivered") {
              setPhaseSafe("paid");
              void fireGaPurchaseOnce(oid, snap.data() as Record<string, unknown>);
              try {
                localStorage.removeItem("php_cart");
                localStorage.removeItem("php_pending_order");
                localStorage.removeItem(`php_pt_${oid}`);
                window.dispatchEvent(new StorageEvent("storage", { key: "php_cart" }));
              } catch { /* ignore */ }
              stopRef.current = true;
            } else if (s === "failed" || s === "expired") {
              setPhaseSafe("error");
              setError("Payment was not completed. Please try again.");
              stopRef.current = true;
            } else if (s === "cancelled") {
              setPhaseSafe("error");
              setError("Payment was cancelled at the bank. You can retry from your account.");
              stopRef.current = true;
            } else if (s === "needs_review") {
              // Surface support escalation immediately on needs_review.
              setEscalation("support");
            }
          },
          () => { /* permission denied / offline — polling continues */ },
        );
      } catch { /* ignore */ }
    };
    void attachSnapshot();

    // Escalation timers — independent of polling so they always fire.
    const waitingTimer = setTimeout(() => {
      if (stopRef.current) return;
      if (phaseRef.current !== "paid") setEscalation((cur) => (cur === "none" ? "waiting" : cur));
    }, 60_000);
    const supportTimer = setTimeout(() => {
      if (stopRef.current) return;
      if (phaseRef.current !== "paid") setEscalation((cur) => (cur === "alert" ? cur : "support"));
    }, 5 * 60_000);
    const alertTimer = setTimeout(() => {
      if (stopRef.current) return;
      if (phaseRef.current !== "paid") setEscalation("alert");
    }, 10 * 60_000);

    const tick = async () => {
      if (stopRef.current) return;
      attempt += 1;
      try {
        try { await auth.authStateReady(); } catch { /* ignore */ }
        const idToken = auth.currentUser
          ? await auth.currentUser.getIdToken().catch(() => null)
          : null;
        let paymentToken: string | null = null;
        try { paymentToken = localStorage.getItem(`php_pt_${oid}`); } catch { /* ignore */ }

        // /api/payments/status already polls Wallid AND atomically transitions
        // the Firestore order on a terminal remote status — this *is* our
        // fallback poll (Item 3). The very first tick (attempt=1) acts as the
        // one-time on-load reconcile call.
        const res = await fetch(`/api/payments/status`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ orderId: oid, idToken, paymentToken }),
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({} as Record<string, unknown>));

        if (!res.ok) {
          consecutiveErrors += 1;
        } else {
          consecutiveErrors = 0;
          const status = String((data as { status?: unknown }).status || "").toUpperCase();
          if (status === "SUCCESS" || status === "PAID" || status === "COMPLETED") {
            setPhaseSafe("paid");
            try {
              localStorage.removeItem("php_cart");
              localStorage.removeItem("php_pending_order");
              localStorage.removeItem(`php_pt_${oid}`);
              window.dispatchEvent(new StorageEvent("storage", { key: "php_cart" }));
            } catch { /* ignore */ }
            return; // terminal — stop polling
          }
          if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
            setPhaseSafe("error");
            setError("Payment was not completed. Please try again.");
            return; // terminal — stop polling
          }
        }

        // Non-terminal: surface "Still processing" once the soft deadline
        // hits OR after 3 consecutive errors so the user is never stuck on
        // a spinner with no way out.
        if (phaseRef.current === "checking" && (Date.now() > softDeadline || consecutiveErrors >= 3)) {
          setPhaseSafe("pending");
        }
      } catch {
        consecutiveErrors += 1;
        if (phaseRef.current === "checking" && (Date.now() > softDeadline || consecutiveErrors >= 3)) {
          setPhaseSafe("pending");
        }
      }

      // Hard stop after 90s — don't poll forever. After that we rely on the
      // onSnapshot listener (for authed users) and the manual Refresh button.
      if (Date.now() > hardDeadline) {
        if (phaseRef.current === "checking") setPhaseSafe("pending");
        return;
      }

      // Backoff capped at 10s: 2.5, 2.5, 3, 4, 5 … 10s
      const delay = Math.min(10_000, 2_500 + Math.max(0, attempt - 2) * 1_000);
      setTimeout(tick, delay);
    };
    tick();
    return () => {
      stopRef.current = true;
      clearTimeout(waitingTimer);
      clearTimeout(supportTimer);
      clearTimeout(alertTimer);
      if (unsubSnap) try { unsubSnap(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function manualRefresh() {
    if (!orderId || refreshing) return;
    setRefreshing(true);
    try {
      try { await auth.authStateReady(); } catch { /* ignore */ }
      const idToken = auth.currentUser
        ? await auth.currentUser.getIdToken().catch(() => null)
        : null;
      let paymentToken: string | null = null;
      try { paymentToken = localStorage.getItem(`php_pt_${orderId}`); } catch { /* ignore */ }
      const res = await fetch(`/api/payments/status`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ orderId, idToken, paymentToken }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok) {
        const status = String((data as { status?: unknown }).status || "").toUpperCase();
        if (status === "SUCCESS" || status === "PAID" || status === "COMPLETED") {
          setPhaseSafe("paid");
        } else if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
          setPhaseSafe("error");
          setError("Payment was not completed. Please try again.");
        }
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        {phase === "checking" && (
          <>
            <Loader className="w-10 h-10 mx-auto text-emerald-500 animate-spin" />
            <h1 className="mt-4 text-xl font-bold text-white">Confirming your payment…</h1>
            <p className="mt-2 text-sm text-slate-300">We're waiting for your bank to confirm.</p>
          </>
        )}
        {phase === "paid" && (
          <>
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
            <h1 className="mt-4 text-2xl font-bold text-white">Payment confirmed</h1>
            <p className="mt-2 text-sm text-slate-300">
              Thank you. Order <span className="font-mono text-emerald-400">{orderId}</span> is confirmed and a receipt is on its way to your email.
            </p>
            <a href="/account" className="mt-6 inline-block rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400">View my orders</a>
          </>
        )}
        {phase === "pending" && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto text-amber-400" />
            <h1 className="mt-4 text-xl font-bold text-white">
              {escalation === "alert"
                ? "Still no confirmation from your bank"
                : "Payment received — confirming with your bank"}
            </h1>

            {escalation === "none" && (
              <p className="mt-2 text-sm text-slate-300">
                Your bank hasn't sent the final confirmation yet. You can safely close this page — we'll email you as soon as it lands. Order <span className="font-mono text-emerald-400">{orderId}</span>.
              </p>
            )}

            {escalation === "waiting" && (
              <>
                <p className="mt-2 text-sm text-slate-300">
                  We're still confirming your payment. Your bank is taking longer than usual. Order <span className="font-mono text-emerald-400">{orderId}</span>.
                </p>
                <button
                  type="button"
                  onClick={() => void manualRefresh()}
                  disabled={refreshing}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Checking…" : "Refresh status"}
                </button>
              </>
            )}

            {escalation === "support" && (
              <>
                <p className="mt-2 text-sm text-slate-300">
                  If payment was deducted from your account, contact support and quote your order ID. We'll reconcile it for you.
                </p>
                <div className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                  Order ID: <span className="font-mono text-emerald-400 select-all">{orderId}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void manualRefresh()}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Checking…" : "Refresh status"}
                  </button>
                  <a
                    href={`/contact?subject=${encodeURIComponent(`Stuck payment — order ${orderId}`)}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                  >
                    <LifeBuoy className="w-4 h-4" />
                    Contact support
                  </a>
                </div>
              </>
            )}

            {escalation === "alert" && (
              <>
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-sm text-amber-100">
                  Your payment <span className="font-semibold">may have been processed</span>. Please check your bank statement before paying again. We're still waiting on the bank's confirmation on our side.
                </div>
                <div className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                  Order ID: <span className="font-mono text-emerald-400 select-all">{orderId}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void manualRefresh()}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Checking…" : "Refresh status"}
                  </button>
                  <a
                    href={`/contact?subject=${encodeURIComponent(`Stuck payment — order ${orderId}`)}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                  >
                    <LifeBuoy className="w-4 h-4" />
                    Contact support
                  </a>
                </div>
              </>
            )}

            <a href="/account" className="mt-6 inline-block text-xs text-slate-400 underline hover:text-slate-200">View my orders</a>
          </>
        )}
        {phase === "error" && (
          <>
            <AlertCircle className="w-10 h-10 mx-auto text-rose-400" />
            <h1 className="mt-4 text-xl font-bold text-white">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-300">{error}</p>
            <a href="/checkout" className="mt-6 inline-block rounded-lg bg-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-600">Back to checkout</a>
          </>
        )}
      </div>
    </div>
  );
}
