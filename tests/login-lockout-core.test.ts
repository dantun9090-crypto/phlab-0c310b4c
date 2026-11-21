/**
 * Server-owned login lockout state machine (since 2026-11-21).
 *
 * Pins the window/cooldown logic so the gate cannot silently regress the
 * way the legacy browser-side version did (its Firestore reads were
 * admin-only while the client ran anonymously, so it never engaged at
 * all). Also pins the anti-tamper brakes: no lock extension while locked
 * and a minimum interval between counted failures.
 */
import { describe, expect, it } from 'vitest';

import {
  COOLDOWN_MS,
  MAX_FAILURES,
  MIN_FAILURE_INTERVAL_MS,
  WINDOW_MS,
  emailKey,
  evaluate,
  nextFailure,
} from '@/lib/server/login-lockout-core';

const T0 = 1_800_000_000_000; // fixed "now" for deterministic tests

describe('emailKey', () => {
  it('is deterministic and normalises case/whitespace', () => {
    expect(emailKey('  John.Smith@Gmail.com ')).toBe(emailKey('john.smith@gmail.com'));
    expect(emailKey('john.smith@gmail.com')).toBe('email_john_smith_gmail_com');
  });

  it('caps the doc id length', () => {
    expect(emailKey(`${'a'.repeat(500)}@x.com`).length).toBeLessThanOrEqual(206);
  });
});

describe('evaluate', () => {
  it('treats a missing doc as open', () => {
    expect(evaluate(null, T0)).toEqual({ locked: false, remainingMs: 0, failures: 0 });
  });

  it('reports an active lock with remaining time', () => {
    const s = evaluate({ failures: 5, lockedUntilMs: T0 + 60_000 }, T0);
    expect(s).toEqual({ locked: true, remainingMs: 60_000, failures: 5 });
  });

  it('ignores an expired lock', () => {
    const s = evaluate({ failures: 9, lockedUntilMs: T0 - 1 }, T0);
    expect(s.locked).toBe(false);
  });
});

describe('nextFailure', () => {
  it('starts a fresh counter at 1 with no lock', () => {
    const { state, patch } = nextFailure(null, T0);
    expect(state).toEqual({ locked: false, remainingMs: 0, failures: 1 });
    expect(patch).not.toBeNull();
    expect(patch!.failures).toBe(1);
    expect(patch!.lockedUntil).toBeNull();
    expect((patch!.firstFailureAt as Date).getTime()).toBe(T0);
  });

  it('increments within the window', () => {
    const doc = { failures: 2, firstFailureAtMs: T0 - 60_000, lastFailureAtMs: T0 - 10_000 };
    const { state, patch } = nextFailure(doc, T0);
    expect(state.failures).toBe(3);
    expect(state.locked).toBe(false);
    expect((patch!.firstFailureAt as Date).getTime()).toBe(T0 - 60_000);
  });

  it('locks at MAX_FAILURES with the full cooldown', () => {
    const doc = { failures: MAX_FAILURES - 1, firstFailureAtMs: T0 - 60_000, lastFailureAtMs: T0 - 10_000 };
    const { state, patch } = nextFailure(doc, T0);
    expect(state.locked).toBe(true);
    expect(state.remainingMs).toBe(COOLDOWN_MS);
    expect((patch!.lockedUntil as Date).getTime()).toBe(T0 + COOLDOWN_MS);
  });

  it('resets the counter after the window expires', () => {
    const doc = { failures: 4, firstFailureAtMs: T0 - WINDOW_MS - 1, lastFailureAtMs: T0 - WINDOW_MS - 1 };
    const { state, patch } = nextFailure(doc, T0);
    expect(state.failures).toBe(1);
    expect(state.locked).toBe(false);
    expect((patch!.firstFailureAt as Date).getTime()).toBe(T0);
  });

  it('never extends an active lock, even under hammering', () => {
    const doc = {
      failures: 8,
      firstFailureAtMs: T0 - 30_000,
      lastFailureAtMs: T0 - 30_000,
      lockedUntilMs: T0 + 120_000,
    };
    const { state, patch } = nextFailure(doc, T0);
    expect(patch).toBeNull();
    expect(state.locked).toBe(true);
    expect(state.remainingMs).toBe(120_000); // unchanged, not T0+COOLDOWN
  });

  it('ignores scripted bursts faster than the minimum interval', () => {
    const doc = { failures: 2, firstFailureAtMs: T0 - 60_000, lastFailureAtMs: T0 - MIN_FAILURE_INTERVAL_MS + 1 };
    const { state, patch } = nextFailure(doc, T0);
    expect(patch).toBeNull();
    expect(state.failures).toBe(2);
  });
});
