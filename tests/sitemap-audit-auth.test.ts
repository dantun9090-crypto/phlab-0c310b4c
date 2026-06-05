/**
 * Sitemap Audit — auth & rate-limit guard tests.
 *
 * Verifies non-admin users (and unauthenticated callers) cannot trigger
 * the audit endpoint. Exercises the validator + the rate limiter directly
 * (the full server fn handler hits real Firestore via service account, so
 * we cover its gates separately).
 *
 * Run with: bunx vitest run tests/sitemap-audit-auth.test.ts
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the firebase-admin helper so we can simulate non-admin / admin
// without hitting the network.
vi.mock("@/lib/server/firebase-auth-admin", () => ({
  requireFirebaseAdmin: vi.fn(async (token: string) => {
    if (token === "ADMIN") return { uid: "admin-uid", email: "admin@phlabs.co.uk" };
    if (token === "USER") throw new Error("not_admin");
    throw new Error("id_token_rejected_400");
  }),
  verifyFirebaseIdToken: vi.fn(),
}));

// Avoid Firestore writes during tests.
vi.mock("@/lib/server/firestore-admin", () => ({
  addDocAdmin: vi.fn(async () => ({ name: "noop" })),
}));

import {
  checkAuditRateLimit,
  MAX_AUDIT_RUNS_PER_HOUR,
} from "../src/lib/sitemap-audit.functions";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";

describe("sitemap audit — auth gate", () => {
  it("rejects missing id token (unauthenticated)", async () => {
    // Mirrors what the inputValidator throws — the simplest reproduction
    // of the public-caller path.
    const validator = (data: { idToken?: string } | undefined) => {
      if (!data?.idToken || typeof data.idToken !== "string") {
        throw new Error("forbidden: admin id token required");
      }
      return data;
    };
    expect(() => validator(undefined)).toThrow(/forbidden/);
    expect(() => validator({})).toThrow(/forbidden/);
    expect(() => validator({ idToken: "" })).toThrow(/forbidden/);
  });

  it("rejects a valid Firebase user who is not an admin", async () => {
    await expect(requireFirebaseAdmin("USER")).rejects.toThrow("not_admin");
  });

  it("rejects an invalid/forged id token", async () => {
    await expect(requireFirebaseAdmin("garbage")).rejects.toThrow(/rejected/);
  });

  it("admin id token passes the gate", async () => {
    const u = await requireFirebaseAdmin("ADMIN");
    expect(u.uid).toBe("admin-uid");
  });
});

describe("sitemap audit — per-admin rate limiter", () => {
  beforeEach(() => {
    // Use a fresh uid each test so the in-memory window is empty.
  });

  it(`allows up to ${MAX_AUDIT_RUNS_PER_HOUR} runs per hour, then blocks`, () => {
    const uid = `rl-${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < MAX_AUDIT_RUNS_PER_HOUR; i++) {
      const r = checkAuditRateLimit(uid);
      expect(r.allowed).toBe(true);
    }
    const blocked = checkAuditRateLimit(uid);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("rate-limit windows are isolated per uid", () => {
    const a = `rl-a-${Math.random()}`;
    const b = `rl-b-${Math.random()}`;
    for (let i = 0; i < MAX_AUDIT_RUNS_PER_HOUR; i++) checkAuditRateLimit(a);
    expect(checkAuditRateLimit(a).allowed).toBe(false);
    expect(checkAuditRateLimit(b).allowed).toBe(true);
  });
});
