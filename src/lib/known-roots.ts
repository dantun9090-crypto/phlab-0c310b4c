// Shared whitelist of first-segment paths the SPA actually owns.
// Used by both src/routes/$.tsx (meta tags) and src/server.ts (Worker headers/status)
// so that unknown URLs return a real HTTP 404 with x-robots-tag: noindex,
// not just a meta tag (which Google ignores when the HTTP header says index).
export const KNOWN_ROOTS: ReadonlySet<string> = new Set<string>([
  "", "products", "product", "resources", "research", "compound", "search",
  "about", "contact", "compare",
  "shipping-policy", "refund-policy", "terms-and-conditions",
  "terms", "terms-of-service",
  "privacy-policy", "privacy", "cookies", "cookie-policy", "privacy-requests",
  "lab-reports", "quality-control", "storage-guide",
  "landing",
  "cart", "checkout", "payment", "order", "orders", "account", "login", "signup",
  "register", "auth", "reset-password", "forgot-password", "verify",
  "admin", "thank-you", "success", "cancel",
  "faq", "faqs", "blog", "install", "vip", "vip-store",
]);

export function isKnownFirstSegment(pathname: string): boolean {
  const seg = pathname.replace(/^\/+/, "").split("/")[0]?.split("?")[0] ?? "";
  return KNOWN_ROOTS.has(seg);
}
