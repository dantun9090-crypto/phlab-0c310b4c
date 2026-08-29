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
import { Check, Copy, ExternalLink, QrCode, ShieldCheck, Smartphone } from "lucide-react";

export { TIDE_PAYMENT_URL, TIDE_PAYMENT_MESSAGE } from "@/lib/tide";

/**
 * Tide's hosted payment page is configured inside Tide and does NOT accept
 * amount/reference query parameters — appending them was ignored (and made the
 * link look prefilled when it wasn't). Keep the link clean; the amount and the
 * reference are shown in the panel for the customer to type in.
 */
export function buildTidePaymentUrl(
  _reference?: string | null,
  _amountGbp?: string | number | null,
) {
  return TIDE_PAYMENT_URL;
}

export default function TidePayPanel({
  reference,
  amountGbp,
  compact = false,
  preview = false,
}: {
  /** Optional order/payment reference shown so we can match the payment. */
  reference?: string | null;
  /** Order total in GBP, attached to the link and shown to the customer. */
  amountGbp?: string | number | null;
  compact?: boolean;
  /** Checkout preview: explain the flow, no QR / reference until the order exists. */
  preview?: boolean;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const payUrl = buildTidePaymentUrl(reference, amountGbp);
  const amountNumber = amountGbp == null ? null : Number(amountGbp);
  const amountLabel =
    amountNumber != null && Number.isFinite(amountNumber) && amountNumber > 0
      ? `£${amountNumber.toFixed(2)}`
      : null;

  useEffect(() => {
    if (!copiedRef) return;
    const t = setTimeout(() => setCopiedRef(false), 2000);
    return () => clearTimeout(t);
  }, [copiedRef]);

  const handleCopyReference = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopiedRef(true);
    } catch {
      /* clipboard blocked — the reference is still visible above */
    }
  };

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(payUrl, {
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
  }, [preview, payUrl]);

  if (preview) {
    return (
      <div
        data-testid="tide-pay-preview"
        className="rounded-2xl border border-emerald-500/25 bg-slate-900/60 p-4 text-left"
      >
        <p className="text-sm leading-relaxed text-slate-200">{TIDE_PAYMENT_MESSAGE}</p>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
          <li className="flex items-start gap-2">
            <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>After you place the order we show your QR code and a “Pay with Tide” link.</span>
          </li>
          <li className="flex items-start gap-2">
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>Your payment reference is shown on the confirmation screen — type it into the reference field when you pay.</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
            <span>Secure payment page hosted by Tide · QR code or Open Banking.</span>
          </li>
        </ul>
      </div>
    );
  }

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
            href={payUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="tide-pay-button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 min-h-[48px]"
          >
            {amountLabel ? `Pay ${amountLabel} with Tide` : "Pay with Tide"}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>

          {amountLabel ? (
            <p
              data-testid="tide-amount"
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
            >
              Enter this amount in Tide:{" "}
              <span className="font-semibold text-white">{amountLabel}</span> (GBP)
            </p>
          ) : null}

          {reference ? (
            <div className="min-w-0 rounded-xl border-2 border-amber-400/50 bg-amber-500/10 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                Required — payment reference
              </p>
              <div className="mt-1.5 rounded-lg border border-amber-400/30 bg-slate-950/50 px-2.5 py-2">
                <span
                  data-testid="tide-reference"
                  className="block font-mono text-[15px] font-bold tracking-wider text-white break-all"
                >
                  {reference}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyReference}
                onTouchStart={() => {
                  /* iOS needs a touch listener for reliable tap handling */
                }}
                data-testid="tide-copy-reference"
                aria-label={`Copy payment reference ${reference}`}
                className="mt-2 inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-400/25 active:bg-amber-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                {copiedRef ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" /> Reference copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" /> Copy reference
                  </>
                )}
              </button>
              <p className="mt-2 text-[11.5px] leading-snug text-amber-100">
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
