/**
 * UK postcode → address lookup (server-only implementation).
 *
 * Two providers, chosen at runtime:
 *   - Free (default): api.postcodes.io — no key, returns town/county only.
 *   - Paid (when GETADDRESS_API_KEY or IDEAL_POSTCODES_API_KEY is set):
 *     returns a list of full PAF addresses for the postcode.
 *
 * UK only by design; every other country keeps manual entry.
 */

export interface PostcodeAddress {
  line1: string;
  city: string;
  county: string;
}

export interface PostcodeLookupResult {
  ok: boolean;
  /** 'outcode' = town/county only (free), 'full' = selectable addresses. */
  mode: 'outcode' | 'full';
  postcode: string;
  city: string;
  county: string;
  addresses: PostcodeAddress[];
  message?: string;
}

const UK_POSTCODE_RE = /^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/;
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

const cache = new Map<string, { at: number; value: PostcodeLookupResult }>();

/** Uppercases and strips all whitespace/hyphens. */
export function normaliseUkPostcode(input: string): string {
  return String(input || '').replace(/[\s\u00a0\u2007\u202f-]+/g, '').toUpperCase();
}

export function isValidUkPostcode(input: string): boolean {
  return UK_POSTCODE_RE.test(normaliseUkPostcode(input));
}

/** "SW1A1AA" → "SW1A 1AA" */
export function formatUkPostcode(input: string): string {
  const pc = normaliseUkPostcode(input);
  if (pc.length < 5) return pc;
  return `${pc.slice(0, pc.length - 3)} ${pc.slice(-3)}`;
}

export function getLookupProvider(): 'getaddress' | 'ideal' | 'postcodes-io' {
  if (process.env['GETADDRESS_API_KEY']) return 'getaddress';
  if (process.env['IDEAL_POSTCODES_API_KEY']) return 'ideal';
  return 'postcodes-io';
}

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return { __status: res.status };
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function titleCase(v: string): string {
  return String(v || '')
    .toLowerCase()
    .replace(/(^|[\s'\-/])([a-z])/g, (_m, p, c) => p + c.toUpperCase())
    .trim();
}

/** postcodes.io — free, town/county only. */
async function lookupPostcodesIo(pc: string): Promise<PostcodeLookupResult> {
  const json = await fetchJson(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
  const r = json?.result;
  if (!r || typeof r !== 'object') {
    return {
      ok: false, mode: 'outcode', postcode: formatUkPostcode(pc),
      city: '', county: '', addresses: [],
      message: 'We could not find that postcode. Please check it or enter your address manually.',
    };
  }
  const city = String(r.post_town || r.parish || r.admin_district || '').trim();
  const county = String(r.admin_county || r.admin_district || r.region || '').trim();
  return {
    ok: true, mode: 'outcode', postcode: formatUkPostcode(pc),
    city: titleCase(city), county: titleCase(county), addresses: [],
  };
}

/** getAddress.io — paid, full PAF addresses. */
async function lookupGetAddress(pc: string, key: string): Promise<PostcodeLookupResult> {
  const json = await fetchJson(
    `https://api.getaddress.io/find/${encodeURIComponent(pc)}?expand=true&api-key=${encodeURIComponent(key)}`,
  );
  if (json?.__status) {
    // 401/403 = key not authorised (often a domain/IP restriction on the key).
    console.warn('[postcode-lookup] getAddress.io returned', json.__status, '— falling back to postcodes.io');
    return lookupPostcodesIo(pc);
  }
  const list: any[] = Array.isArray(json?.addresses) ? json.addresses : [];
  if (list.length === 0) return lookupPostcodesIo(pc);


  const addresses: PostcodeAddress[] = list.map((a: any) => {
    const line1 = [a.line_1, a.line_2, a.line_3, a.line_4]
      .map((x: unknown) => String(x || '').trim())
      .filter(Boolean)
      .join(', ');
    return {
      line1,
      city: titleCase(String(a.town_or_city || '').trim()),
      county: titleCase(String(a.county || '').trim()),
    };
  }).filter((a) => a.line1);

  if (addresses.length === 0) return lookupPostcodesIo(pc);

  return {
    ok: true, mode: 'full', postcode: formatUkPostcode(pc),
    city: addresses[0]!.city, county: addresses[0]!.county, addresses,
  };
}

/** Ideal Postcodes — paid, full PAF addresses. */
async function lookupIdealPostcodes(pc: string, key: string): Promise<PostcodeLookupResult> {
  const json = await fetchJson(
    `https://api.ideal-postcodes.co.uk/v1/postcodes/${encodeURIComponent(pc)}?api_key=${encodeURIComponent(key)}`,
  );
  const list: any[] = Array.isArray(json?.result) ? json.result : [];
  if (list.length === 0) return lookupPostcodesIo(pc);

  const addresses: PostcodeAddress[] = list.map((a: any) => {
    const line1 = [a.line_1, a.line_2, a.line_3]
      .map((x: unknown) => String(x || '').trim())
      .filter(Boolean)
      .join(', ');
    return {
      line1,
      city: titleCase(String(a.post_town || '').trim()),
      county: titleCase(String(a.county || a.district || '').trim()),
    };
  }).filter((a) => a.line1);

  if (addresses.length === 0) return lookupPostcodesIo(pc);

  return {
    ok: true, mode: 'full', postcode: formatUkPostcode(pc),
    city: addresses[0]!.city, county: addresses[0]!.county, addresses,
  };
}

export async function runPostcodeLookup(rawPostcode: string): Promise<PostcodeLookupResult> {
  const pc = normaliseUkPostcode(rawPostcode);

  if (!UK_POSTCODE_RE.test(pc)) {
    return {
      ok: false, mode: 'outcode', postcode: pc, city: '', county: '', addresses: [],
      message: 'Enter a valid UK postcode (e.g. SW1A 1AA).',
    };
  }

  const hit = cache.get(pc);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let result: PostcodeLookupResult;
  try {
    const provider = getLookupProvider();
    if (provider === 'getaddress') {
      result = await lookupGetAddress(pc, process.env['GETADDRESS_API_KEY']!);
    } else if (provider === 'ideal') {
      result = await lookupIdealPostcodes(pc, process.env['IDEAL_POSTCODES_API_KEY']!);
    } else {
      result = await lookupPostcodesIo(pc);
    }
  } catch (err) {
    // Log server-side only; never surface upstream details to the customer.
    console.warn('[postcode-lookup] provider failed', (err as Error)?.name);
    return {
      ok: false, mode: 'outcode', postcode: formatUkPostcode(pc), city: '', county: '', addresses: [],
      message: 'Address lookup is unavailable right now — please enter your address manually.',
    };
  }

  if (result.ok) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(pc, { at: Date.now(), value: result });
  }
  return result;
}
