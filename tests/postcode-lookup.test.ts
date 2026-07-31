/**
 * Unit coverage for the UK postcode → address lookup helper.
 *
 * Locks down: normalisation, provider selection by env key, and safe
 * handling of malformed / failing upstream responses (must never throw at
 * the customer — checkout falls back to manual entry).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normaliseUkPostcode,
  isValidUkPostcode,
  formatUkPostcode,
  getLookupProvider,
  runPostcodeLookup,
} from '../src/lib/postcode-lookup.server';

describe('postcode normalisation', () => {
  it('uppercases and strips spaces / hyphens', () => {
    expect(normaliseUkPostcode(' sw1a 1aa ')).toBe('SW1A1AA');
    expect(normaliseUkPostcode('ts18-3wd')).toBe('TS183WD');
  });

  it('accepts valid UK postcodes including GIR 0AA', () => {
    for (const pc of ['SW1A 1AA', 'ts18 3wd', 'M1 1AE', 'GIR 0AA']) {
      expect(isValidUkPostcode(pc)).toBe(true);
    }
  });

  it('rejects non-UK / malformed values', () => {
    for (const pc of ['10115', '00-001', 'D02 XY45', '', 'ABCDEF']) {
      expect(isValidUkPostcode(pc)).toBe(false);
    }
  });

  it('re-inserts the incode space', () => {
    expect(formatUkPostcode('sw1a1aa')).toBe('SW1A 1AA');
    expect(formatUkPostcode('m11ae')).toBe('M1 1AE');
  });
});

describe('provider selection', () => {
  const saved = { ...process.env };
  afterEach(() => {
    delete process.env['GETADDRESS_API_KEY'];
    delete process.env['IDEAL_POSTCODES_API_KEY'];
    Object.assign(process.env, saved);
  });

  it('defaults to the free provider with no keys', () => {
    delete process.env['GETADDRESS_API_KEY'];
    delete process.env['IDEAL_POSTCODES_API_KEY'];
    expect(getLookupProvider()).toBe('postcodes-io');
  });

  it('prefers getAddress.io when its key is present', () => {
    process.env['GETADDRESS_API_KEY'] = 'x';
    expect(getLookupProvider()).toBe('getaddress');
  });

  it('uses Ideal Postcodes when only that key is present', () => {
    delete process.env['GETADDRESS_API_KEY'];
    process.env['IDEAL_POSTCODES_API_KEY'] = 'x';
    expect(getLookupProvider()).toBe('ideal');
  });
});

describe('runPostcodeLookup', () => {
  beforeEach(() => {
    delete process.env['GETADDRESS_API_KEY'];
    delete process.env['IDEAL_POSTCODES_API_KEY'];
    vi.restoreAllMocks();
  });

  it('rejects an invalid postcode without calling the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await runPostcodeLookup('10115');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/valid UK postcode/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a postcodes.io result to city / county', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ result: { post_town: 'STOCKTON-ON-TEES', admin_county: 'Durham' } }),
    } as unknown as Response);

    const r = await runPostcodeLookup('ts18 3wd');
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('outcode');
    expect(r.city).toBe('Stockton-On-Tees');
    expect(r.county).toBe('Durham');
    expect(r.postcode).toBe('TS18 3WD');
  });

  it('never throws when the upstream response is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ nonsense: true }),
    } as unknown as Response);

    const r = await runPostcodeLookup('M1 1AF');
    expect(r.ok).toBe(false);
    expect(r.addresses).toEqual([]);
  });

  it('degrades gracefully when the provider errors out', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const r = await runPostcodeLookup('M1 1AG');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/manually/i);
  });
});
