// IndexNow submitter — implements https://www.indexnow.org/documentation
// Single GET for one URL, POST JSON for batches up to 10,000.
// Endpoint: api.indexnow.org/IndexNow (works for Bing, Yandex, Seznam, Naver).
import { createServerFn } from '@tanstack/react-start';

const HOST = 'phlabs.co.uk';
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

interface SubmitResult {
  ok: boolean;
  status: number;
  submitted: number;
  message: string;
}

/** Validate URLs belong to our host (IndexNow rejects mismatched hosts with 422). */
function filterValid(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') continue;
    try {
      const u = new URL(raw.trim());
      if (u.hostname !== HOST) continue;
      if (seen.has(u.href)) continue;
      seen.add(u.href);
      out.push(u.href);
    } catch {
      // skip malformed
    }
  }
  return out;
}

export const submitToIndexNow = createServerFn({ method: 'POST' })
  .inputValidator((input: { urls: string[] }) => {
    if (!input || !Array.isArray(input.urls)) {
      throw new Error('urls[] required');
    }
    return { urls: input.urls.slice(0, 10_000) };
  })
  .handler(async ({ data }): Promise<SubmitResult> => {
    const key = process.env.BING_INDEXNOW_API_KEY;
    if (!key) {
      return { ok: false, status: 503, submitted: 0, message: 'BING_INDEXNOW_API_KEY not configured' };
    }

    const urlList = filterValid(data.urls);
    if (urlList.length === 0) {
      return { ok: false, status: 400, submitted: 0, message: `No valid URLs on host ${HOST}` };
    }

    const keyLocation = `https://${HOST}/${key}.txt`;

    // Per spec: POST JSON for batches; single-URL GET also supported but POST works for all.
    const body = {
      host: HOST,
      key,
      keyLocation,
      urlList,
    };

    let status = 0;
    let respText = '';
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
      status = res.status;
      respText = await res.text().catch(() => '');
    } catch (e) {
      return {
        ok: false,
        status: 0,
        submitted: 0,
        message: `Network error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // IndexNow spec response codes:
    // 200 OK · 202 Accepted (key validation pending) · 400 bad request ·
    // 403 key not valid (file not found / key mismatch) · 422 URL/host mismatch ·
    // 429 too many requests
    const ok = status === 200 || status === 202;
    const messages: Record<number, string> = {
      200: 'Submitted successfully',
      202: 'Accepted — key validation pending',
      400: 'Bad request (invalid format)',
      403: 'Key not valid — verify key file is reachable at keyLocation',
      422: 'URLs do not match host or key location',
      429: 'Too many requests — slow down',
    };

    return {
      ok,
      status,
      submitted: ok ? urlList.length : 0,
      message: messages[status] ?? `HTTP ${status}${respText ? ` — ${respText.slice(0, 200)}` : ''}`,
    };
  });
