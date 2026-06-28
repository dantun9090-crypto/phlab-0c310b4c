/**
 * Redaction guarantees for downloadable dry-run / audit JSON payloads.
 * If any of these tests fail, sensitive credentials may leak into the
 * files admins download for sharing with support/Google Ads.
 */
import { describe, it, expect } from 'vitest';
import { redactSensitiveJson, redactSensitiveValue } from './redact-sensitive';

describe('redactSensitiveJson', () => {
  it('redacts idToken / Authorization / developer-token while keeping correlationId', () => {
    const input = JSON.stringify({
      correlationId: 'cmp-abc-123',
      idToken: 'eyJhbGciOiJIUzI1NiJ9.payloadhere1234567890.signaturepart1234567890',
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payloadhere1234567890.signaturepart1234567890',
      'developer-token': 'dev_token_secret_value',
      headers: { authorization: 'Bearer xyz', 'x-goog-api-key': 'AIzaSecretKey' },
    });
    const out = JSON.parse(redactSensitiveJson(input));
    expect(out.correlationId).toBe('cmp-abc-123');
    expect(out.idToken).toBe('[REDACTED]');
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out['developer-token']).toBe('[REDACTED]');
    expect(out.headers.authorization).toBe('[REDACTED]');
    expect(out.headers['x-goog-api-key']).toBe('[REDACTED]');
  });

  it('redacts Bearer tokens embedded in arbitrary string values', () => {
    const out = redactSensitiveJson(JSON.stringify({
      log: 'curl -H "Authorization: Bearer abc.def.ghi" https://api',
      correlationId: 'ui-xyz',
    }));
    expect(out).not.toContain('abc.def.ghi');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).toContain('ui-xyz');
  });

  it('redacts bare JWT-shaped tokens (eyJ... three-part)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = redactSensitiveJson(JSON.stringify({ token: jwt, correlationId: 'cron-1' }));
    expect(out).not.toContain(jwt);
    expect(out).toContain('[REDACTED_JWT]');
    expect(out).toContain('cron-1');
  });

  it('redacts Google Ads customers/<digits> paths', () => {
    const out = redactSensitiveJson(JSON.stringify({
      resourceName: 'customers/1234567890/campaigns/55',
      nested: { ref: 'customers/9876543210/adGroups/77' },
      correlationId: 'cmp-keep-me',
    }));
    expect(out).toContain('customers/[REDACTED_CID]');
    expect(out).not.toContain('1234567890');
    expect(out).not.toContain('9876543210');
    expect(out).toContain('cmp-keep-me');
  });

  it('preserves non-sensitive fields and structure', () => {
    const input = JSON.stringify({
      correlationId: 'cmp-1',
      negatives: ['weight loss', 'recreational'],
      operationCount: 12,
      thresholds: { minImpressions: 100, growthRatio: 2.5 },
    });
    const out = JSON.parse(redactSensitiveJson(input));
    expect(out.negatives).toEqual(['weight loss', 'recreational']);
    expect(out.operationCount).toBe(12);
    expect(out.thresholds.minImpressions).toBe(100);
    expect(out.correlationId).toBe('cmp-1');
  });

  it('returns input unchanged if not valid JSON', () => {
    expect(redactSensitiveJson('not json {')).toBe('not json {');
  it('scrubs multiple sensitive patterns embedded in one long log line while preserving correlationId verbatim', () => {
    const cid = 'cmp-MiXeD-CaSe-123';
    const jwt = 'eyJhbGciOi.payload1234567890.signature1234567890';
    const longLine =
      `[2026-01-01] correlationId=${cid} sent request ` +
      `Authorization: Bearer ${jwt} to customers/9876543210/campaigns/55 ` +
      `(also retried as Bearer abc.def.ghi) returned 200, raw token still in trace: ${jwt}, ` +
      `customer mirror customers/1122334455/adGroups/77`;

    const out = redactSensitiveJson(JSON.stringify({ correlationId: cid, log: longLine }));
    const parsed = JSON.parse(out);

    // correlationId field — exact, unmodified
    expect(parsed.correlationId).toBe(cid);
    // correlationId substring inside the log line — also preserved
    expect(parsed.log).toContain(`correlationId=${cid}`);

    // every sensitive token must be gone from the entire payload
    expect(out).not.toContain(jwt);
    expect(out).not.toContain('abc.def.ghi');
    expect(out).not.toContain('9876543210');
    expect(out).not.toContain('1122334455');

    // replacements actually present
    expect(parsed.log).toContain('Bearer [REDACTED]');
    expect(parsed.log).toContain('[REDACTED_JWT]');
    expect(parsed.log).toContain('customers/[REDACTED_CID]');
  });

  it('redacts sensitive tokens in deeply nested arrays/objects without mutating sibling correlationIds', () => {
    const input = {
      correlationId: 'ui-root-1',
      batches: [
        {
          correlationId: 'ui-child-a',
          ops: [
            { resourceName: 'customers/1000000001/x', token: 'eyJabc.defghi1234567890.signxyz1234567890' },
            { note: 'curl -H "authorization: Bearer leak.me.now" https://x' },
          ],
        },
        {
          correlationId: 'ui-child-b',
          headers: { 'developer-token': 'devsecret', 'X-Goog-Api-Key': 'AIzaLeak' },
        },
      ],
    };
    const out = JSON.parse(redactSensitiveValue(input));
    expect(out.correlationId).toBe('ui-root-1');
    expect(out.batches[0].correlationId).toBe('ui-child-a');
    expect(out.batches[1].correlationId).toBe('ui-child-b');
    expect(out.batches[0].ops[0].resourceName).toBe('customers/[REDACTED_CID]/x');
    expect(out.batches[0].ops[0].token).toBe('[REDACTED_JWT]');
    expect(out.batches[0].ops[1].note).toContain('Bearer [REDACTED]');
    expect(out.batches[0].ops[1].note).not.toContain('leak.me.now');
    expect(out.batches[1].headers['developer-token']).toBe('[REDACTED]');
    expect(out.batches[1].headers['X-Goog-Api-Key']).toBe('[REDACTED]');
  });

  it('never touches correlationId values that look JWT-ish or contain digits', () => {
    // correlationId is matched by KEY, not value pattern — even an
    // ambiguous-looking value must survive untouched.
    const tricky = 'cron-1700000000-eyJabc';
    const out = JSON.parse(redactSensitiveJson(JSON.stringify({ correlationId: tricky })));
    expect(out.correlationId).toBe(tricky);
  });

  it('only redacts numeric customer IDs (6+ digits), not arbitrary "customers/" path text', () => {
    const out = JSON.parse(redactSensitiveJson(JSON.stringify({
      a: 'customers/123',          // too short — leave alone
      b: 'customers/abcdef',       // not numeric — leave alone
      c: 'customers/1234567890',   // valid CID — redact
      correlationId: 'cmp-keep',
    })));
    expect(out.a).toBe('customers/123');
    expect(out.b).toBe('customers/abcdef');
    expect(out.c).toBe('customers/[REDACTED_CID]');
    expect(out.correlationId).toBe('cmp-keep');
  });
});


  it('redactSensitiveValue handles arrays at the root', () => {
    const out = JSON.parse(redactSensitiveValue([
      { correlationId: 'a', idToken: 'secret123' },
      { correlationId: 'b', resourceName: 'customers/1234567/x' },
    ]));
    expect(out[0].idToken).toBe('[REDACTED]');
    expect(out[0].correlationId).toBe('a');
    expect(out[1].resourceName).toBe('customers/[REDACTED_CID]/x');
  });
});
