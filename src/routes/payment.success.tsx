import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Helmet } from "react-helmet-async";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { getOrderPaymentStatus } from "@/lib/fena.functions";
import { Loader, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/payment/success")({
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
    const orderId = params.get("orderId") || "";
    setReference(orderId);
    if (!orderId) {
      setPhase("error");
      setError("Missing order reference.");
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPhase("error");
        setError("Please sign in to view this order.");
        return;
      }
      const deadline = Date.now() + 240_000;
      const tick = async () => {
        if (stopRef.current) return;
        try {
          const idToken = await user.getIdToken();
          const res = await fetchStatus({ data: { idToken, orderId } });
          if (res.paid) {
            setPhase("paid");
            return;
          }
          if (Date.now() > deadline) {
            setPhase("pending");
            return;
          }
          setTimeout(tick, 2500);
        } catch (err: any) {
          setPhase("error");
          setError(err?.message || "Failed to check status.");
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
      <Helmet>
        <title>Payment — PH Labs</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
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
              <h1 className="mt-4 text-2xl font-bold text-white">Payment received</h1>
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
                Your bank hasn't confirmed yet. You can safely close this page —
                we'll email you as soon as the payment lands. Order
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
