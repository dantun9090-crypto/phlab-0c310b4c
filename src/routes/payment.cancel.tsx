import { createFileRoute } from "@tanstack/react-router";
import { XCircle } from "lucide-react";

export const Route = createFileRoute("/payment/cancel")({
  head: () => ({
    meta: [
      { title: "Payment Cancelled — PH Labs" },
      { name: "description", content: "Your bank payment was cancelled and no charge was made. Retry checkout or switch to manual bank transfer at PH Labs UK." },
      { property: "og:title", content: "Payment Cancelled — PH Labs" },
      { property: "og:description", content: "Your bank payment was cancelled and no charge was made. Retry checkout or switch to manual bank transfer at PH Labs UK." },
      { name: "twitter:description", content: "Your bank payment was cancelled and no charge was made. Retry checkout or switch to manual bank transfer at PH Labs UK." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: PaymentCancelPage,
});

function PaymentCancelPage() {
  const params =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const orderId = params?.get("order_id") || params?.get("orderId") || "";

  return (
    <>
      <Helmet>
        <title>Payment cancelled — PH Labs</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <XCircle className="w-12 h-12 mx-auto text-amber-400" />
          <h1 className="mt-4 text-2xl font-bold text-white">Payment cancelled</h1>
          <p className="mt-2 text-sm text-slate-300">
            Your bank payment was cancelled and{orderId ? <> order <span className="font-mono text-emerald-400">{orderId}</span></> : " your order"} has not been charged. Your basket is empty — you can place the order again, or switch to Manual Bank Transfer at checkout.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <a
              href="/checkout"
              className="inline-block rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400"
            >
              Try again
            </a>
            <a
              href="/products"
              className="inline-block rounded-lg bg-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-600"
            >
              Back to shop
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
