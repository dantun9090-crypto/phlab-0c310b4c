/**
 * BrokkrPay webhook signature verification.
 *
 * Fulfilment depends entirely on this check, so it is tested directly:
 * a valid signature passes, and every tampering path fails closed.
 */
import { describe, it, expect } from 'vitest';
import {
  parseBrokkrSignatureHeader,
  verifyBrokkrPaySignature,
} from '../src/lib/brokkrpay.server';

const SECRET = 'whsec_test_0123456789abcdef0123456789abcdef';

async function sign(body: string, t: number, secret = SECRET): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${body}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${hex}`;
}

const BODY = JSON.stringify({
  type: 'order.state_changed',
  orderId: '0b3f9e24-7c4a-4f1e-9d5b-2a6c8e1f0d33',
  state: 'SUCCESS',
  amount: 52,
  currency: 'USD',
  reference: 'PHP-ABC123',
});

describe('parseBrokkrSignatureHeader', () => {
  it('parses t and v1 in any order', () => {
    const hex = 'a'.repeat(64);
    expect(parseBrokkrSignatureHeader(`t=1700000000,v1=${hex}`)).toEqual({ t: 1700000000, v1: hex });
    expect(parseBrokkrSignatureHeader(`v1=${hex}, t=1700000000`)).toEqual({ t: 1700000000, v1: hex });
  });

  it('rejects malformed headers', () => {
    expect(parseBrokkrSignatureHeader('')).toBeNull();
    expect(parseBrokkrSignatureHeader('t=1700000000')).toBeNull();
    expect(parseBrokkrSignatureHeader('t=abc,v1=' + 'a'.repeat(64))).toBeNull();
    expect(parseBrokkrSignatureHeader('t=1700000000,v1=zz')).toBeNull();
  });
});

describe('verifyBrokkrPaySignature', () => {
  const now = 1_700_000_000;

  it('accepts a correctly signed body', async () => {
    const header = await sign(BODY, now);
    expect(await verifyBrokkrPaySignature(BODY, header, { secret: SECRET, nowSec: now })).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const header = await sign(BODY, now);
    const tampered = BODY.replace('"amount":52', '"amount":1');
    expect(await verifyBrokkrPaySignature(tampered, header, { secret: SECRET, nowSec: now })).toBe(false);
  });

  it('rejects a stale timestamp (replay)', async () => {
    const header = await sign(BODY, now - 600);
    expect(await verifyBrokkrPaySignature(BODY, header, { secret: SECRET, nowSec: now })).toBe(false);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const header = await sign(BODY, now, 'whsec_someone_elses_secret_value_x');
    expect(await verifyBrokkrPaySignature(BODY, header, { secret: SECRET, nowSec: now })).toBe(false);
  });

  it('rejects a missing header or missing secret', async () => {
    expect(await verifyBrokkrPaySignature(BODY, null, { secret: SECRET, nowSec: now })).toBe(false);
    const header = await sign(BODY, now);
    expect(await verifyBrokkrPaySignature(BODY, header, { secret: null, nowSec: now })).toBe(false);
  });
});
