/**
 * "Pay with Tide" panel — alternative payment surface for PH Labs.
 *
 * Shows the Tide payment request message, a scannable QR code for the hosted
 * Tide payment link (QR code / Open Banking), and a button that opens the same
 * link in a new tab. Pure presentation — no order logic lives here.
 *
 * The QR image is generated client-side (lazy-loaded `qrcode`) so there is no
 * third-party QR service call and nothing to render during SSR/prerender.
 */
import { useEffect, useState } from "react";
import { ExternalLink, QrCode, ShieldCheck, Smartphone } from "lucide-react";

export const TIDE_PAYMENT_URL =
  "https://pay.tide.co/pay/f054694d-bfda-4f38-9e42-62d4177525cb";

export const TIDE_PAYMENT_MESSAGE =
  "Ph Labs has requested a payment. Pay securely via Tide (QR code or Open Banking).";

export default function TidePayPanel({
  reference,
  compact = false,
  preview = false,
}: {
  /** Optional order/payment reference shown so we can match the payment. */
  reference?: string | null;
  compact?: boolean;
  /** Checkout preview: explain the flow, no QR / reference until the order exists. */
  preview?: boolean;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(TIDE_PAYMENT_URL, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 320,
          color: { dark: "#020617", light: "#ffffff" },
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        /* QR is a convenience — the button below always works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-testid="tide-pay-panel"
      className={`rounded-2xl border border-emerald-500/25 bg-slate-900/60 ${
        compact ? "p-4" : "p-4 sm:p-5"
      } text-left`}
    >
      <p className="text-sm leading-relaxed text-slate-200">{TIDE_PAYMENT_MESSAGE}</p>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="mx-auto sm:mx-0 shrink-0 rounded-2xl border border-white/10 bg-white p-2.5">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR code to open the PH Labs Tide payment page"
              width={144}
              height={144}
              className="h-36 w-36"
              data-testid="tide-qr-image"
            />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center text-slate-400">
              <QrCode className="h-8 w-8" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-300">
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>Scan the QR code with your phone camera, or tap the button to pay in your banking app.</span>
          </p>

          <a
            href={TIDE_PAYMENT_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="tide-pay-button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 min-h-[48px]"
          >
            Pay with Tide
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>

          {reference ? (
            <div className="rounded-xl border-2 border-amber-400/50 bg-amber-500/10 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                Required — payment reference
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  data-testid="tide-reference"
                  className="font-mono text-base font-bold tracking-widest text-white break-all"
                >
                  {reference}
                </span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(reference)}
                  className="ml-auto shrink-0 rounded-lg border border-amber-400/40 px-2.5 py-1.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/15"
                >
                  Copy
                </button>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug text-amber-100">
                Enter this reference in the payment reference / message field when you scan the QR
                code or open the link, so we can match your payment.
              </p>
            </div>
          ) : (
            <p
              data-testid="tide-reference-notice"
              className="rounded-xl border-2 border-amber-400/50 bg-amber-500/10 px-3 py-2 text-[11.5px] leading-snug text-amber-100"
            >
              <span className="font-semibold">Reference number required.</span> After you place the
              order we show your reference — you must type it into the payment reference field when
              scanning the QR code or opening the Tide link, otherwise we cannot match your payment.
            </p>
          )}


          <p className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            Secure payment page hosted by Tide · QR code or Open Banking
          </p>
        </div>
      </div>
    </div>
  );
}
