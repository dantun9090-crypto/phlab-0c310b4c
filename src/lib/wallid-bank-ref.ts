/**
 * Wallid bank-side reference helper.
 *
 * PROBLEM: banks frequently show Wallid's OWN payment identifier (or a
 * Wallid narrative) on the customer's statement instead of our
 * `PHP-XXXXXXXX` order number, even though we send the order number in
 * every reference-like field (`reference`, `payment_reference`,
 * `remittance_information`, `description`). That is provider-side and we
 * cannot change it.
 *
 * MITIGATION: Wallid's checkout link embeds a base64 payload containing its
 * internal `paymentId` (and `shopId`). That `paymentId` is what shows up on
 * the bank side. We extract and store it on the order as `wallidBankRef`,
 * so an admin can paste whatever narrative the bank shows into the order
 * search and land on the right order.
 *
 * Pure functions only — safe for client bundles.
 */

export interface WallidLinkPayload {
  /** Wallid's internal payment id — the value banks tend to display. */
  paymentId?: string;
  /** Wallid merchant/shop id. */
  shopId?: string;
  price?: number;
  currency?: string;
}

function decodeBase64(value: string): string | null {
  try {
    // Tolerate URL-safe base64 and missing padding.
    const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
    if (typeof atob === "function") return atob(padded);
    // Node / Worker fallback.
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Parses the `?data=` payload out of a Wallid payment link.
 * Returns null for anything unparseable — never throws.
 */
export function parseWallidPaymentLink(
  paymentLink: string | null | undefined,
): WallidLinkPayload | null {
  if (!paymentLink || typeof paymentLink !== "string") return null;
  let raw: string | null = null;
  try {
    const url = new URL(paymentLink);
    raw = url.searchParams.get("data");
  } catch {
    const match = /[?&]data=([^&#]+)/.exec(paymentLink);
    raw = match ? decodeURIComponent(match[1]!) : null;
  }
  if (!raw) return null;
  const json = decodeBase64(raw);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as WallidLinkPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The bank-side reference for a Wallid payment: its internal `paymentId`.
 * Returns null when the link is missing or malformed.
 */
export function extractWallidBankRef(
  paymentLink: string | null | undefined,
): string | null {
  const payload = parseWallidPaymentLink(paymentLink);
  const id = payload?.paymentId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Normalises a reference for fuzzy matching: uppercase, alphanumeric only.
 * Lets an admin paste a messy bank narrative
 * ("WALLID*6A6D0427CB2DB0035B553C6F GBP") and still match.
 */
export function normaliseRefForMatch(value: string | null | undefined): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * True when `needle` (e.g. a bank statement narrative) references the order
 * via any of its known references. Both sides are normalised first.
 */
export function bankNarrativeMatches(
  needle: string,
  refs: Array<string | null | undefined>,
): boolean {
  const hay = normaliseRefForMatch(needle);
  if (hay.length < 4) return false;
  return refs.some((ref) => {
    const candidate = normaliseRefForMatch(ref);
    if (candidate.length < 4) return false;
    return hay.includes(candidate) || candidate.includes(hay);
  });
}
