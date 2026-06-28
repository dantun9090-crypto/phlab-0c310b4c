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
