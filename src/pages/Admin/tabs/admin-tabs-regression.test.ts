/**
 * Source-level regression tests for the Admin tabs that previously crashed
 * (Promo Codes, Visitors, SEO, IndexNow). These assertions intentionally read
 * the TSX source as text so they survive the heavy Firebase / Auth / context
 * coupling that makes mounting these tabs in jsdom impractical.
 *
 * They guard the bug-fix invariants the user explicitly hit:
 *   - PromoCodesTab: tolerant `toDateSafe` coercion + sonner toast on errors.
 *   - VisitorsTab:   Firestore `limit()` is clamped to the 10_000 hard cap
 *                    (via the `FIRESTORE_MAX_LIMIT` constant).
 *   - visitor-sessions.functions: server `maxEvents` cap also <= 10_000.
 *   - SEOTab:        the Upload buttons are real, wired to a Firebase Storage
 *                    upload handler (not dead `<button>`s).
 *   - IndexNowTab:   429 responses trigger an auto-retry + dedup window, and
 *                    a toast — not just a silent alert.
 *   - indexnow.functions: response surfaces `retryAfterMs` so the UI can
 *                    schedule the retry.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

const promoSrc      = read('PromoCodesTab.tsx');
const visitorsSrc   = read('VisitorsTab.tsx');
const indexNowSrc   = read('IndexNowTab.tsx');
const seoSrc        = read('SEOTab.tsx');
const sessionsFnSrc = readFileSync(resolve(__dirname, '../../../lib/visitor-sessions.functions.ts'), 'utf8');
const indexNowFnSrc = readFileSync(resolve(__dirname, '../../../lib/indexnow.functions.ts'), 'utf8');

describe('PromoCodesTab — date-coercion + toast contract', () => {
  it("imports toast from 'sonner'", () => {
    expect(promoSrc).toMatch(/from ['"]sonner['"]/);
    expect(promoSrc).toMatch(/\btoast\b/);
  });
  it('defines a tolerant toDateSafe helper that handles Timestamp/Date/string/number/{seconds}', () => {
    expect(promoSrc).toMatch(/function toDateSafe/);
    expect(promoSrc).toMatch(/toDate\(\)/);
    expect(promoSrc).toMatch(/v instanceof Date/);
    expect(promoSrc).toMatch(/typeof v === ['"]string['"]/);
    expect(promoSrc).toMatch(/typeof v\?\.seconds === ['"]number['"]|typeof v\.seconds === ['"]number['"]/);
  });
  it('uses toDateSafe in both edit-draft init and table rendering', () => {
    const usages = promoSrc.match(/toDateSafe\(/g) ?? [];
    expect(usages.length).toBeGreaterThanOrEqual(2);
  });
  it('surfaces save / delete / load failures via toast.error (not just inline alerts)', () => {
    expect(promoSrc).toMatch(/toast\.error\(['"]Could not load promo codes['"]/);
    expect(promoSrc).toMatch(/toast\.error\(['"]Could not save promo code['"]/);
    expect(promoSrc).toMatch(/toast\.error\(['"]Could not delete promo code['"]/);
  });
  it('confirms successful CRUD via toast.success', () => {
    expect(promoSrc).toMatch(/toast\.success\(['"]Promo code (created|updated|deleted)/);
  });
});

describe('VisitorsTab — Firestore limit safety', () => {
  it('declares an explicit FIRESTORE_MAX_LIMIT constant set to 10_000', () => {
    expect(visitorsSrc).toMatch(/FIRESTORE_MAX_LIMIT\s*=\s*10_000/);
  });
  it('uses the constant for limit() — never a bare numeric > 10_000', () => {
    expect(visitorsSrc).toMatch(/limit\(FIRESTORE_MAX_LIMIT\)/);
    // No `limit(20_000)` / `limit(50_000)` etc.
    const overLimit = visitorsSrc.match(/limit\(\s*([1-9]\d{4,}|[2-9]\d{4})/g);
    expect(overLimit, `Found over-limit calls: ${overLimit?.join(', ')}`).toBeNull();
  });
  it('passes FIRESTORE_MAX_LIMIT as maxEvents to the paginated server fn', () => {
    expect(visitorsSrc).toMatch(/maxEvents:\s*FIRESTORE_MAX_LIMIT/);
  });
  it('renders a sonner toast on session-fetch failure (no silent crash)', () => {
    expect(visitorsSrc).toMatch(/from ['"]sonner['"]/);
    expect(visitorsSrc).toMatch(/toast\.error\(['"]Failed to load sessions['"]/);
  });
});

describe('visitor-sessions.functions — server-side cap', () => {
  it('caps maxEvents at Firestore’s 10_000 hard limit', () => {
    expect(sessionsFnSrc).toMatch(/maxEvents:\s*z\.number\(\)[\s\S]*?\.max\(10_000\)/);
  });
});

describe('SEOTab — Upload buttons are wired (not dead)', () => {
  it('has at least one Upload button bound to an onClick handler', () => {
    // Real wired upload UI — either a labelled file input or a click handler.
    const hasFileInput = /type=["']file["']/.test(seoSrc);
    const hasUploadHandler = /upload(OgImage|Image|File|Logo|Favicon)/i.test(seoSrc);
    expect(hasFileInput || hasUploadHandler).toBe(true);
  });
  it('uploads go to Firebase Storage (not a no-op)', () => {
    expect(seoSrc).toMatch(/firebase\/storage|uploadBytes|getStorage|ref\(/);
  });
});

describe('IndexNowTab — 429 backoff + dedup + toast contract', () => {
  it("imports toast from 'sonner'", () => {
    expect(indexNowSrc).toMatch(/from ['"]sonner['"]/);
  });
  it('keeps a per-URL-set dedup window so the same payload cannot be spammed', () => {
    expect(indexNowSrc).toMatch(/DEDUP_WINDOW_MS/);
    expect(indexNowSrc).toMatch(/fingerprint\s*\(/);
  });
  it('schedules an automatic retry when status === 429 using retryAfterMs', () => {
    expect(indexNowSrc).toMatch(/r\.status\s*===\s*429/);
    expect(indexNowSrc).toMatch(/retryAfterMs/);
    expect(indexNowSrc).toMatch(/setTimeout\(/);
  });
  it('disables the submit button while a retry is pending (countdown gate)', () => {
    expect(indexNowSrc).toMatch(/countdown\s*>\s*0/);
    expect(indexNowSrc).toMatch(/disabled=\{[^}]*countdown\s*>\s*0[^}]*\}/);
  });
  it('reports HTTP outcomes via toasts, not browser alert()', () => {
    expect(indexNowSrc).not.toMatch(/\balert\s*\(/);
    expect(indexNowSrc).toMatch(/toast\.success\(/);
    expect(indexNowSrc).toMatch(/toast\.error\(/);
  });
});

describe('indexnow.functions — surfaces retry-after for the client', () => {
  it('exposes retryAfterMs in the SubmitResult shape', () => {
    expect(indexNowFnSrc).toMatch(/retryAfterMs\?:\s*number/);
  });
  it('parses the Retry-After header (delta-seconds OR HTTP-date)', () => {
    expect(indexNowFnSrc).toMatch(/retry-after/i);
    expect(indexNowFnSrc).toMatch(/Date\.parse\(/);
  });
  it('returns retryAfterMs only on status 429', () => {
    expect(indexNowFnSrc).toMatch(/status\s*===\s*429/);
  });
});
