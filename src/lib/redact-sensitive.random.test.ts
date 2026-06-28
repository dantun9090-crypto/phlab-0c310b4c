/**
 * Randomised redaction guarantees.
 *
 * The deterministic suite in redact-sensitive.test.ts pins specific
 * input/output pairs. This suite generates randomised payloads with
 * sensitive tokens embedded inside longer strings and confirms that:
 *
 *   1. correlationId is NEVER altered (neither the dedicated field nor
 *      occurrences inside log-line strings).
 *   2. EVERY sensitive pattern we generated is gone from the serialised
 *      output: bare JWTs, `Bearer <jwt>`, `customers/<6+ digits>`,
 *      and sensitive HEADER KEY values are replaced with [REDACTED].
 *
 * Iteration count is intentionally high (200) but the redactor is pure
 * string work, so the suite finishes well under the vitest default
 * timeout. If it ever flakes, lower the count rather than relaxing the
 * assertions.
 */
import { describe, it, expect } from 'vitest';
import { redactSensitiveJson, redactSensitiveValue } from './redact-sensitive';

function rng(seed: number) {
  // Mulberry32 — small deterministic PRNG so a failing seed is reproducible
  // from the test output without depending on the global Math.random.
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randStr(rand: () => number, len: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(rand() * alphabet.length)];
  }
  return out;
}

function makeJwt(rand: () => number): string {
  const ab = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  // matches /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/
  const header = 'ey' + randStr(rand, 14 + Math.floor(rand() * 10), ab);
  const payload = randStr(rand, 14 + Math.floor(rand() * 30), ab);
  const sig = randStr(rand, 14 + Math.floor(rand() * 20), ab);
  return `${header}.${payload}.${sig}`;
}

function makeBearerToken(rand: () => number): string {
  // anything matching /Bearer\s+[A-Za-z0-9._-]+/
  const ab = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-';
  return randStr(rand, 20 + Math.floor(rand() * 30), ab);
}

function makeCidPath(rand: () => number): string {
  const len = 6 + Math.floor(rand() * 7); // 6..12 digits
  let cid = '';
  for (let i = 0; i < len; i++) cid += Math.floor(rand() * 10);
  return cid;
}

function makeCorrelationId(rand: () => number): string {
  // Intentionally include digits + casing that could *look* sensitive,
  // but the redactor matches correlationId by KEY, not by value.
  const prefixes = ['cmp', 'ui', 'cron', 'job'];
  const p = prefixes[Math.floor(rand() * prefixes.length)];
  return `${p}-${Date.now() % 100000}-${randStr(rand, 6, 'abcdef0123456789')}`;
}

describe('redactSensitiveJson — randomised fuzz', () => {
  it('scrubs every sensitive token while preserving correlationId across 200 random payloads', () => {
    const rand = rng(0xC0FFEE);

    for (let i = 0; i < 200; i++) {
      const cid = makeCorrelationId(rand);
      const jwt1 = makeJwt(rand);
      const jwt2 = makeJwt(rand);
      const bearer = makeBearerToken(rand);
      const cid1 = makeCidPath(rand);
      const cid2 = makeCidPath(rand);
      const apiKey = 'AIza' + randStr(rand, 32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
      const devToken = randStr(rand, 24, 'abcdefghijklmnopqrstuvwxyz0123456789');

      // Embed everything in long, realistic-looking noise strings.
      const noiseA = `[trace] correlationId=${cid} attempt=${i} ts=${Date.now()}`;
      const noiseB =
        `${noiseA} sent POST customers/${cid1}/campaigns:mutate ` +
        `Authorization: Bearer ${jwt1} (retry hop Bearer ${bearer}) ` +
        `raw=${jwt2} ` +
        `mirror customers/${cid2}/adGroups/77 done correlationId=${cid}`;

      const payload = {
        correlationId: cid,
        log: noiseB,
        nested: {
          correlationId: cid,
          headers: {
            Authorization: `Bearer ${jwt1}`,
            'developer-token': devToken,
            'x-goog-api-key': apiKey,
          },
          ops: [
            { resourceName: `customers/${cid1}/campaigns/55`, token: jwt2 },
            { note: `curl -H "Authorization: Bearer ${bearer}" https://api` },
          ],
        },
      };

      const out = redactSensitiveValue(payload);
      const parsed = JSON.parse(out);

      // ---- correlationId invariants ----
      expect(parsed.correlationId, `iter ${i}: root correlationId mutated`).toBe(cid);
      expect(parsed.nested.correlationId, `iter ${i}: nested correlationId mutated`).toBe(cid);
      // The correlationId substring inside the log string must also survive.
      expect(parsed.log, `iter ${i}: correlationId substring stripped from log`).toContain(`correlationId=${cid}`);

      // ---- sensitive-pattern invariants ----
      const failHints: string[] = [];
      if (out.includes(jwt1)) failHints.push('jwt1 leaked');
      if (out.includes(jwt2)) failHints.push('jwt2 leaked');
      if (out.includes(bearer)) failHints.push('bearer leaked');
      if (out.includes(`customers/${cid1}`)) failHints.push('customers cid1 leaked');
      if (out.includes(`customers/${cid2}`)) failHints.push('customers cid2 leaked');
      if (out.includes(devToken)) failHints.push('developer-token value leaked');
      if (out.includes(apiKey)) failHints.push('x-goog-api-key value leaked');
      expect(failHints, `iter ${i} (cid=${cid}): ${failHints.join(', ')}`).toEqual([]);

      // ---- replacement markers present ----
      expect(parsed.log).toContain('Bearer [REDACTED]');
      expect(parsed.log).toContain('[REDACTED_JWT]');
      expect(parsed.log).toContain('customers/[REDACTED_CID]');
      expect(parsed.nested.headers['developer-token']).toBe('[REDACTED]');
      expect(parsed.nested.headers['x-goog-api-key']).toBe('[REDACTED]');
      expect(parsed.nested.headers.Authorization).toBe('[REDACTED]');
      expect(parsed.nested.ops[0].resourceName).toBe('customers/[REDACTED_CID]/campaigns/55');
      expect(parsed.nested.ops[0].token).toBe('[REDACTED_JWT]');
      expect(parsed.nested.ops[1].note).toContain('Bearer [REDACTED]');
    }
  });

  it('round-trips correlationId-only payloads unchanged across random shapes', () => {
    const rand = rng(0xBADF00D);
    for (let i = 0; i < 50; i++) {
      const cid = makeCorrelationId(rand);
      const input = { correlationId: cid, count: Math.floor(rand() * 1000), label: `safe-${i}` };
      const out = JSON.parse(redactSensitiveJson(JSON.stringify(input)));
      expect(out).toEqual(input);
    }
  });
});
