/**
 * Google Tag Gateway for Advertisers — admin server functions.
 *
 * Reads / updates the zone-level Cloudflare configuration
 * (`/zones/{id}/settings/google-tag-gateway/config`) so measurement and
 * Google Ads conversion scripts are served first-party from
 * `https://phlabs.co.uk/metrics`.
 *
 * `hideOriginalIp` ("IP cloaking") makes Cloudflare strip the visitor IP
 * before proxying the beacon to Google. This is IP masking for privacy —
 * NOT content cloaking (serving different content to Google than users),
 * which would breach Google Ads/Search policy and is deliberately not
 * implemented here.
 *
 * The Cloudflare API token stays server-side (`CLOUDFLARE_API_TOKEN`).
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

const CF_ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const CONFIG_URL = `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/google-tag-gateway/config`;
const ORIGIN = 'https://phlabs.co.uk';

const TokenInput = z.object({ idToken: z.string().min(20).max(4096) });

export interface TagGatewayConfig {
  enabled: boolean;
  endpoint: string;
  hideOriginalIp: boolean;
  measurementId: string | null;
  setUpTag: boolean;
}

export interface TagGatewayStatus {
  ok: boolean;
  config: TagGatewayConfig | null;
  error: string | null;
  /** Live first-party probe of the measurement path. */
  probe: {
    scriptStatus: number | null;
    scriptBytes: number | null;
    collectStatus: number | null;
  };
  checkedAt: string;
}

async function cfConfig(
  method: 'GET' | 'PUT',
  body?: Record<string, unknown>,
): Promise<TagGatewayConfig> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN missing');
  const res = await fetch(CONFIG_URL, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as {
    success: boolean;
    result?: Partial<TagGatewayConfig>;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !json.success) {
    const detail = json.errors?.map((e) => e.message).filter(Boolean).join('; ');
    throw new Error(`Cloudflare ${method} failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  const r = json.result ?? {};
  return {
    enabled: !!r.enabled,
    endpoint: r.endpoint ?? '/metrics',
    hideOriginalIp: !!r.hideOriginalIp,
    measurementId: r.measurementId ?? null,
    setUpTag: !!r.setUpTag,
  };
}

async function probe(endpoint: string, measurementId: string | null) {
  const out = { scriptStatus: null as number | null, scriptBytes: null as number | null, collectStatus: null as number | null };
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  try {
    const id = measurementId ?? '';
    const r = await fetch(`${ORIGIN}${path}/gtag/js?id=${encodeURIComponent(id)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    out.scriptStatus = r.status;
    out.scriptBytes = (await r.arrayBuffer()).byteLength;
  } catch { /* leave null */ }
  try {
    const r = await fetch(`${ORIGIN}${path}/g/collect?v=2&tid=${encodeURIComponent(measurementId ?? '')}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
    out.collectStatus = r.status;
  } catch { /* leave null */ }
  return out;
}

export const getTagGatewayStatus = createServerFn({ method: 'POST' })
  .validator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ data }): Promise<TagGatewayStatus> => {
    await requireFirebaseAdmin(data.idToken);
    const checkedAt = new Date().toISOString();
    try {
      const config = await cfConfig('GET');
      return {
        ok: true,
        config,
        error: null,
        probe: await probe(config.endpoint, config.measurementId),
        checkedAt,
      };
    } catch (e) {
      return {
        ok: false,
        config: null,
        error: e instanceof Error ? e.message : 'Unknown error',
        probe: { scriptStatus: null, scriptBytes: null, collectStatus: null },
        checkedAt,
      };
    }
  });

const UpdateSchema = TokenInput.extend({
  enabled: z.boolean(),
  /** IP masking toward Google. Not content cloaking. */
  hideOriginalIp: z.boolean(),
});

export const updateTagGatewayConfig = createServerFn({ method: 'POST' })
  .validator((i: unknown) => UpdateSchema.parse(i))
  .handler(async ({ data }): Promise<TagGatewayStatus> => {
    await requireFirebaseAdmin(data.idToken);
    const checkedAt = new Date().toISOString();
    try {
      const config = await cfConfig('PUT', {
        enabled: data.enabled,
        hideOriginalIp: data.hideOriginalIp,
      });
      return {
        ok: true,
        config,
        error: null,
        probe: await probe(config.endpoint, config.measurementId),
        checkedAt,
      };
    } catch (e) {
      return {
        ok: false,
        config: null,
        error: e instanceof Error ? e.message : 'Unknown error',
        probe: { scriptStatus: null, scriptBytes: null, collectStatus: null },
        checkedAt,
      };
    }
  });
