import { describe, it, expect, beforeEach } from "vitest";
import {
  verifyBackupCaller,
  noteBackupFailure,
  noteBadAuth,
  checkIpLockout,
  BACKUP_LOCKOUT_CONFIG,
  _resetFailureTrackerForTests,
} from "./firestore-backup-auth";

const ENV = {
  SUPABASE_PUBLISHABLE_KEY: "sb_pub_" + "a".repeat(40),
  SUPABASE_ANON_KEY: "sb_anon_" + "b".repeat(40),
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_vite_" + "c".repeat(40),
  CLEANUP_SECRET: "cron-secret-" + "d".repeat(32),
};

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://example.com/api/public/hooks/firestore-backup", {
    method: "POST",
    headers,
  });
}

describe("verifyBackupCaller", () => {
  it("rejects requests with no credential headers", () => {
    const r = verifyBackupCaller(reqWith({}), ENV);
    expect(r).toEqual({ ok: false, status: 401, reason: "missing" });
  });

  it("rejects arbitrary long apikey strings (regression: no length-only check)", () => {
    const r = verifyBackupCaller(
      reqWith({ apikey: "x".repeat(500) }),
      ENV,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid");
  });

  it("rejects a partial match / prefix of the real key", () => {
    const r = verifyBackupCaller(
      reqWith({ apikey: ENV.SUPABASE_PUBLISHABLE_KEY.slice(0, -1) }),
      ENV,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown x-cron-secret", () => {
    const r = verifyBackupCaller(
      reqWith({ "x-cron-secret": "not-the-secret-value" }),
      ENV,
    );
    expect(r.ok).toBe(false);
  });

  it("accepts an exact apikey match (publishable key)", () => {
    const r = verifyBackupCaller(
      reqWith({ apikey: ENV.SUPABASE_PUBLISHABLE_KEY }),
      ENV,
    );
    expect(r).toEqual({ ok: true, method: "apikey" });
  });

  it("accepts an exact apikey match (anon key)", () => {
    const r = verifyBackupCaller(
      reqWith({ apikey: ENV.SUPABASE_ANON_KEY }),
      ENV,
    );
    expect(r.ok).toBe(true);
  });

  it("accepts an exact x-cron-secret match", () => {
    const r = verifyBackupCaller(
      reqWith({ "x-cron-secret": ENV.CLEANUP_SECRET }),
      ENV,
    );
    expect(r).toEqual({ ok: true, method: "cron_secret" });
  });

  it("does not accept apikey against CLEANUP_SECRET or vice versa", () => {
    expect(
      verifyBackupCaller(reqWith({ apikey: ENV.CLEANUP_SECRET }), ENV).ok,
    ).toBe(false);
    expect(
      verifyBackupCaller(
        reqWith({ "x-cron-secret": ENV.SUPABASE_PUBLISHABLE_KEY }),
        ENV,
      ).ok,
    ).toBe(false);
  });

  it("rejects when the configured env values are missing", () => {
    const r = verifyBackupCaller(
      reqWith({ apikey: "anything" }),
      {},
    );
    expect(r.ok).toBe(false);
  });
});

describe("noteBackupFailure", () => {
  beforeEach(() => _resetFailureTrackerForTests());

  it("does not spike below the threshold", () => {
    const a = noteBackupFailure(1_000);
    const b = noteBackupFailure(2_000);
    expect(a.spike).toBe(false);
    expect(b.spike).toBe(false);
  });

  it("spikes at the 3rd failure inside the 15m window", () => {
    noteBackupFailure(1_000);
    noteBackupFailure(2_000);
    const c = noteBackupFailure(3_000);
    expect(c.spike).toBe(true);
    expect(c.count).toBe(3);
  });

  it("evicts old failures outside the window", () => {
    noteBackupFailure(0);
    noteBackupFailure(1_000);
    // Advance well beyond 15m window.
    const later = noteBackupFailure(60 * 60 * 1000);
    expect(later.count).toBe(1);
    expect(later.spike).toBe(false);
  });
});

describe("noteBadAuth / checkIpLockout", () => {
  beforeEach(() => _resetFailureTrackerForTests());

  const IP = "203.0.113.9";

  it("does not lock before the threshold", () => {
    for (let i = 0; i < BACKUP_LOCKOUT_CONFIG.BAD_AUTH_THRESHOLD - 1; i++) {
      const r = noteBadAuth(IP, 1_000 + i);
      expect(r.locked).toBe(false);
      expect(r.justLocked).toBe(false);
    }
    expect(checkIpLockout(IP, 2_000).locked).toBe(false);
  });

  it("locks at the threshold and flags justLocked exactly once", () => {
    let last;
    for (let i = 0; i < BACKUP_LOCKOUT_CONFIG.BAD_AUTH_THRESHOLD; i++) {
      last = noteBadAuth(IP, 1_000 + i);
    }
    expect(last!.locked).toBe(true);
    expect(last!.justLocked).toBe(true);
    // Subsequent bad-auth events keep locked=true but do NOT re-flag justLocked.
    const again = noteBadAuth(IP, 5_000);
    expect(again.locked).toBe(true);
    expect(again.justLocked).toBe(false);
  });

  it("checkIpLockout is read-only and reports retry-after", () => {
    for (let i = 0; i < BACKUP_LOCKOUT_CONFIG.BAD_AUTH_THRESHOLD; i++) {
      noteBadAuth(IP, 1_000);
    }
    const status = checkIpLockout(IP, 1_000);
    expect(status.locked).toBe(true);
    expect(status.retryAfterSec).toBeGreaterThan(0);
    expect(status.retryAfterSec).toBeLessThanOrEqual(
      Math.ceil(BACKUP_LOCKOUT_CONFIG.LOCKOUT_MS / 1000),
    );
  });

  it("expires the lockout after LOCKOUT_MS", () => {
    for (let i = 0; i < BACKUP_LOCKOUT_CONFIG.BAD_AUTH_THRESHOLD; i++) {
      noteBadAuth(IP, 1_000);
    }
    const past = 1_000 + BACKUP_LOCKOUT_CONFIG.LOCKOUT_MS + 1;
    expect(checkIpLockout(IP, past).locked).toBe(false);
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < BACKUP_LOCKOUT_CONFIG.BAD_AUTH_THRESHOLD; i++) {
      noteBadAuth("198.51.100.1", 1_000);
    }
    expect(checkIpLockout("198.51.100.1", 1_000).locked).toBe(true);
    expect(checkIpLockout("198.51.100.2", 1_000).locked).toBe(false);
  });
});
