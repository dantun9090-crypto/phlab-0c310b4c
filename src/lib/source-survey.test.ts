/**
 * Integration tests for ownership enforcement on runSubmitSurvey /
 * runSkipSurvey. Verifies that a caller without a matching idToken (uid
 * === order.userId) AND without a paymentToken whose SHA-256 matches
 * order.paymentTokenHash cannot mutate the order or trigger SAVE10
 * issuance — the only side-effect on rejection is throwing
 * "Order not found".
 *
 * Run with: `bun test src/lib/source-survey.test.ts`
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('./server/firestore-admin', () => ({
  getDocAdmin: vi.fn(),
  updateDocAdmin: vi.fn(),
  addDocAdmin: vi.fn(),
  findDocByFieldAdmin: vi.fn(),
}));
vi.mock('./server/firebase-auth-admin', () => ({
  verifyFirebaseIdToken: vi.fn(),
}));

import { runSubmitSurvey, runSkipSurvey } from './source-survey.server';
import {
  getDocAdmin,
  updateDocAdmin,
  addDocAdmin,
  findDocByFieldAdmin,
} from './server/firestore-admin';
import { verifyFirebaseIdToken } from './server/firebase-auth-admin';

const mockGet = getDocAdmin as unknown as ReturnType<typeof vi.fn>;
const mockUpdate = updateDocAdmin as unknown as ReturnType<typeof vi.fn>;
const mockAdd = addDocAdmin as unknown as ReturnType<typeof vi.fn>;
const mockFind = findDocByFieldAdmin as unknown as ReturnType<typeof vi.fn>;
const mockVerify = verifyFirebaseIdToken as unknown as ReturnType<typeof vi.fn>;

const ORDER_ID = 'PHP-ABC123';
const OWNER_UID = 'uid-owner-1';
const VALID_PAYMENT_TOKEN = 'p'.repeat(48);
let VALID_PAYMENT_TOKEN_HASH = '';

async function sha256Hex(input: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

beforeAll(async () => {
  VALID_PAYMENT_TOKEN_HASH = await sha256Hex(VALID_PAYMENT_TOKEN);
});

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    userId: OWNER_UID,
    paymentTokenHash: VALID_PAYMENT_TOKEN_HASH,
    customer: { email: 'buyer@example.com' },
    status: 'paid',
    ...overrides,
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
  mockAdd.mockReset();
  mockFind.mockReset();
  mockVerify.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockAdd.mockResolvedValue(undefined);
  mockFind.mockResolvedValue(null);
});

describe('runSubmitSurvey — ownership enforcement', () => {
  it('rejects when neither idToken nor paymentToken is provided', async () => {
    mockGet.mockResolvedValue(makeOrder());
    await expect(
      runSubmitSurvey({ orderId: ORDER_ID, source: 'google_search', otherText: null }),
    ).rejects.toThrow(/Order not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('rejects when paymentToken does not hash to the stored paymentTokenHash', async () => {
    mockGet.mockResolvedValue(makeOrder());
    await expect(
      runSubmitSurvey({
        orderId: ORDER_ID,
        source: 'google_search',
        otherText: null,
        paymentToken: 'x'.repeat(48),
      }),
    ).rejects.toThrow(/Order not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("rejects when idToken's uid does not match order.userId", async () => {
    mockGet.mockResolvedValue(makeOrder());
    mockVerify.mockResolvedValue({ uid: 'someone-else', email: 'eve@example.com' });
    await expect(
      runSubmitSurvey({
        orderId: ORDER_ID,
        source: 'google_search',
        otherText: null,
        idToken: 'tampered-token',
      }),
    ).rejects.toThrow(/Order not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('rejects when idToken verification itself throws (invalid signature)', async () => {
    mockGet.mockResolvedValue(makeOrder());
    mockVerify.mockRejectedValue(new Error('id_token_rejected_400'));
    await expect(
      runSubmitSurvey({
        orderId: ORDER_ID,
        source: 'google_search',
        otherText: null,
        idToken: 'forged',
      }),
    ).rejects.toThrow(/Order not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('rejects when the order does not exist (no enumeration signal)', async () => {
    mockGet.mockResolvedValue(null);
    await expect(
      runSubmitSurvey({
        orderId: ORDER_ID,
        source: 'google_search',
        otherText: null,
        paymentToken: VALID_PAYMENT_TOKEN,
      }),
    ).rejects.toThrow(/Order not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('accepts a matching paymentToken and writes the survey + issues SAVE10', async () => {
    mockGet
      .mockResolvedValueOnce(makeOrder()) // order lookup
      .mockResolvedValueOnce(null);       // save10_claims lookup
    const res = await runSubmitSurvey({
      orderId: ORDER_ID,
      source: 'google_search',
      otherText: null,
      paymentToken: VALID_PAYMENT_TOKEN,
    });
    expect(res).toEqual({ ok: true, rewardCode: 'SAVE10' });
    expect(mockUpdate).toHaveBeenCalledWith(
      'orders',
      ORDER_ID,
      expect.objectContaining({ sourceSurvey: expect.any(Object) }),
    );
    expect(mockAdd).toHaveBeenCalledWith('save10_claims', expect.any(Object), 'buyer@example.com');
  });

  it("accepts a matching idToken (uid === order.userId)", async () => {
    mockGet
      .mockResolvedValueOnce(makeOrder())
      .mockResolvedValueOnce(null);
    mockVerify.mockResolvedValue({ uid: OWNER_UID, email: 'buyer@example.com' });
    const res = await runSubmitSurvey({
      orderId: ORDER_ID,
      source: 'referral',
      otherText: null,
      idToken: 'valid',
    });
    expect(res.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe('runSkipSurvey — ownership enforcement', () => {
  it('rejects when neither idToken nor paymentToken is provided', async () => {
    mockGet.mockResolvedValue(makeOrder());
    await expect(runSkipSurvey({ orderId: ORDER_ID })).rejects.toThrow(/Order not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects when paymentToken hash does not match', async () => {
    mockGet.mockResolvedValue(makeOrder());
    await expect(
      runSkipSurvey({ orderId: ORDER_ID, paymentToken: 'x'.repeat(48) }),
    ).rejects.toThrow(/Order not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects when idToken's uid does not match order.userId", async () => {
    mockGet.mockResolvedValue(makeOrder());
    mockVerify.mockResolvedValue({ uid: 'someone-else', email: null });
    await expect(
      runSkipSurvey({ orderId: ORDER_ID, idToken: 'tampered' }),
    ).rejects.toThrow(/Order not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects when the order does not exist', async () => {
    mockGet.mockResolvedValue(null);
    await expect(
      runSkipSurvey({ orderId: ORDER_ID, paymentToken: VALID_PAYMENT_TOKEN }),
    ).rejects.toThrow(/Order not found/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('accepts a matching paymentToken and marks the survey skipped', async () => {
    mockGet.mockResolvedValue(makeOrder());
    const res = await runSkipSurvey({
      orderId: ORDER_ID,
      paymentToken: VALID_PAYMENT_TOKEN,
    });
    expect(res).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      'orders',
      ORDER_ID,
      expect.objectContaining({ surveySkipped: true, sourceSurvey: null }),
    );
  });

  it("accepts a matching idToken", async () => {
    mockGet.mockResolvedValue(makeOrder());
    mockVerify.mockResolvedValue({ uid: OWNER_UID, email: null });
    const res = await runSkipSurvey({ orderId: ORDER_ID, idToken: 'valid' });
    expect(res.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
