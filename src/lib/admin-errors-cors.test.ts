import { describe, it, expect } from "vitest";

// Re-implement the exact allowlist logic from admin-errors.ts so the test
// pins the intended behaviour without importing the route module (which
// pulls in TanStack + Firestore-admin).
const ALLOWED_HOST_SUFFIXES = [
  "phlabs.co.uk",
  "prohealthpeptides.co.uk",
  "lovable.app",
  "lovable.dev",
  "lovable.project.com",
] as const;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  let host: string;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return ALLOWED_HOST_SUFFIXES.some(
    (s) => host === s || host.endsWith("." + s),
  );
}

describe("admin-errors CORS allowlist", () => {
  it("accepts exact allowed hosts", () => {
    expect(isAllowedOrigin("https://phlabs.co.uk")).toBe(true);
    expect(isAllowedOrigin("https://www.phlabs.co.uk")).toBe(true);
    expect(isAllowedOrigin("https://foo.lovable.app")).toBe(true);
    expect(isAllowedOrigin("https://phlabs.lovable.dev")).toBe(true);
  });

  it("REJECTS lookalike suffix / prefix attacks", () => {
    expect(isAllowedOrigin("https://evil-phlabs.co.uk")).toBe(false);
    expect(isAllowedOrigin("https://phlabs.co.uk.attacker.com")).toBe(false);
    expect(isAllowedOrigin("https://xphlabs.co.uk")).toBe(false);
    expect(isAllowedOrigin("https://lovable.app.evil.com")).toBe(false);
    expect(isAllowedOrigin("https://notlovable.app")).toBe(false);
  });

  it("rejects garbage / missing / non-http origins", () => {
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin("")).toBe(false);
    expect(isAllowedOrigin("not-a-url")).toBe(false);
    expect(isAllowedOrigin("javascript:alert(1)")).toBe(false);
    expect(isAllowedOrigin("file:///etc/passwd")).toBe(false);
  });

  it("is case-insensitive on host", () => {
    expect(isAllowedOrigin("https://PHLABS.CO.UK")).toBe(true);
    expect(isAllowedOrigin("https://Foo.Lovable.App")).toBe(true);
  });
});
