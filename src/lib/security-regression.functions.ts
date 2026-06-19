import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

/**
 * Automated security regression check — fetches the live origin and
 * validates that critical security headers, robots rules, and reserved
 * Firebase Hosting paths are still in place after every deploy.
 *
 * Wired into:
 *   - SecurityAuditTab (admin: manual "Run live probe" button)
 *   - post-publish-check (fire-and-forget on first request after deploy)
 *
 * Result shape is stable — admin UI merges these into the static baseline.
 */

const ORIGIN = 'https://phlabs.co.uk';

export type ProbeStatus = 'pass' | 'fail' | 'warn';
export interface ProbeCheck {
  id: string;
  title: string;
  status: ProbeStatus;
  detail: string;
}
export interface ProbeReport {
  ok: boolean;
  timestamp: string;
  checks: ProbeCheck[];
  failed: number;
}

const InputSchema = z.object({
  idToken: z.string().min(20).max(4096),
  /** Persist the result in Firestore (auditLogs + _meta/security_regression). */
  persist: z.boolean().optional(),
});

async function safeFetch(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent': 'phlabs-security-regression/1.0',
        ...(init?.headers || {}),
      },
    });
    return res;
  } catch (e) {
    return null;
  }
}

function check(id: string, title: string, ok: boolean, detail: string, soft = false): ProbeCheck {
  return { id, title, status: ok ? 'pass' : soft ? 'warn' : 'fail', detail };
}

export async function runSecurityRegression(): Promise<ProbeReport> {
  const checks: ProbeCheck[] = [];

  // 1) Root HTML — must be 200, must carry security headers
  const root = await safeFetch(`${ORIGIN}/`);
  if (!root) {
    checks.push({ id: 'root-reachable', title: 'Origin reachable', status: 'fail', detail: 'fetch failed / timeout' });
  } else {
    checks.push(check('root-reachable', 'Origin reachable', root.status === 200, `status ${root.status}`));

    const csp = root.headers.get('content-security-policy') || '';
    checks.push(check(
      'csp-present',
      'CSP header present',
      csp.length > 0,
      csp ? `${csp.length} chars` : 'missing',
    ));
    checks.push(check(
      'csp-nonce',
      "CSP script-src uses nonce + 'strict-dynamic'",
      /'nonce-[A-Za-z0-9+/=_-]+'/.test(csp) && csp.includes("'strict-dynamic'"),
      csp ? csp.slice(0, 120) + '…' : 'no csp',
    ));
    checks.push(check(
      'csp-no-unsafe-inline-script',
      "script-src does not allow 'unsafe-inline'",
      !/script-src[^;]*'unsafe-inline'/.test(csp),
      'script-src clean',
    ));

    const hsts = root.headers.get('strict-transport-security') || '';
    checks.push(check(
      'hsts',
      'HSTS ≥ 6 months + includeSubDomains',
      /max-age=(\d+)/.test(hsts) && Number(RegExp.$1) >= 15_552_000 && /includeSubDomains/i.test(hsts),
      hsts || 'missing',
    ));

    checks.push(check('xcto', 'X-Content-Type-Options: nosniff',
      (root.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff',
      root.headers.get('x-content-type-options') || 'missing'));

    const ref = root.headers.get('referrer-policy') || '';
    checks.push(check('referrer-policy', 'Referrer-Policy set', ref.length > 0, ref || 'missing'));

    const perm = root.headers.get('permissions-policy') || '';
    checks.push(check('permissions-policy', 'Permissions-Policy set', perm.length > 0, perm.slice(0, 80) || 'missing'));

    const frameAnc = /frame-ancestors[^;]+/.exec(csp)?.[0] || '';
    const xfo = root.headers.get('x-frame-options') || '';
    checks.push(check(
      'frame-protection',
      "frame-ancestors 'none' OR X-Frame-Options DENY",
      /frame-ancestors\s+'none'/.test(csp) || xfo.toUpperCase() === 'DENY',
      frameAnc || xfo || 'missing',
    ));
  }

  // 2) robots.txt must block sensitive paths
  const robots = await safeFetch(`${ORIGIN}/robots.txt`);
  if (!robots || robots.status !== 200) {
    checks.push({ id: 'robots-reachable', title: 'robots.txt reachable', status: 'fail', detail: `status ${robots?.status ?? 'n/a'}` });
  } else {
    const body = await robots.text();
    const required = ['/admin', '/cart', '/checkout', '/account', '/__/', '/api/'];
    const missing = required.filter((p) => !new RegExp(`Disallow:\\s*${p.replace(/[/.]/g, '\\$&')}`, 'i').test(body));
    checks.push(check(
      'robots-blocks',
      'robots.txt blocks /admin /cart /checkout /account /__/ /api/',
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : 'all present',
    ));
    const aiBots = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'CCBot', 'Google-Extended'];
    const missingBots = aiBots.filter((b) => !new RegExp(`User-agent:\\s*${b}`, 'i').test(body));
    checks.push(check(
      'robots-ai-bots',
      'robots.txt blocks AI scrapers',
      missingBots.length === 0,
      missingBots.length ? `missing: ${missingBots.join(', ')}` : 'all present',
      true,
    ));
  }

  // 3) Firebase Hosting reserved /__/auth/iframe must NOT 404 (login depends on it)
  const iframe = await safeFetch(`${ORIGIN}/__/auth/iframe`);
  checks.push(check(
    'firebase-auth-iframe',
    'Firebase /__/auth/iframe reachable (not prerendered)',
    !!iframe && iframe.status === 200,
    iframe ? `status ${iframe.status} ct=${iframe.headers.get('content-type') || '?'}` : 'unreachable',
  ));

  // 4) Sitemap reachable + XML
  const sm = await safeFetch(`${ORIGIN}/sitemap.xml`);
  checks.push(check(
    'sitemap',
    'sitemap.xml reachable + XML',
    !!sm && sm.status === 200 && /xml/i.test(sm.headers.get('content-type') || ''),
    sm ? `status ${sm.status} ct=${sm.headers.get('content-type') || '?'}` : 'unreachable',
  ));

  // 5) www → apex redirect (legacy host hygiene)
  const www = await safeFetch('https://www.phlabs.co.uk/');
  checks.push(check(
    'www-redirect',
    'www.phlabs.co.uk 301 → apex',
    !!www && www.status === 301 && (www.headers.get('location') || '').startsWith('https://phlabs.co.uk'),
    www ? `status ${www.status} loc=${www.headers.get('location') || '?'}` : 'unreachable',
  ));

  const failed = checks.filter((c) => c.status === 'fail').length;
  return {
    ok: failed === 0,
    timestamp: new Date().toISOString(),
    checks,
    failed,
  };
}

export const probeSecurityRegression = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      await requireFirebaseAdmin(data.idToken);
    } catch (e) {
      return {
        ok: false,
        error: 'unauthorized',
        reason: e instanceof Error ? e.message : 'auth_failed',
      } as const;
    }
    const report = await runSecurityRegression();
    if (data.persist) {
      try {
        const { addDocAdmin, setDocAdmin } = await import('./server/firestore-admin');
        await setDocAdmin('_meta', 'security_regression', {
          ...report,
          updatedAt: new Date().toISOString(),
        });
        await addDocAdmin('securityRegressions', {
          ...report,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[security-regression] persist failed:', e);
      }
    }
    return { ok: true, report } as const;
  });
