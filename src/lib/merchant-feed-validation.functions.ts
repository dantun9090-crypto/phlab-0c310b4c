import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const BASE_URL = 'https://phlabs.co.uk';
const RequiredFieldSchema = z.object({ idToken: z.string().min(10).max(4096) });

async function requireAdmin(idToken: string): Promise<void> {
  const { requireFirebaseAdmin } = await import('@/lib/server/firebase-auth-admin');
  await requireFirebaseAdmin(idToken);
}

export interface MerchantFeedValidationIssue {
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

export interface MerchantFeedValidationItem {
  id: string;
  title: string;
  link: string;
  status: number;
  finalUrl: string;
  canonical: string | null;
  contentType: string | null;
  ok: boolean;
  issues: MerchantFeedValidationIssue[];
}

export interface MerchantFeedValidationReport {
  generatedAt: string;
  feedUrl: string;
  itemCount: number;
  checkedLinks: number;
  errorCount: number;
  warningCount: number;
  items: MerchantFeedValidationItem[];
}

function textBetween(itemXml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = itemXml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  if (!match) return '';
  return match[1]
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function extractCanonical(html: string): string | null {
  const match =
    html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  return match?.[1] ?? null;
}

async function checkOne(itemXml: string): Promise<MerchantFeedValidationItem> {
  const id = textBetween(itemXml, 'g:id');
  const title = textBetween(itemXml, 'title');
  const link = textBetween(itemXml, 'link');
  const price = textBetween(itemXml, 'g:price');
  const image = textBetween(itemXml, 'g:image_link');
  const availability = textBetween(itemXml, 'g:availability');
  const brand = textBetween(itemXml, 'g:brand');
  const category = textBetween(itemXml, 'g:google_product_category');
  const issues: MerchantFeedValidationIssue[] = [];

  const requireField = (field: string, value: string) => {
    if (!value) issues.push({ severity: 'error', field, message: 'Missing required Merchant field.' });
  };

  requireField('g:id', id);
  requireField('title', title);
  requireField('link', link);
  requireField('description', textBetween(itemXml, 'description'));
  requireField('g:image_link', image);
  requireField('g:availability', availability);
  requireField('g:price', price);
  requireField('g:brand', brand);
  requireField('g:condition', textBetween(itemXml, 'g:condition'));
  requireField('g:google_product_category', category);

  if (title && (title.length < 20 || title.length > 150)) {
    issues.push({ severity: 'warning', field: 'title', message: `Title length is ${title.length}; keep it 20–150 chars.` });
  }
  if (price && !/^\d+(?:\.\d{2})\s+GBP$/.test(price)) {
    issues.push({ severity: 'error', field: 'g:price', message: `Invalid price format: ${price}` });
  }
  if (link && !link.startsWith(`${BASE_URL}/products/`)) {
    issues.push({ severity: 'error', field: 'link', message: 'Link must be an apex phlabs.co.uk product URL.' });
  }

  let status = 0;
  let finalUrl = link;
  let canonical: string | null = null;
  let contentType: string | null = null;

  if (link) {
    try {
      const res = await fetch(link, {
        redirect: 'manual',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          accept: 'text/html,application/xhtml+xml',
          'cache-control': 'no-cache',
        },
        signal: AbortSignal.timeout(15_000),
      });
      status = res.status;
      finalUrl = res.url || link;
      contentType = res.headers.get('content-type');
      const html = await res.text().catch(() => '');
      canonical = extractCanonical(html);

      if (status !== 200) {
        issues.push({ severity: 'error', field: 'link', message: `Product page returned HTTP ${status}.` });
      }
      if (status >= 300 && status < 400) {
        issues.push({ severity: 'error', field: 'link', message: 'Product link redirects; Merchant pages should return 200 in-place.' });
      }
      if (/Page Not Available|noindex,\s*nofollow/i.test(html)) {
        issues.push({ severity: 'error', field: 'link', message: 'Product page rendered unavailable/noindex content.' });
      }
      if (!canonical) {
        issues.push({ severity: 'warning', field: 'canonical', message: 'Canonical tag was not detected in rendered HTML.' });
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        field: 'link',
        message: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    id,
    title,
    link,
    status,
    finalUrl,
    canonical,
    contentType,
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await fn(items[index]);
    }
  }));
  return output;
}

export const validateMerchantFeedAdmin = createServerFn({ method: 'POST' })
  .inputValidator((data) => RequiredFieldSchema.parse(data))
  .handler(async ({ data }): Promise<MerchantFeedValidationReport> => {
    await requireAdmin(data.idToken);
    const feedUrl = `${BASE_URL}/google-merchant-feed.xml?preview=${Date.now()}`;
    const feedRes = await fetch(feedUrl, {
      headers: { 'user-agent': 'PHLabs-MerchantFeedValidator/1.0', accept: 'application/xml,text/xml' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!feedRes.ok) throw new Error(`Feed returned HTTP ${feedRes.status}`);
    const xml = await feedRes.text();
    const itemXml = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).map((match) => match[1]);
    const items = await runWithConcurrency(itemXml, 5, checkOne);
    const errorCount = items.reduce((sum, item) => sum + item.issues.filter((issue) => issue.severity === 'error').length, 0);
    const warningCount = items.reduce((sum, item) => sum + item.issues.filter((issue) => issue.severity === 'warning').length, 0);
    return {
      generatedAt: new Date().toISOString(),
      feedUrl: `${BASE_URL}/google-merchant-feed.xml`,
      itemCount: itemXml.length,
      checkedLinks: items.length,
      errorCount,
      warningCount,
      items,
    };
  });