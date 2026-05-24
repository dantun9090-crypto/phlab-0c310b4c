/**
 * Server-side admin IP whitelist gate.
 *
 * SECURITY: Previously `src/pages/Admin/index.tsx` ran `checkIpAllowed()`
 * entirely in the browser (fetched the client IP from api.ipify.org, read the
 * whitelist from Firestore, compared in JS). Any user with `isAdmin: true`
 * could open DevTools and skip the check, and a network error would silently
 * pass (`catch { return true; }`).
 *
 * This server function moves enforcement into the Cloudflare Worker. The IP
 * is read from request headers the Worker receives (which the client cannot
 * forge from JS) and the result is what the Admin shell uses to decide
 * whether to render. When the guard is enabled and we cannot determine the
 * IP or read the whitelist, this fails CLOSED (allowed = false).
 *
 * NOTE: This blocks the admin UI. It does NOT prevent direct Firebase SDK
 * access by anyone holding admin credentials — that requires Firestore
 * security rule changes + App Check, tracked separately.
 */
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

const FIREBASE_PROJECT_ID = 'prohealthpeptides-a0808';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

export interface AdminIpGateResult {
  allowed: boolean;
  enforced: boolean;
  ip: string | null;
  reason?: string;
}

function extractIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xr = req.headers.get('x-real-ip');
  if (xr) return xr.trim();
  return null;
}

function ipv4ToInt(s: string): number | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    acc = (acc << 8) + n;
  }
  return acc >>> 0;
}

function matchesEntry(entry: string, ip: string): boolean {
  if (!entry) return false;
  if (entry.includes('/')) {
    const [range, bitsStr] = entry.split('/');
    const bits = Number(bitsStr);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const ipInt = ipv4ToInt(ip);
    const rangeInt = ipv4ToInt(range);
    if (ipInt === null || rangeInt === null) return false;
    if (bits === 0) return true;
    const mask = (~((1 << (32 - bits)) - 1)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
  }
  return entry === ip;
}

export const checkAdminIpAllowed = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminIpGateResult> => {
    // 1. Read settings/ipWhitelist to see if the guard is enabled.
    let enforced = false;
    try {
      const cfgRes = await fetch(`${FIRESTORE_BASE}/settings/ipWhitelist`, {
        headers: { Accept: 'application/json' },
      });
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as {
          fields?: { enabled?: { booleanValue?: boolean } };
        };
        enforced = cfg.fields?.enabled?.booleanValue === true;
      } else if (cfgRes.status === 404) {
        enforced = false;
      } else {
        // Reading the config failed unexpectedly — be safe and treat as
        // enforced so we fail closed below.
        enforced = true;
      }
    } catch {
      enforced = true;
    }

    if (!enforced) {
      return { allowed: true, enforced: false, ip: extractIp(getRequest()) };
    }

    // 2. Determine the caller IP from Worker request headers.
    const ip = extractIp(getRequest());
    if (!ip) {
      return {
        allowed: false,
        enforced: true,
        ip: null,
        reason: 'Could not determine caller IP',
      };
    }

    // 3. Read whitelist entries and compare.
    try {
      const listRes = await fetch(`${FIRESTORE_BASE}/ipWhitelist?pageSize=300`, {
        headers: { Accept: 'application/json' },
      });
      if (!listRes.ok) {
        return {
          allowed: false,
          enforced: true,
          ip,
          reason: `Whitelist unavailable (status ${listRes.status})`,
        };
      }
      const body = (await listRes.json()) as {
        documents?: Array<{ fields?: { ip?: { stringValue?: string } } }>;
      };
      const entries = (body.documents ?? [])
        .map((d) => d.fields?.ip?.stringValue)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);

      const allowed = entries.some((e) => matchesEntry(e, ip));
      return {
        allowed,
        enforced: true,
        ip,
        reason: allowed ? undefined : 'IP not in whitelist',
      };
    } catch {
      return {
        allowed: false,
        enforced: true,
        ip,
        reason: 'Whitelist lookup failed',
      };
    }
  },
);
