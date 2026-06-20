import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader, CheckCircle2, AlertCircle } from "lucide-react";
import { auth } from "@/lib/firebase";

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

function CheckoutSuccessPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const stopRef = useRef(false);
  const phaseRef = useRef<Phase>("checking");
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

    // Soft deadline (8s): flip spinner → "Still processing" with a clear
    // exit (View my orders). Hard deadline (90s): stop polling entirely so
    // we never sit on a spinning loader if the Wallid webhook never lands
    // or the status API keeps erroring. Previous code compared a stale
    // `phase` closure and polled forever — that's the infinite-spinner bug.
    const softDeadline = Date.now() + 8_000;
    const hardDeadline = Date.now() + 90_000;
    let attempt = 0;
    let consecutiveErrors = 0;

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

        const res = await fetch(`/api/payments/status`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ orderId: oid, idToken, paymentToken }),
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

      // Hard stop after 90s — don't poll forever.
      if (Date.now() > hardDeadline) {
        if (phaseRef.current === "checking") setPhaseSafe("pending");
        return;
      }

      // Backoff capped at 10s: 2.5, 2.5, 3, 4, 5 … 10s
      const delay = Math.min(10_000, 2_500 + Math.max(0, attempt - 2) * 1_000);
      setTimeout(tick, delay);
    };
    tick();
    return () => { stopRef.current = true; };
  }, []);




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
            <h1 className="mt-4 text-xl font-bold text-white">Payment received — confirming with your bank</h1>
            <p className="mt-2 text-sm text-slate-300">
              Your bank hasn't sent the final confirmation yet. You can safely close this page — we'll email you as soon as it lands. Order <span className="font-mono text-emerald-400">{orderId}</span>.
            </p>
            <a href="/account" className="mt-6 inline-block rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400">View my orders</a>
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
