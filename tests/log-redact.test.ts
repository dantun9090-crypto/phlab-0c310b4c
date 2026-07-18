import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redact, safeLog, sanitizeRequestId, isPiiKey } from '@/lib/log-redact';

const RAW_EMAIL = 'REDACTED@example.com';
const RAW_POSTCODE = 'SW1A 1AA';
const RAW_PHONE = '+44 7700 900123';
const RAW_SURNAME = 'REDACTED';

describe('logRedact.redact', () => {
  it('redacts PII by key in plain objects', () => {
    const out = JSON.stringify(redact({
      email: RAW_EMAIL,
      phone: RAW_PHONE,
      surname: RAW_SURNAME,
      postcode: RAW_POSTCODE,
      address: '10 Downing St',
      city: 'London',
      firstName: 'Jane',
      lastName: 'Doe',
      ok: 'hello',
    }));
    for (const raw of [RAW_EMAIL, RAW_POSTCODE, '10 Downing St', 'London', 'Jane', 'Doe', RAW_SURNAME]) {
      expect(out).not.toContain(raw);
    }
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('hello');
  });

  it('does not redact allowlisted keys like filename/hostname', () => {
    expect(isPiiKey('filename')).toBe(false);
    expect(isPiiKey('hostname')).toBe(false);
    expect(isPiiKey('username')).toBe(false);
    expect(isPiiKey('email')).toBe(true);
    const out = JSON.stringify(redact({ filename: 'foo.txt', hostname: 'server-1' }));
    expect(out).toContain('foo.txt');
    expect(out).toContain('server-1');
  });

  it('redacts values by regex inside nested arrays and stack strings', () => {
    const stackWithPii = `Error: boom at handler (${RAW_EMAIL}) called from ${RAW_POSTCODE}`;
    const out = JSON.stringify(redact({
      nested: {
        arr: [{ note: `contact ${RAW_EMAIL}` }, `postcode ${RAW_POSTCODE}`],
      },
      trace: stackWithPii,
    }));
    expect(out).not.toContain(RAW_EMAIL);
    expect(out).not.toContain(RAW_POSTCODE);
    expect(out).toContain('[REDACTED]');
  });

  it('walks Error.cause chains and AggregateError.errors', () => {
    const root = new Error(`root failed for ${RAW_EMAIL}`);
    const mid = new Error(`mid ${RAW_POSTCODE}`, { cause: root });
    const agg: Error & { errors?: unknown[] } = new Error('aggregate');
    agg.errors = [new Error(`inner ${RAW_PHONE}`)];
    const top = new Error('top', { cause: mid });
    (top as unknown as { extra: unknown }).extra = agg;
    const out = JSON.stringify(redact({ error: top }));
    expect(out).not.toContain(RAW_EMAIL);
    expect(out).not.toContain(RAW_POSTCODE);
    expect(out).not.toContain(RAW_PHONE.replace(/\s/g, ''));
    expect(out).toContain('[REDACTED]');
  });

  it('truncates very long strings', () => {
    const long = 'x'.repeat(2000);
    const out = redact({ note: long }) as { note: string };
    expect(out.note.length).toBeLessThanOrEqual(520);
    expect(out.note).toContain('[truncated]');
  });
});

describe('logRedact.safeLog', () => {
  let logs: string[] = [];
  let spies: Array<ReturnType<typeof vi.spyOn>> = [];
  beforeEach(() => {
    logs = [];
    const capture = (arg: unknown) => { logs.push(String(arg)); };
    spies = [
      vi.spyOn(console, 'log').mockImplementation(capture),
      vi.spyOn(console, 'warn').mockImplementation(capture),
      vi.spyOn(console, 'error').mockImplementation(capture),
      vi.spyOn(console, 'debug').mockImplementation(capture),
    ];
  });
  afterEach(() => { spies.forEach((s) => s.mockRestore()); });

  it('never lets PII reach the sink', () => {
    safeLog({
      stage: 'test.stage',
      requestId: 'r1',
      email: RAW_EMAIL,
      customer: { name: 'Alice', phone: RAW_PHONE },
      error: new Error(`boom ${RAW_POSTCODE}`),
    });
    const all = logs.join('\n');
    for (const raw of [RAW_EMAIL, RAW_POSTCODE, 'Alice']) {
      expect(all).not.toContain(raw);
    }
    expect(all).toContain('[REDACTED]');
    expect(all).toContain('test.stage');
  });
});

describe('sanitizeRequestId', () => {
  it('accepts valid ids', () => {
    expect(sanitizeRequestId('abc-123')).toBe('abc-123');
    expect(sanitizeRequestId('A'.repeat(64))).toBe('A'.repeat(64));
  });
  it('rejects too-long, newlines, quotes, and generates a new id', () => {
    const long = 'A'.repeat(500);
    const bad = 'abc\r\nInjected: x';
    const q = 'abc"def';
    for (const raw of [long, bad, q, '', null, undefined, 'has space']) {
      const out = sanitizeRequestId(raw as string | null | undefined);
      expect(out).not.toBe(raw);
      expect(out.length).toBeLessThanOrEqual(64);
      expect(/^[A-Za-z0-9-]+$/.test(out)).toBe(true);
    }
  });
});
