/**
 * Google Ads API — One-click campaign push.
 *
 * Creates a full campaign (budget, campaign, ad groups, RSAs, keywords,
 * sitelink + callout assets and links) in a single API session using the
 * Google Ads REST API v18 mutate endpoint.
 *
 * When credentials are missing, runs in "dry-run" mode and returns the full
 * operation payload that WOULD be sent. This lets you test the UI without
 * hitting Google.
 *
 * Required server-only env (set via add_secret):
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_CLIENT_ID
 *   GOOGLE_ADS_CLIENT_SECRET
 *   GOOGLE_ADS_REFRESH_TOKEN
 *   GOOGLE_ADS_CUSTOMER_ID            (10 digits, no dashes)
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID      (optional MCC manager ID)
 */
import { createServerFn } from '@tanstack/react-start';
import { CAMPAIGNS, scanCampaign, type Campaign } from './google-ads-campaign';

const API_VERSION = 'v18';
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

function micros(gbp: number): string {
  return String(Math.round(gbp * 1_000_000));
}

/** Build all mutate operations for one campaign. Pure — used in dry-run too. */
function buildOperations(c: Campaign) {
  const ops: Record<string, unknown>[] = [];

  // 1. Budget
  const budgetRef = '-1';
  ops.push({
    campaignBudgetOperation: {
      create: {
        resourceName: `customers/CID/campaignBudgets/${budgetRef}`,
        name: `${c.name} — Budget`,
        amountMicros: micros(c.dailyBudget),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
    },
  });

  // 2. Campaign
  const campaignRef = '-2';
  ops.push({
    campaignOperation: {
      create: {
        resourceName: `customers/CID/campaigns/${campaignRef}`,
        name: c.name,
        status: c.status, // PAUSED
        advertisingChannelType: 'SEARCH',
        manualCpc: { enhancedCpcEnabled: false },
        campaignBudget: `customers/CID/campaignBudgets/${budgetRef}`,
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
        trackingUrlTemplate: c.trackingTemplate,
      },
    },
  });

  // 3. Ad groups + RSAs + keywords
  let tempIdx = -100;
  c.adGroups.forEach((ag) => {
    const agRef = String(tempIdx--);
    ops.push({
      adGroupOperation: {
        create: {
          resourceName: `customers/CID/adGroups/${agRef}`,
          name: ag.name,
          status: 'ENABLED',
          campaign: `customers/CID/campaigns/${campaignRef}`,
          type: 'SEARCH_STANDARD',
          cpcBidMicros: micros(ag.maxCpc),
        },
      },
    });

    // Responsive Search Ad
    ops.push({
      adGroupAdOperation: {
        create: {
          adGroup: `customers/CID/adGroups/${agRef}`,
          status: 'ENABLED',
          ad: {
            finalUrls: [c.landingPage],
            responsiveSearchAd: {
              headlines: ag.headlines.slice(0, 15).map((t) => ({ text: t })),
              descriptions: ag.descriptions.slice(0, 4).map((t) => ({ text: t })),
            },
          },
        },
      },
    });

    // Keywords (phrase match)
    ag.keywords.forEach((kw) => {
      ops.push({
        adGroupCriterionOperation: {
          create: {
            adGroup: `customers/CID/adGroups/${agRef}`,
            status: 'ENABLED',
            keyword: { text: kw, matchType: 'PHRASE' },
          },
        },
      });
    });
  });

  // 4. Campaign-level negative keywords
  c.negativeKeywords.forEach((kw) => {
    ops.push({
      campaignCriterionOperation: {
        create: {
          campaign: `customers/CID/campaigns/${campaignRef}`,
          negative: true,
          keyword: { text: kw, matchType: 'BROAD' },
        },
      },
    });
  });

  return ops;
}

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth refresh failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error('No access_token in OAuth response');
  return j.access_token;
}

async function realPush(c: Campaign) {
  const cid = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '');
  const token = await getAccessToken();
  const ops = buildOperations(c).map((op) =>
    JSON.parse(JSON.stringify(op).replace(/customers\/CID\//g, `customers/${cid}/`)),
  );

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    'Content-Type': 'application/json',
  };
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers['login-customer-id'] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, '');
  }

  const res = await fetch(`${API_BASE}/customers/${cid}/googleAds:mutate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mutateOperations: ops, partialFailure: false, validateOnly: false }),
  });

  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: body,
      hint:
        res.status === 401
          ? 'OAuth/developer-token rejected. Verify GOOGLE_ADS_DEVELOPER_TOKEN and that the OAuth client owns the customer ID.'
          : res.status === 403
          ? 'Customer ID not accessible by this OAuth user, or developer token lacks access.'
          : 'See `error` for Google Ads field violations.',
    };
  }
  return {
    ok: true as const,
    status: res.status,
    result: body,
    deepLink: `https://ads.google.com/aw/campaigns?ocid=&__c=${cid}`,
  };
}

export const pushCampaignToGoogleAds = createServerFn({ method: 'POST' })
  .inputValidator((input: { campaignId: string; dryRun?: boolean }) => input)
  .handler(async ({ data }) => {
    const c = CAMPAIGNS.find((x) => x.id === data.campaignId);
    if (!c) return { ok: false as const, error: 'Unknown campaignId' };

    const scan = scanCampaign(c);
    if (!scan.ok) {
      return {
        ok: false as const,
        error: 'Policy scan failed — refusing to push',
        hits: scan.hits.slice(0, 10),
      };
    }

    const hasCreds =
      !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      !!process.env.GOOGLE_ADS_CLIENT_ID &&
      !!process.env.GOOGLE_ADS_CLIENT_SECRET &&
      !!process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      !!process.env.GOOGLE_ADS_CUSTOMER_ID;

    const ops = buildOperations(c);

    if (data.dryRun || !hasCreds) {
      return {
        ok: true as const,
        mode: 'dry-run' as const,
        reason: hasCreds ? 'dryRun=true requested' : 'Google Ads credentials not configured',
        campaignName: c.name,
        operationCount: ops.length,
        landingPage: c.landingPage,
        dailyBudgetGbp: c.dailyBudget,
        operationsPreview: ops.slice(0, 5),
        nextSteps: hasCreds
          ? ['Click "Push (live)" to actually create in Google Ads.']
          : [
              'Add 5 secrets: GOOGLE_ADS_DEVELOPER_TOKEN, _CLIENT_ID, _CLIENT_SECRET, _REFRESH_TOKEN, _CUSTOMER_ID',
              'Then click "Push to Google Ads" again — the live path will run.',
            ],
      };
    }

    const result = await realPush(c);
    return { ...result, mode: 'live' as const, campaignName: c.name };
  });
