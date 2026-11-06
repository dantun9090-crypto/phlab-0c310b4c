/**
 * Tide hosted payment page constants.
 *
 * Kept in a plain module (no React / lucide imports) so both the client
 * component (`src/components/TidePayPanel.tsx`) and server-side email
 * templates can share the same URL and copy.
 */
export const TIDE_PAYMENT_URL =
  "https://pay.tide.co/pay/f054694d-bfda-4f38-9e42-62d4177525cb";

export const TIDE_PAYMENT_MESSAGE =
  "Ph Labs has requested a payment. Pay securely via Tide (QR code or Open Banking).";
