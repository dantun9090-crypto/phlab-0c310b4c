#!/usr/bin/env node
/**
 * Heading-structure audit.
 *
 * Fetches a list of public phlabs.co.uk routes and reports:
 *   • Multiple <h1> on one page (illegal — exactly one per page)
 *   • Skipped heading levels (e.g. h2 → h4 with no h3)
 *   • Missing <h1>
 *
 * Defaults to scanning the production site; pass `--base http://localhost:8080`
 * to point at a local preview. Exits non-zero if any failures are found so
 * the script can be wired into CI later.
 *
 * Usage:
 *   node scripts/heading-audit.mjs
 *   node scripts/heading-audit.mjs --base http://localhost:8080
 */
const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : 'https://phlabs.co.uk';

const ROUTES = [
  '/',
  '/products',
  '/research',
  '/compound',
  '/contact',
  '/about',
  '/landing/phlabs',
  '/peptide-calculator',
  '/resources',
  '/lab-reports',
  '/request-catalog',
  '/install',
  '/privacy-policy',
  '/terms-and-conditions',
  '/shipping-policy',
  '/refund-policy',
];

function extractHeadings(html) {
  // Strip <script>…</script>, <style>…</style>, and HTML comments so heading
  // strings that live inside inline JS string literals (recovery screens, JSON-LD)
  // don't get counted as real DOM headings.
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const headings = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(cleaned))) {
    const level = Number(m[1]);
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    headings.push({ level, text });
  }
  return headings;
}

function auditPage(headings) {
  const issues = [];
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) issues.push({ kind: 'missing_h1', detail: 'No <h1> on page' });
  if (h1s.length > 1) issues.push({ kind: 'multiple_h1', detail: `${h1s.length} <h1> tags: ${h1s.map((h) => `"${h.text}"`).join(', ')}` });
  let prev = 0;
  for (const h of headings) {
    if (prev > 0 && h.level > prev + 1) {
      issues.push({ kind: 'skipped_level', detail: `h${prev} → h${h.level} ("${h.text}")` });
    }
    prev = h.level;
  }
  return issues;
}

const results = [];
let totalIssues = 0;

for (const route of ROUTES) {
  const url = `${BASE}${route}`;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'PHLabs-Heading-Audit/1.0' },
      redirect: 'follow',
    });
    const html = await res.text();
    const headings = extractHeadings(html);
    const issues = auditPage(headings);
    totalIssues += issues.length;
    results.push({ route, status: res.status, headings: headings.length, issues });
  } catch (e) {
    results.push({ route, status: 0, headings: 0, issues: [{ kind: 'fetch_error', detail: String(e) }] });
    totalIssues += 1;
  }
}

console.log(`\nHeading audit — ${BASE}\n${'='.repeat(60)}`);
for (const r of results) {
  const flag = r.issues.length > 0 ? '✗' : '✓';
  console.log(`${flag} ${r.route}  [${r.status}, ${r.headings} headings]`);
  for (const i of r.issues) console.log(`    • ${i.kind}: ${i.detail}`);
}
console.log(`\n${totalIssues === 0 ? '✓ All pages pass.' : `✗ ${totalIssues} issue(s) across ${results.filter((r) => r.issues.length).length} page(s).`}\n`);

process.exit(totalIssues === 0 ? 0 : 1);
