import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

const ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const BOT_API_URL = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/bot_management`;

const InputSchema = z.object({
  idToken: z.string().min(20).max(4096),
});

export interface BotManagementConfig {
  fight_mode?: boolean;
  sbfm_likely_automated?: string;
  sbfm_definitely_automated?: string;
  sbfm_verified_bots?: string;
  sbfm_static_resource_protection?: boolean;
  ai_bots_protection?: string;
  content_bots_protection?: string;
  crawler_protection?: string;
  enable_js?: boolean;
  optimize_wordpress?: boolean;
  suppress_session_score?: boolean;
  cf_robots_variant?: string;
  is_robots_txt_managed?: boolean;
  using_latest_model?: boolean;
  bm_cookie_enabled?: boolean;
}

export interface CloudflareBotStatus {
  ok: boolean;
  config: BotManagementConfig | null;
  /** Live probe of https://phlabs.co.uk/. */
  probe: {
    cfCache: string | null;
    hasCfBm: boolean;
    setCookieSnippet: string;
  };
}

/**
 * Admin-only: fetch the current Cloudflare Bot Management / Super Bot Fight Mode
 * configuration and a live HEAD probe of the homepage.
 *
 * The Cloudflare API token is server-side only (process.env.CLOUDFLARE_API_TOKEN).
 */
export const getCloudflareBotStatus = createServerFn({ method: 'POST' })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<CloudflareBotStatus> => {
    await requireFirebaseAdmin(data.idToken);

    const apiRes = await fetch(BOT_API_URL, {
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    const apiJson = (await apiRes.json()) as {
      success: boolean;
      result?: BotManagementConfig;
      errors?: Array<{ code: number; message: string }>;
    };

    const probe = await fetch('https://phlabs.co.uk/', {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'user-agent': 'phlabs-admin-probe/1.0' },
    });
    const setCookie = probe.headers.get('set-cookie') || '';

    return {
      ok: apiJson.success,
      config: apiJson.result ?? null,
      probe: {
        cfCache: probe.headers.get('cf-cache-status'),
        hasCfBm: /__cf_bm/i.test(setCookie),
        setCookieSnippet: setCookie.slice(0, 200),
      },
    };
  });
