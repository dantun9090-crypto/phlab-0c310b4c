/**
 * End-to-end check for the nonce-based Content-Security-Policy.
 *
 * For each tested route (public + admin) the script verifies:
 *
 *   1. `content-security-policy` response header is present.
 *   2. `script-src` does NOT contain 'unsafe-inline'.
 *   3. `script-src` contains a 'nonce-...' token + 'strict-dynamic'.
 *   4. `report-uri /api/public/csp-report` + `report-to csp-endpoint`
 *      directives are present, and the `Reporting-Endpoints` header
 *      points at the same path.
 *   5. Every <script> tag in the HTML body carries a nonce="..."
 *      attribute equal to the one declared in the CSP header.
 *   6. Two consecutive requests to the same path get DIFFERENT nonces
 *      (proves the nonce is generated per-request, not cached).
 *
 * Also fires a synthetic POST at /api/public/csp-report to confirm the
 * sink accepts both legacy application/csp-report and modern
 * application/reports+json payloads and answers 204.
 *
 * Run via:    bun scripts/csp-e2e.ts
 * Override:   CSP_BASE_URL=https://www.phlabs.co.uk bun scripts/csp-e2e.ts
 *
 * Wired into bun run ci so CSP regressions break the build.
 */

const BASE = process.env.CSP_BASE_URL ?? "https://www.phlabs.co.uk";

// Browser-shaped UA so the Worker does NOT route us through Prerender.io
// (that path serves cached HTML and is irrelevant to CSP enforcement).
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name}${detail ? " — " + detail : ""}`);
}

async function fetchHtml(path: string) {
  const url = BASE + path;
  const res = await fetch(url, {
    headers: {
      "user-agent": BROWSER_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  return {
    status: res.status,
    body: await res.text(),
    headers: res.headers,
    finalUrl: res.url,
  };
}

// Parse one CSP directive into { name, tokens[] }. We split on whitespace
// AFTER lower-casing the directive name; tokens keep their original case.
function parseCsp(header: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const raw of header.split(";")) {
    const part = raw.trim();
    if (!part) continue;
    const [name, ...rest] = part.split(/\s+/);
    out[name.toLowerCase()] = rest;
  }
  return out;
}

function extractNonceFromCsp(directives: Record<string, string[]>): string | null {
  for (const dir of ["script-src", "script-src-elem"]) {
    const tokens = directives[dir];
    if (!tokens) continue;
    for (const t of tokens) {
      const m = t.match(/^'nonce-([^']+)'$/);
      if (m) return m[1];
    }
  }
  return null;
}

// Extract every <script ... nonce="..."> attribute value from raw HTML.
// We tolerate single- or double-quoted nonces and <script> without nonce
// (those are the failures we want to catch).
function extractScriptNonces(html: string): Array<string | null> {
  const out: Array<string | null> = [];
  const re = /<script\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const nm = attrs.match(/\bnonce\s*=\s*("([^"]*)"|'([^']*)')/i);
    out.push(nm ? nm[2] ?? nm[3] ?? null : null);
  }
  return out;
}

async function checkRoute(path: string): Promise<string | null> {
  console.log(`\n→ ${path}`);
  const a = await fetchHtml(path);

  // 1. CSP header present
  const csp = a.headers.get("content-security-policy");
  record(`${path} :: CSP header present`, !!csp, csp ? "" : "missing");
  if (!csp) return null;

  const directives = parseCsp(csp);

  // 2. No 'unsafe-inline' in script-src / script-src-elem
  const scriptSrc = (directives["script-src"] ?? []).concat(directives["script-src-elem"] ?? []);
  const hasUnsafeInline = scriptSrc.includes("'unsafe-inline'");
  record(`${path} :: script-src has no 'unsafe-inline'`, !hasUnsafeInline);

  // 3. script-src contains nonce + 'strict-dynamic'
  const nonce = extractNonceFromCsp(directives);
  const strictDynamic = scriptSrc.includes("'strict-dynamic'");
  record(`${path} :: script-src has nonce`, !!nonce, nonce ?? "n/a");
  record(`${path} :: script-src has 'strict-dynamic'`, strictDynamic);

  // 4. Reporting directives
  const reportUri = (directives["report-uri"] ?? []).join(" ");
  const reportTo = (directives["report-to"] ?? []).join(" ");
  record(`${path} :: report-uri set`, reportUri === "/api/public/csp-report", reportUri);
  record(`${path} :: report-to set`, reportTo === "csp-endpoint", reportTo);
  const reportingHeader = a.headers.get("reporting-endpoints") ?? "";
  record(
    `${path} :: Reporting-Endpoints header points at sink`,
    /csp-endpoint\s*=\s*"\/api\/public\/csp-report"/.test(reportingHeader),
    reportingHeader,
  );

  // 5. Every <script> tag carries the declared nonce
  if (nonce) {
    const scriptNonces = extractScriptNonces(a.body);
    const scriptCount = scriptNonces.length;
    const missing = scriptNonces.filter((n) => n == null).length;
    const mismatched = scriptNonces.filter((n) => n != null && n !== nonce).length;
    record(
      `${path} :: every <script> stamped with nonce`,
      scriptCount > 0 && missing === 0 && mismatched === 0,
      `${scriptCount} scripts, ${missing} missing, ${mismatched} mismatched`,
    );
  }

  return nonce;
}

async function checkNoncesDifferAcrossRequests(path: string) {
  console.log(`\n→ ${path} (per-request nonce uniqueness)`);
  const [a, b] = await Promise.all([fetchHtml(path), fetchHtml(path)]);
  const ca = a.headers.get("content-security-policy") ?? "";
  const cb = b.headers.get("content-security-policy") ?? "";
  const na = extractNonceFromCsp(parseCsp(ca));
  const nb = extractNonceFromCsp(parseCsp(cb));
  record(
    `${path} :: nonces differ across requests`,
    !!na && !!nb && na !== nb,
    `${na ?? "—"} vs ${nb ?? "—"}`,
  );
}

async function checkReportSink() {
  console.log(`\n→ /api/public/csp-report (sink accepts reports)`);
  const url = BASE + "/api/public/csp-report";

  const legacy = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: JSON.stringify({
      "csp-report": {
        "document-uri": BASE + "/csp-e2e-test",
        "violated-directive": "script-src",
        "blocked-uri": "inline",
        "original-policy": "script-src 'self'",
      },
    }),
  });
  record(`/api/public/csp-report :: legacy report accepted`, legacy.status === 204, `HTTP ${legacy.status}`);

  const modern = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/reports+json" },
    body: JSON.stringify([
      {
        type: "csp-violation",
        age: 0,
        url: BASE + "/csp-e2e-test",
        user_agent: "csp-e2e",
        body: {
          documentURL: BASE + "/csp-e2e-test",
          blockedURL: "inline",
          effectiveDirective: "script-src-elem",
          originalPolicy: "script-src 'self'",
          disposition: "enforce",
          statusCode: 200,
        },
      },
    ]),
  });
  record(`/api/public/csp-report :: modern report accepted`, modern.status === 204, `HTTP ${modern.status}`);
}

async function main() {
  console.log(`CSP E2E against ${BASE}\n`);

  // Public + admin pages. Admin routes 200 (gate is client-side on the React
  // route); the CSP we want to verify is set at the Worker layer regardless.
  const routes = ["/", "/products", "/admin", "/admin/products"];

  for (const r of routes) {
    await checkRoute(r);
  }

  await checkNoncesDifferAcrossRequests("/admin");
  await checkReportSink();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? " — " + f.detail : ""}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
