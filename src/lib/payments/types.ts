/**
 * Shared types for the multi-gateway payments layer.
 * Safe to import on the client (no server-only modules referenced).
 */

export type GatewayId = "fena" | "truelayer" | "nowpayments";

/**
 * NOWPayments integration mode, selectable in Admin → Payment Gateways:
 *  - "invoice": the customer is redirected to the hosted NOWPayments invoice
 *    page and picks the coin there (fully hosted, simplest).
 *  - "payment": a deposit-address payment is created via the API and the
 *    address/QR is rendered on our own page (phase 2 checkout work).
 */
export type NowpaymentsFlow = "invoice" | "payment";

export type GatewayPriority = "primary" | "backup" | "disabled";

export interface PaymentGatewayConfig {
  id: GatewayId;
  name: string;
  enabled: boolean;
  priority: GatewayPriority;
  sandbox: boolean;
  status: "enabled" | "disabled" | "pending";
  /** ISO timestamp from the last test-connection call. */
  lastTestedAt?: string | null;
  testStatus?: "ok" | "fail" | null;
  errorMessage?: string | null;
  errorCount?: number;
  /** Masked credential preview (last 4 of client id / terminal id). */
  apiKeyMasked?: string | null;
  webhookUrl: string;
  /** True when the required server-side secrets are populated. */
  credentialsConfigured: boolean;
  /** NOWPayments-only: which creation flow checkout uses. Ignored by other gateways. */
  flow?: NowpaymentsFlow;
}

export interface CheckoutPaymentOption {
  id: GatewayId;
  name: string;
  label: string;
  description: string;
  sandbox: boolean;
}

export interface CheckoutPaymentOptions {
  primary: CheckoutPaymentOption | null;
  backups: CheckoutPaymentOption[];
  manualFallback: boolean;
}

export const GATEWAY_DISPLAY: Record<GatewayId, { name: string; label: string; description: string }> = {
  fena: {
    name: "Fena",
    label: "Pay by Bank",
    description: "Instant Open Banking transfer via Fena. No card, no chargebacks.",
  },
  truelayer: {
    name: "TrueLayer",
    label: "Pay by Bank",
    description: "Instant Open Banking transfer via TrueLayer. FCA-regulated.",
  },
  nowpayments: {
    name: "NOWPayments",
    label: "Pay with Crypto",
    description: "Crypto payments (BTC, ETH, USDT and 300+ coins) via NOWPayments. Non-custodial.",
  },
};
