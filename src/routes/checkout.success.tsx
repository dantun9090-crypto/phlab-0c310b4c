import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader, CheckCircle2, AlertCircle } from "lucide-react";

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get("order_id") || params.get("orderId") || "";
    setOrderId(oid);
    if (!oid) {
      setPhase("error");
      setError("Missing order reference.");
      return;
    }

    const deadline = Date.now() + 180_000;
    const tick = async () => {
      if (stopRef.current) return;
      try {
        const res = await fetch(`/api/payments/status?orderId=${encodeURIComponent(oid)}`, {
          headers: { accept: "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        const status = String(data.status || "").toUpperCase();
        if (status === "SUCCESS" || status === "PAID" || status === "COMPLETED") {
          setPhase("paid");
          try {
            localStorage.removeItem("php_cart");
            localStorage.removeItem("php_pending_order");
            window.dispatchEvent(new StorageEvent("storage", { key: "php_cart" }));
          } catch { /* ignore */ }
          return;
        }
        if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
          setPhase("error");
          setError("Payment was not completed. Please try again.");
          return;
        }
        if (Date.now() > deadline) {
          setPhase("pending");
          return;
        }
        setTimeout(tick, 2500);
      } catch (e) {
        setPhase("error");
        setError(e instanceof Error ? e.message : "Could not check payment status.");
      }
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
            <Loader className="w-10 h-10 mx-auto text-amber-400" />
            <h1 className="mt-4 text-xl font-bold text-white">Still processing</h1>
            <p className="mt-2 text-sm text-slate-300">Your bank hasn't confirmed yet. You can safely close this page — we'll email you as soon as it lands. Order <span className="font-mono text-emerald-400">{orderId}</span>.</p>
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
