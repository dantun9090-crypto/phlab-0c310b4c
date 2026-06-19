import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { XCircle } from "lucide-react";
import { auth } from "@/lib/firebase";

export const Route = createFileRoute("/checkout/cancel")({
  head: () => ({
    meta: [
      { title: "Payment Cancelled — PH Labs" },
      { name: "description", content: "Your bank payment was cancelled and no charge was made." },
      { property: "og:title", content: "Payment Cancelled — PH Labs" },
      { property: "og:description", content: "Your bank payment was cancelled and no charge was made." },
      { property: "og:url", content: "https://phlabs.co.uk/checkout/cancel" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
    links: [{ rel: "canonical", href: "https://phlabs.co.uk/checkout/cancel" }],
  }),
  component: CheckoutCancelPage,
});

function CheckoutCancelPage() {
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get("order_id") || params.get("orderId") || "";
    setOrderId(oid);
    if (!oid) return;
    // Best-effort: mark the Wallid payment as cancelled in our DB.
    // The server accepts either a Firebase ID token OR the guest
    // paymentToken stored in localStorage, so logged-out guests can also
    // cancel their own pending order.
    (async () => {
      try {
        const idToken = auth.currentUser
          ? await auth.currentUser.getIdToken().catch(() => null)
          : null;
        let paymentToken: string | null = null;
        try { paymentToken = localStorage.getItem(`php_pt_${oid}`); } catch { /* ignore */ }
        if (!idToken && !paymentToken) return;
        await fetch("/api/payments/cancel", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken, paymentToken, orderId: oid }),
        });
        // The server burns the token after cancel; clear it locally too so
        // a subsequent page load doesn't keep retrying.
        try { localStorage.removeItem(`php_pt_${oid}`); } catch { /* ignore */ }
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <XCircle className="w-12 h-12 mx-auto text-amber-400" />
        <h1 className="mt-4 text-2xl font-bold text-white">Payment cancelled</h1>
        <p className="mt-2 text-sm text-slate-300">
          Your bank payment was cancelled or failed{orderId ? <> for order <span className="font-mono text-emerald-400">{orderId}</span></> : ""}. No charge was made.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <a href="/checkout" className="inline-block rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400">Try again</a>
          <a href="/products" className="inline-block rounded-lg bg-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-600">Back to shop</a>
        </div>
      </div>
    </div>
  );
}
