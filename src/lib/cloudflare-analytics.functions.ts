import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from './server/firebase-auth-admin';

const ZONE_ID = 'ed093ef4578e8e3568e26c3e979558c6';
const GQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

const InputSchema = z.object({
  idToken: z.string().min(20).max(4096),
  /** Lookback window in hours. */
  hours: z.number().int().min(1).max(168).default(24),
});

export interface CountryTrafficRow {
  country: string;
  human: number;
  likelyAutomated: number;
  definitelyAutomated: number;
  verifiedBot: number;
  unknown: number;
  total: number;
}

export interface CloudflareAnalyticsResult {
  ok: boolean;
  windowHours: number;
  since: string;
  until: string;
  totals: {
    human: number;
    likelyAutomated: number;
    definitelyAutomated: number;
    verifiedBot: number;
    unknown: number;
    total: number;
  };
  /** Sorted by human requests desc. */
  rows: CountryTrafficRow[];
  error?: string;
}

/**
 * Admin-only: pulls Cloudflare httpRequestsAdaptiveGroups from the Analytics
 * GraphQL API, grouped by client country + bot class, so the admin can see
 * real human traffic per country vs. "Likely automated" bots. This is the
 * data behind the saved "Bot class = Likely automated" filtered view.
 */
export const getCloudflareCountryTraffic = createServerFn({ method: 'POST' })
  .validator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<CloudflareAnalyticsResult> => {
    await requireFirebaseAdmin(data.idToken);

    const until = new Date();
    const since = new Date(until.getTime() - data.hours * 3600_000);

    const query = `
      query CountryBotClass($zone: String!, $since: Time!, $until: Time!) {
        viewer {
          zones(filter: { zoneTag: $zone }) {
            httpRequestsAdaptiveGroups(
              limit: 5000
              filter: { datetime_geq: $since, datetime_leq: $until }
            ) {
              count
              dimensions {
                clientCountryName
                botManagementBotClass
              }
            }
          }
        }
      }
    `;

    const res = await fetch(GQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          zone: ZONE_ID,
          since: since.toISOString(),
          until: until.toISOString(),
        },
      }),
    });

    const json = (await res.json()) as {
      data?: {
        viewer?: {
          zones?: Array<{
            httpRequestsAdaptiveGroups?: Array<{
              count: number;
              dimensions: {
                clientCountryName: string;
                botManagementBotClass: string;
              };
            }>;
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    const empty = { human: 0, likelyAutomated: 0, definitelyAutomated: 0, verifiedBot: 0, unknown: 0, total: 0 };

    if (json.errors?.length) {
      return {
        ok: false,
        windowHours: data.hours,
        since: since.toISOString(),
        until: until.toISOString(),
        totals: empty,
        rows: [],
        error: json.errors.map((e) => e.message).join('; '),
      };
    }

    const groups = json.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
    const byCountry = new Map<string, CountryTrafficRow>();
    const totals = { ...empty };

    const bucket = (row: CountryTrafficRow | typeof totals, cls: string, n: number) => {
      row.total += n;
      switch (cls) {
        case 'human': row.human += n; break;
        case 'likely_automated': row.likelyAutomated += n; break;
        case 'likely_human': row.human += n; break;
        case 'definitely_automated': row.definitelyAutomated += n; break;
        case 'verified_bot': row.verifiedBot += n; break;
        default: row.unknown += n;
      }
    };

    for (const g of groups) {
      const country = g.dimensions.clientCountryName || 'Unknown';
      const cls = g.dimensions.botManagementBotClass || 'unknown';
      let row = byCountry.get(country);
      if (!row) {
        row = { country, human: 0, likelyAutomated: 0, definitelyAutomated: 0, verifiedBot: 0, unknown: 0, total: 0 };
        byCountry.set(country, row);
      }
      bucket(row, cls, g.count);
      bucket(totals, cls, g.count);
    }

    const rows = Array.from(byCountry.values()).sort((a, b) => b.human - a.human);

    return {
      ok: true,
      windowHours: data.hours,
      since: since.toISOString(),
      until: until.toISOString(),
      totals,
      rows,
    };
  });
