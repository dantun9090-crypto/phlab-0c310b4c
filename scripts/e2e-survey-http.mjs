#!/usr/bin/env node
/**
 * End-to-end HTTP integration test for the source-survey server functions.
 *
 * Drives a real browser against the running dev server (or any TanStack Start
 * build) and invokes `submitSourceSurvey` / `skipSourceSurvey` through their
 * actual `/_serverFn/<id>` HTTP endpoints — exercising the full pipeline:
 *
 *     network → Zod inputValidator → server handler → ownership guard
 *
 * Asserts that every edge-case payload (no creds, empty / short / wrong
 * paymentToken, empty / short / forged idToken, malformed orderId, unknown
 * source, path-traversal orderId) is rejected. Inputs that pass Zod MUST
 * fail with the generic `"Order not found"` error so an attacker cannot
 * distinguish "no such order" from "exists, wrong creds".
 *
 * Usage:
 *     # dev server must be running (default: http://localhost:8080)
 *     node scripts/e2e-survey-http.mjs
 *     BASE_URL=https://phlabs.co.uk node scripts/e2e-survey-http.mjs
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// A failure is anything that DIDN'T throw, OR threw with a message that
// leaks order-existence information. Zod boundary errors are fine (the
// request never reaches the handler). Anything that passes Zod MUST throw
// exactly "Order not found".
function classify(name, outcome) {
  if (outcome.ok) {
    return { name, pass: false, reason: 'request succeeded (should have been rejected)' };
  }
  const msg = String(outcome.msg || '');
  const zodFailure = msg.startsWith('[') && msg.includes('"code"');
  const genericNotFound = msg === 'Order not found' || msg.includes('Order not found');
  if (zodFailure || genericNotFound) {
    return { name, pass: true, msg: zodFailure ? '<zod boundary>' : 'Order not found' };
  }
  return { name, pass: false, reason: `unexpected error: ${msg.slice(0, 200)}` };
}

const SUBMIT_TRIALS = [
  { name: 'submit:no-creds',           args: { orderId: 'PHP-NOAUTH1', source: 'google_search', otherText: null } },
  { name: 'submit:empty-paymentToken', args: { orderId: 'PHP-NOAUTH2', source: 'google_search', otherText: null, paymentToken: '' } },
  { name: 'submit:short-paymentToken', args: { orderId: 'PHP-NOAUTH3', source: 'google_search', otherText: null, paymentToken: 'short' } },
  { name: 'submit:wrong-paymentToken', args: { orderId: 'PHP-NOAUTH4', source: 'google_search', otherText: null, paymentToken: 'x'.repeat(48) } },
  { name: 'submit:malformed-orderId',  args: { orderId: 'ORDER-123',           source: 'google_search', otherText: null, paymentToken: 'x'.repeat(48) } },
  { name: 'submit:pathtrav-orderId',   args: { orderId: 'PHP-../etc/passwd',   source: 'google_search', otherText: null, paymentToken: 'x'.repeat(48) } },
  { name: 'submit:empty-idToken',      args: { orderId: 'PHP-NOAUTH5', source: 'google_search', otherText: null, idToken: '' } },
  { name: 'submit:short-idToken',      args: { orderId: 'PHP-NOAUTH6', source: 'google_search', otherText: null, idToken: 'abc' } },
  { name: 'submit:forged-idToken',     args: { orderId: 'PHP-NOAUTH7', source: 'google_search', otherText: null, idToken: 'a'.repeat(64) } },
  { name: 'submit:unknown-source',     args: { orderId: 'PHP-NOAUTH8', source: 'phishing', otherText: null, paymentToken: 'x'.repeat(48) } },
];

const SKIP_TRIALS = [
  { name: 'skip:no-creds',         args: { orderId: 'PHP-SK1' } },
  { name: 'skip:empty-pt',         args: { orderId: 'PHP-SK2', paymentToken: '' } },
  { name: 'skip:wrong-pt',         args: { orderId: 'PHP-SK3', paymentToken: 'x'.repeat(48) } },
  { name: 'skip:short-idToken',    args: { orderId: 'PHP-SK4', idToken: 'abc' } },
  { name: 'skip:forged-idToken',   args: { orderId: 'PHP-SK5', idToken: 'a'.repeat(64) } },
  { name: 'skip:empty-idToken',    args: { orderId: 'PHP-SK6', idToken: '' } },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: UA,
  });
  const page = await ctx.newPage();

  console.log(`[e2e] dev server: ${BASE_URL}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });

  // The TanStack Start Vite plugin inlines `process.env.TSS_SERVER_FN_BASE`
  // into the bundled entry, but the on-demand `.functions.ts` module we
  // import from page.evaluate is not run through that define-replacement
  // path. Polyfill it with the default base so the client RPC stub can
  // resolve its target URL.
  await page.evaluate(`
    window.process = window.process || { env: { TSS_SERVER_FN_BASE: '/_serverFn/' } };
  `);

  const out = await page.evaluate(async ({ submitTrials, skipTrials }) => {
    const mod = await import('/src/lib/source-survey.functions.ts');
    const run = async (fn, trials) => {
      const results = [];
      for (const t of trials) {
        try {
          const r = await fn({ data: t.args });
          results.push({ name: t.name, ok: true, r });
        } catch (e) {
          results.push({ name: t.name, ok: false, msg: String(e?.message || e) });
        }
      }
      return results;
    };
    return {
      submit: await run(mod.submitSourceSurvey, submitTrials),
      skip: await run(mod.skipSourceSurvey, skipTrials),
      submitUrl: mod.submitSourceSurvey.url,
      skipUrl: mod.skipSourceSurvey.url,
    };
  }, { submitTrials: SUBMIT_TRIALS, skipTrials: SKIP_TRIALS });

  console.log(`[e2e] endpoint submit: ${out.submitUrl}`);
  console.log(`[e2e] endpoint skip:   ${out.skipUrl}\n`);

  let pass = 0, fail = 0;
  for (const outcome of [...out.submit, ...out.skip]) {
    const v = classify(outcome.name, outcome);
    if (v.pass) {
      pass += 1;
      console.log(`  ✓ ${v.name.padEnd(32)} rejected (${v.msg})`);
    } else {
      fail += 1;
      console.log(`  ✗ ${v.name.padEnd(32)} ${v.reason}`);
    }
  }

  console.log(`\n[e2e] ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[e2e] fatal:', err);
  process.exit(2);
});
