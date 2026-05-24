/**
 * Cloudflare Worker strict-mode smoke test.
 *
 * Exercises the two pieces of server-side code that have to run inside the
 * Worker isolate (no Node built-ins, no eval, no dynamic require) end-to-end:
 *
 *   1. Firestore REST reads — covers `src/lib/firestore-rest.ts` and the
 *      `/products` + `/products/$slug` SSR loaders. Hitting these on the
 *      deployed Worker proves `fetch` to googleapis.com works under strict
 *      mode and that the products are rendered into the HTML the bot sees.
 *
 *   2. Admin IP gate — covers `src/lib/admin-ip-gate.functions.ts`. We
 *      can't easily call the wrapped createServerFn over HTTP without the
 *      hashed function id, so instead we exercise the pure helpers
 *      (`extractIp`, `ipv4ToInt`, `matchesEntry`) plus a live Firestore
 *      REST round-trip against `settings/ipWhitelist` — the same call the
 *      Worker makes.
 *
 * Run via: bun scripts/worker-smoke.ts
 * Override target: SMOKE_BASE_URL=https://phlab.lovable.app bun scripts/worker-smoke.ts
 */
import {
  extractIp,
  ipv4ToInt,
  matchesEntry,
} from "../src/lib/admin-ip-gate.functions";

const BASE = process.env.SMOKE_BASE_URL ?? "https://www.prohealthpeptides.co.uk";
const FIRESTORE =
  "https://firestore.googleapis.com/v1/projects/prohealthpeptides-a0808/databases/(default)/documents";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name}${detail ? " — " + detail : ""}`);
}

async function fetchText(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: {
      // Pretend to be Googlebot so prerender.io / our gates don't short-circuit
      "user-agent":
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      ...headers,
    },
    redirect: "follow",
  });
  return { status: res.status, body: await res.text(), headers: res.headers };
}

// ---------- 1. Pure-JS helpers (must work identically in Worker isolate) ----------
function testHelpers() {
  const reqCf = new Request("https://x/", { headers: { "cf-connecting-ip": "203.0.113.7" } });
  record("extractIp picks cf-connecting-ip", extractIp(reqCf) === "203.0.113.7");

  const reqXff = new Request("https://x/", {
    headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" },
  });
  record("extractIp parses x-forwarded-for chain", extractIp(reqXff) === "198.51.100.4");

  record("extractIp returns null without headers", extractIp(new Request("https://x/")) === null);

  record("ipv4ToInt rejects malformed", ipv4ToInt("not.an.ip.addr") === null);
  record("ipv4ToInt converts 1.2.3.4", ipv4ToInt("1.2.3.4") === ((1 << 24) | (2 << 16) | (3 << 8) | 4) >>> 0);

  record("matchesEntry exact match", matchesEntry("203.0.113.7", "203.0.113.7"));
  record("matchesEntry rejects mismatch", !matchesEntry("203.0.113.7", "203.0.113.8"));
  record("matchesEntry CIDR /24 hits",  matchesEntry("203.0.113.0/24", "203.0.113.99"));
  record("matchesEntry CIDR /24 miss",  !matchesEntry("203.0.113.0/24", "203.0.114.1"));
  record("matchesEntry CIDR /0 wildcard", matchesEntry("0.0.0.0/0", "8.8.8.8"));
  record("matchesEntry rejects bad bits", !matchesEntry("1.2.3.4/40", "1.2.3.4"));
}

// ---------- 2. Firestore REST reachability ----------
async function testFirestoreRest() {
  try {
    const res = await fetch(`${FIRESTORE}/settings/ipWhitelist`, {
      headers: { accept: "application/json" },
    });
    // 200 (doc exists) or 404 (doc missing) are both acceptable —
    // both prove the Worker can reach googleapis.com under strict mode.
    record(
      "Firestore REST reachable (settings/ipWhitelist)",
      res.status === 200 || res.status === 404,
      `status=${res.status}`,
    );
  } catch (e) {
    record("Firestore REST reachable", false, String(e));
  }

  try {
    const res = await fetch(`${FIRESTORE}/product_stock?pageSize=1`, {
      headers: { accept: "application/json" },
    });
    const json = (await res.json()) as { documents?: unknown[] };
    record(
      "Firestore REST returns product_stock documents",
      res.status === 200 && Array.isArray(json.documents) && json.documents.length > 0,
      `status=${res.status} docs=${json.documents?.length ?? 0}`,
    );
  } catch (e) {
    record("Firestore REST returns product_stock documents", false, String(e));
  }
}

// ---------- 3. Worker SSR end-to-end (proves Firestore REST works *inside* the isolate) ----------
async function testWorkerSsr() {
  try {
    const { status, body } = await fetchText(`${BASE}/products`);
    const ok =
      status === 200 &&
      body.includes("data-product-card") &&
      /\/products\/[a-z0-9-]+/i.test(body);
    record(
      `Worker SSR /products renders product cards`,
      ok,
      `status=${status} bytes=${body.length}`,
    );
  } catch (e) {
    record("Worker SSR /products renders product cards", false, String(e));
  }

  // Pull a real slug from Firestore so we don't hard-code one that may be removed.
  let slug: string | null = null;
  try {
    const res = await fetch(`${FIRESTORE}/product_stock?pageSize=20`);
    const json = (await res.json()) as { documents?: Array<{ fields?: Record<string, { stringValue?: string; booleanValue?: boolean }> }> };
    const doc = (json.documents ?? []).find(
      (d) => d.fields?.isActive?.booleanValue !== false && d.fields?.visibility?.stringValue !== "hidden",
    );
    slug =
      doc?.fields?.slug?.stringValue ??
      (doc?.fields?.name?.stringValue
        ? doc.fields.name.stringValue
            .toLowerCase()
            .replace(/[()[\]]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
        : null);
  } catch {
    /* ignore — handled below */
  }

  if (!slug) {
    record("Worker SSR /products/$slug renders detail", false, "could not discover a product slug");
    return;
  }

  try {
    const { status, body } = await fetchText(`${BASE}/products/${slug}`);
    const ok =
      status === 200 &&
      body.includes('"@type":"Product"') &&
      body.toLowerCase().includes(slug.split("-")[0]);
    record(
      `Worker SSR /products/${slug} renders detail`,
      ok,
      `status=${status} bytes=${body.length}`,
    );
  } catch (e) {
    record(`Worker SSR /products/${slug} renders detail`, false, String(e));
  }
}

async function main() {
  console.log(`Smoke target: ${BASE}\n`);
  testHelpers();
  await testFirestoreRest();
  await testWorkerSsr();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.error(`\n${failed.length} FAILED:`);
    for (const f of failed) console.error(` - ${f.name}${f.detail ? " — " + f.detail : ""}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
