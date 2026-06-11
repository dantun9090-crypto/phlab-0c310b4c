import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { getOrderPaymentStatus } from "@/lib/fena.functions";
import { Loader, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/payment/success")({
  head: () => ({
    meta: [
      { title: "Payment Confirmed — PH Labs" },
      { name: "description", content: "Your research peptide order with PH Labs UK has been received and is being processed for tracked dispatch." },
      { property: "og:title", content: "Payment Confirmed — PH Labs" },
      { property: "og:description", content: "Your research peptide order with PH Labs UK has been received and is being processed for tracked dispatch." },
      { name: "twitter:description", content: "Your research peptide order with PH Labs UK has been received and is being processed for tracked dispatch." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: PaymentSuccessPage,
});

type Phase = "checking" | "paid" | "pending" | "error";

function PaymentSuccessPage() {
  const fetchStatus = useServerFn(getOrderPaymentStatus);
  const [phase, setPhase] = useState<Phase>("checking");
  const [reference, setReference] = useState<string>("");
  const [error, setError] = useState<string>("");
  const stopRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("payment_id") || "";
    const storedOrderId = paymentId
      ? localStorage.getItem(`php_tl_order_${paymentId}`) || ""
      : "";
    // Accept ?order_id=... / ?orderId=... from legacy providers, or TrueLayer's
    // ?payment_id=... and resolve the order server-side.
    const rawOrderId = params.get("order_id") || params.get("orderId") || storedOrderId;
    const orderId = rawOrderId.toUpperCase();
    setReference(orderId || paymentId);
    if (!orderId && !paymentId) {
      setPhase("error");
      setError("No order reference in URL. Please complete checkout from your cart.");
      return;
    }
    if (orderId && !/^PHP-[A-Z0-9-]{6,}$/.test(orderId)) {
      setPhase("error");
      setError(
        `Invalid order reference "${rawOrderId}". This usually means an old browser tab or a direct link. Please return to checkout and place the order again.`,
      );
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPhase("error");
        setError("Please sign in to view this order.");
        return;
      }
      const deadline = Date.now() + 240_000;
      // Webhook may still be propagating when the user lands here.
      // Give "Order not found" up to 10s of retries before surfacing it.
      const notFoundDeadline = Date.now() + 10_000;
      const tick = async () => {
        if (stopRef.current) return;
        try {
          const idToken = await user.getIdToken();
          console.log("Success page checking payment:", orderId || paymentId);
          const res = await fetchStatus({ data: orderId ? { idToken, orderId } : { idToken, paymentId } });
          if (res.orderId) setReference(res.orderId);
          console.log("Order found:", true, "status:", res.status, "paid:", res.paid);
          if (res.paid) {
            setPhase("paid");
            // Clear the cart only AFTER the bank confirms — keeps the
            // basket intact if the user cancels at the bank's HPP.
            try {
              localStorage.removeItem("php_cart");
              localStorage.removeItem("php_pending_order");
              window.dispatchEvent(new StorageEvent("storage", { key: "php_cart" }));
            } catch { /* ignore */ }
            return;
          }
          if (Date.now() > deadline) {
            setPhase("pending");
            return;
          }
          setTimeout(tick, 2500);
        } catch (err: any) {
          const msg = String(err?.message || "");
          console.log("Order found:", false, "error:", msg);
          // Retry transient "Order not found" while webhook catches up.
          if (/order not found/i.test(msg) && Date.now() < notFoundDeadline) {
            setTimeout(tick, 1000);
            return;
          }
          setPhase("error");
          setError(msg || "Failed to check status.");
        }
      };
      tick();
    });

    return () => {
      stopRef.current = true;
      unsub();
    };
  }, [fetchStatus]);

  return (
    <>
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          {phase === "checking" && (
            <>
              <Loader className="w-10 h-10 mx-auto text-emerald-500 animate-spin" />
              <h1 className="mt-4 text-xl font-bold text-white">Confirming your payment…</h1>
              <p className="mt-2 text-sm text-slate-300">
                We're waiting for the bank to confirm. This usually takes a few seconds.
              </p>
            </>
          )}
          {phase === "paid" && (
            <>
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
              <h1 className="mt-4 text-2xl font-bold text-white">Payment Confirmed</h1>
              <p className="mt-2 text-sm text-slate-300">
                Thank you. Order <span className="font-mono text-emerald-400">{reference}</span> is
                now confirmed and a receipt is on its way to your email.
              </p>
              <a
                href="/account"
                className="mt-6 inline-block rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                View my orders
              </a>
            </>
          )}
          {phase === "pending" && (
            <>
              <Loader className="w-10 h-10 mx-auto text-amber-400" />
              <h1 className="mt-4 text-xl font-bold text-white">Still processing</h1>
              <p className="mt-2 text-sm text-slate-300">
                Your bank hasn't confirmed yet. You can safely close this page — we'll email you
                as soon as the payment lands. Order
                <span className="ml-1 font-mono text-emerald-400">{reference}</span>.
              </p>
            </>
          )}
          {phase === "error" && (
            <>
              <AlertCircle className="w-10 h-10 mx-auto text-rose-400" />
              <h1 className="mt-4 text-xl font-bold text-white">Something went wrong</h1>
              <p className="mt-2 text-sm text-slate-300">{error}</p>
              <a
                href="/checkout"
                className="mt-6 inline-block rounded-lg bg-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-600"
              >
                Back to checkout
              </a>
            </>
          )}
        </div>
      </div>
    </>
  );
}
