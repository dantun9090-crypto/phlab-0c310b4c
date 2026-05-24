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
import { log } from './worker-log';


const FIREBASE_PROJECT_ID = 'prohealthpeptides-a0808';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

export interface AdminIpGateResult {
  allowed: boolean;
  enforced: boolean;
  ip: string | null;
  reason?: string;
}

export function extractIp(req: Request): string | null {
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

export function ipv4ToInt(s: string): number | null {
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

export function matchesEntry(entry: string, ip: string): boolean {

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
    const started = Date.now();
    const logResult = (result: AdminIpGateResult, matchedEntry?: string) => {
      log.info({
        event: 'admin_ip_gate.decision',
        allowed: result.allowed,
        enforced: result.enforced,
        ip: result.ip,
        matchedEntry,
        reason: result.reason,
        ms: Date.now() - started,
      });
      return result;
    };

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
        log.warn({
          event: 'admin_ip_gate.config_fetch_failed',
          status: cfgRes.status,
        });
        enforced = true;
      }
    } catch (err) {
      log.warn({
        event: 'admin_ip_gate.config_fetch_threw',
        error: err instanceof Error ? err.message : String(err),
      });
      enforced = true;
    }

    if (!enforced) {
      return logResult({ allowed: true, enforced: false, ip: extractIp(getRequest()) });
    }

    // 2. Determine the caller IP from Worker request headers.
    const ip = extractIp(getRequest());
    if (!ip) {
      return logResult({
        allowed: false,
        enforced: true,
        ip: null,
        reason: 'Could not determine caller IP',
      });
    }

    // 3. Read whitelist entries and compare.
    try {
      const listRes = await fetch(`${FIRESTORE_BASE}/ipWhitelist?pageSize=300`, {
        headers: { Accept: 'application/json' },
      });
      if (!listRes.ok) {
        return logResult({
          allowed: false,
          enforced: true,
          ip,
          reason: `Whitelist unavailable (status ${listRes.status})`,
        });
      }
      const body = (await listRes.json()) as {
        documents?: Array<{ fields?: { ip?: { stringValue?: string } } }>;
      };
      const entries = (body.documents ?? [])
        .map((d) => d.fields?.ip?.stringValue)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);

      const matchedEntry = entries.find((e) => matchesEntry(e, ip));
      const allowed = matchedEntry !== undefined;
      return logResult(
        {
          allowed,
          enforced: true,
          ip,
          reason: allowed ? undefined : 'IP not in whitelist',
        },
        matchedEntry,
      );
    } catch (err) {
      log.error({
        event: 'admin_ip_gate.whitelist_fetch_threw',
        ip,
        error: err instanceof Error ? err.message : String(err),
      });
      return logResult({
        allowed: false,
        enforced: true,
        ip,
        reason: 'Whitelist lookup failed',
      });
    }
  },
);

