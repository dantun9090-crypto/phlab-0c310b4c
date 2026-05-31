/**
 * Server function: mail delivery health for phlabs.co.uk.
 *
 * Admin-only. Pulls live data from:
 *   - cPanel UAPI (OrangeWebsite)  — mailbox status + disk usage + forwarders
 *                                     + recent delivery events (EmailTrack)
 *   - Cloudflare DNS-over-HTTPS    — MX + SPF + DMARC records
 *
 * No raw SMTP probing — Cloudflare Workers don't allow outbound TCP/25.
 * cPanel's EmailTrack log is the source of truth for what's actually
 * being delivered, deferred, or bounced at the mail server.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

const DOMAIN = 'phlabs.co.uk';
const CPANEL_HOST = 'https://eldborg.orangewebsite.com:2083';

const Input = z.object({
  idToken: z.string().min(10).max(4096),
});

function cpHeaders() {
  const user = process.env.CPANEL_USERNAME;
  const token = process.env.CPANEL_API_TOKEN;
  if (!user || !token) throw new Error('cpanel_credentials_missing');
  return { Authorization: `cpanel ${user}:${token}` };
}

async function cpanel<T = any>(path: string): Promise<T> {
  const res = await fetch(`${CPANEL_HOST}/execute/${path}`, { headers: cpHeaders() });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`cpanel_bad_response: ${text.slice(0, 120)}`);
  }
}

async function dns(name: string, type: 'MX' | 'TXT' | 'A'): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: 'application/dns-json' } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { Answer?: Array<{ data: string }> };
    return (data.Answer ?? []).map((a) => a.data);
  } catch {
    return [];
  }
}

export interface Mailbox {
  email: string;
  diskUsedHuman: string;
  diskQuotaHuman: string;
  diskUsedPct: number;
  suspendedLogin: boolean;
  suspendedIncoming: boolean;
}

export interface DeliveryEvent {
  time: number;             // unix seconds
  sender: string;
  recipient: string;
  status: 'success' | 'defer' | 'failure' | 'inprogress' | 'rejected' | string;
  result: string;           // human message
  router: string;
}

export interface MailHealth {
  domain: string;
  generatedAt: number;
  dns: {
    mx: string[];
    spf: string[];
    dmarc: string[];
  };
  mailboxes: Mailbox[];
  forwarders: Array<{ dest: string; forward: string }>;
  events: DeliveryEvent[];
  counts: {
    total: number;
    success: number;
    defer: number;
    failure: number;
    rejected: number;
  };
  errors: string[];          // any sub-fetch that failed (non-fatal)
}

export const getMailHealth = createServerFn({ method: 'POST' })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }): Promise<MailHealth> => {
    await requireFirebaseAdmin(data.idToken);

    const errors: string[] = [];

    // ---- DNS (parallel) ----
    const [mxRaw, txtRaw, dmarcRaw] = await Promise.all([
      dns(DOMAIN, 'MX'),
      dns(DOMAIN, 'TXT'),
      dns(`_dmarc.${DOMAIN}`, 'TXT'),
    ]);
    const spf = txtRaw.filter((t) => /v=spf1/i.test(t)).map((t) => t.replace(/^"|"$/g, ''));
    const dmarc = dmarcRaw.map((t) => t.replace(/^"|"$/g, ''));

    // ---- cPanel (parallel) ----
    const [popsRes, fwdRes, trackRes] = await Promise.allSettled([
      cpanel<{ data?: any[]; errors?: string[] }>(
        `Email/list_pops_with_disk?domain=${encodeURIComponent(DOMAIN)}`,
      ),
      cpanel<{ data?: any[]; errors?: string[] }>(
        `Email/list_forwarders?domain=${encodeURIComponent(DOMAIN)}`,
      ),
      // Last 24h. EmailTrack returns deliveries (success), defers, failures.
      cpanel<{ data?: { rows?: any[] }; errors?: string[] }>(
        `EmailTrack/search?api.sort=1&api.sort_column_0=sendunixtime&api.sort_reverse_0=1` +
          `&api.paginate=1&api.paginate_start=0&api.paginate_size=200` +
          `&starttime=${Math.floor(Date.now() / 1000) - 24 * 3600}`,
      ),
    ]);

    let mailboxes: Mailbox[] = [];
    if (popsRes.status === 'fulfilled' && popsRes.value?.data) {
      mailboxes = popsRes.value.data.map((b: any) => ({
        email: b.email,
        diskUsedHuman: b.humandiskused?.replace(/\u00a0/g, ' ') ?? '0 KB',
        diskQuotaHuman: b.humandiskquota?.replace(/\u00a0/g, ' ') ?? 'unlimited',
        diskUsedPct: Number(b.diskusedpercent_float ?? 0),
        suspendedLogin: b.suspended_login === 1,
        suspendedIncoming: b.suspended_incoming === 1,
      }));
    } else if (popsRes.status === 'rejected') {
      errors.push(`mailboxes: ${(popsRes.reason as Error).message}`);
    }

    let forwarders: Array<{ dest: string; forward: string }> = [];
    if (fwdRes.status === 'fulfilled' && fwdRes.value?.data) {
      forwarders = (fwdRes.value.data as any[]).map((f) => ({
        dest: f.dest ?? '',
        forward: f.forward ?? '',
      }));
    } else if (fwdRes.status === 'rejected') {
      errors.push(`forwarders: ${(fwdRes.reason as Error).message}`);
    }

    let events: DeliveryEvent[] = [];
    if (trackRes.status === 'fulfilled') {
      const rows = (trackRes.value as any)?.data?.rows ?? (trackRes.value as any)?.data ?? [];
      if (Array.isArray(rows)) {
        events = rows
          .filter((r: any) => {
            const s = (r.sender || '').toLowerCase();
            const recv = (r.recipient || '').toLowerCase();
            return s.includes(DOMAIN) || recv.includes(DOMAIN);
          })
          .map((r: any) => ({
            time: Number(r.sendunixtime ?? r.actiontime ?? 0),
            sender: r.sender ?? '',
            recipient: r.recipient ?? '',
            status: String(r.deliveredto ? 'success' : r.transport_method === 'fail' ? 'failure' : r.actionresult ?? r.action ?? 'unknown'),
            result: r.message ?? r.router ?? '',
            router: r.router ?? r.transport ?? '',
          }))
          .slice(0, 200);
      }
      if ((trackRes.value as any)?.errors?.length) {
        errors.push(`emailtrack: ${(trackRes.value as any).errors.join('; ')}`);
      }
    } else {
      errors.push(`emailtrack: ${(trackRes.reason as Error).message}`);
    }

    const counts = {
      total: events.length,
      success: events.filter((e) => /success|deliver/i.test(e.status)).length,
      defer: events.filter((e) => /defer/i.test(e.status)).length,
      failure: events.filter((e) => /fail/i.test(e.status)).length,
      rejected: events.filter((e) => /reject/i.test(e.status)).length,
    };

    return {
      domain: DOMAIN,
      generatedAt: Date.now(),
      dns: { mx: mxRaw, spf, dmarc },
      mailboxes,
      forwarders,
      events,
      counts,
      errors,
    };
  });
