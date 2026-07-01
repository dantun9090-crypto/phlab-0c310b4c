/**
 * Build-time XML validation for /sitemap.xml and /bing-feed.xml.
 *
 * Invokes each route's GET handler in-process, then parses the response
 * body with fast-xml-parser in STRICT mode. Fails the build (exit 1) if
 * either feed is not well-formed XML, is missing required elements, or
 * contains zero <url> entries.
 *
 * Wired into `build:preflight` so a malformed sitemap can never ship.
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";

type RouteMod = {
  Route: {
    options: {
      server: { handlers: { GET: (ctx: unknown) => Promise<Response> } };
    };
  };
};

async function invokeGet(mod: RouteMod, label: string): Promise<string> {
  const handler = mod.Route.options.server.handlers.GET;
  if (typeof handler !== "function") {
    throw new Error(`${label}: no GET handler exported`);
  }
  const res = await handler({});
  if (!(res instanceof Response)) {
    throw new Error(`${label}: handler did not return a Response`);
  }
  if (res.status !== 200) {
    throw new Error(`${label}: handler returned HTTP ${res.status}`);
  }
  const ct = res.headers.get("Content-Type") || "";
  if (!/xml/i.test(ct)) {
    throw new Error(`${label}: Content-Type is not XML (${ct})`);
  }
  return await res.text();
}

const VALID_CHANGEFREQ = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

// W3C Datetime for sitemaps: YYYY-MM-DD or full ISO-8601 with timezone.
const LASTMOD_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

function isValidLastmod(v: unknown): v is string {
  if (typeof v !== "string" || !LASTMOD_RE.test(v)) return false;
  const d = new Date(v);
  if (isNaN(d.getTime())) return false;
  // Guard against obvious garbage: year must be sane.
  const y = d.getUTCFullYear();
  return y >= 2000 && y <= 2100;
}

function isValidAbsoluteHttpsUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.trim() === "") return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

interface UrlEntry {
  loc?: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
  "image:image"?:
    | { "image:loc"?: string }
    | Array<{ "image:loc"?: string }>;
}

interface FeedReport {
  label: string;
  ok: boolean;
  urlCount: number;
  lastmodChecked: number;
  imagesChecked: number;
  errors: string[];
  duplicates: {
    field: string;
    value: string;
    count: number;
    indexes: string[];
  }[];
  fatal?: { code: string; message: string; line?: number; col?: number };
}

function validateXml(label: string, xml: string): FeedReport {
  const report: FeedReport = {
    label,
    ok: false,
    urlCount: 0,
    lastmodChecked: 0,
    imagesChecked: 0,
    errors: [],
    duplicates: [],
  };
  const push = (msg: string) => report.errors.push(msg);

  // 1) Strict well-formedness.
  const check = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (check !== true) {
    const { code, msg, line, col } = check.err;
    report.fatal = { code, message: msg, line, col };
    report.errors.push(`malformed XML [${code}] at ${line}:${col} — ${msg}`);
    return report;
  }

  // 2) Structural sanity.
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === "url" || name === "image:image",
  });
  const doc = parser.parse(xml) as {
    urlset?: { "@_xmlns"?: string; url?: UrlEntry[] };
  };
  const urlset = doc.urlset;
  if (!urlset) {
    report.fatal = { code: "NO_URLSET", message: "missing <urlset> root element" };
    report.errors.push("missing <urlset> root element");
    return report;
  }
  if (urlset["@_xmlns"] !== "http://www.sitemaps.org/schemas/sitemap/0.9") {
    report.fatal = { code: "BAD_XMLNS", message: "<urlset> xmlns is not the sitemap 0.9 schema" };
    report.errors.push("<urlset> xmlns is not the sitemap 0.9 schema");
    return report;
  }
  const urls = urlset.url ?? [];
  report.urlCount = urls.length;
  if (urls.length === 0) {
    report.fatal = { code: "EMPTY", message: "zero <url> entries" };
    report.errors.push("zero <url> entries");
    return report;
  }

  const locIndexes = new Map<string, number[]>();
  const imageLocIndexes = new Map<string, string[]>();

  urls.forEach((u, i) => {
    const at = `<url> #${i}`;

    if (!u.loc || typeof u.loc !== "string" || u.loc.trim() === "") {
      push(`${at} has no <loc>`);
    } else if (!isValidAbsoluteHttpsUrl(u.loc)) {
      push(`${at} <loc> is not a valid absolute URL: "${u.loc}"`);
    } else {
      const key = u.loc.trim();
      const list = locIndexes.get(key) ?? [];
      list.push(i);
      locIndexes.set(key, list);
    }

    if ("lastmod" in u && u.lastmod !== undefined) {
      report.lastmodChecked++;
      if (typeof u.lastmod !== "string" || u.lastmod.trim() === "") {
        push(`${at} has empty <lastmod>`);
      } else if (!isValidLastmod(u.lastmod)) {
        push(`${at} <lastmod>="${u.lastmod}" is not W3C Datetime`);
      }
    }

    if ("changefreq" in u && u.changefreq !== undefined) {
      if (typeof u.changefreq !== "string" || !VALID_CHANGEFREQ.has(u.changefreq)) {
        push(`${at} invalid <changefreq>="${u.changefreq}"`);
      }
    }

    if ("priority" in u && u.priority !== undefined) {
      const n = typeof u.priority === "number" ? u.priority : Number(u.priority);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        push(`${at} <priority>="${u.priority}" must be in [0.0, 1.0]`);
      }
    }

    const imgs = u["image:image"];
    if (imgs !== undefined) {
      const arr = Array.isArray(imgs) ? imgs : [imgs];
      arr.forEach((img, j) => {
        report.imagesChecked++;
        const iat = `${at} <image:image> #${j}`;
        if (!img || typeof img !== "object") {
          push(`${iat} is empty`);
          return;
        }
        const iloc = img["image:loc"];
        if (iloc === undefined || iloc === null || iloc === "") {
          push(`${iat} missing <image:loc>`);
        } else if (!isValidAbsoluteHttpsUrl(iloc)) {
          push(`${iat} <image:loc>="${iloc}" is not a valid absolute URL`);
        } else {
          const list = imageLocIndexes.get(iloc) ?? [];
          list.push(`${i}.${j}`);
          imageLocIndexes.set(iloc, list);
        }
      });
    }
  });

  const collectDupes = <T>(map: Map<string, T[]>, field: string) => {
    const dupes = [...map.entries()]
      .filter(([, idxs]) => idxs.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    for (const [value, idxs] of dupes) {
      report.duplicates.push({
        field,
        value,
        count: idxs.length,
        indexes: idxs.map(String),
      });
      push(`duplicate ${field} "${value}" appears ${idxs.length}× at [${idxs.join(", ")}]`);
    }
  };
  collectDupes(locIndexes, "<loc>");
  collectDupes(imageLocIndexes, "<image:loc>");

  report.ok = report.errors.length === 0;
  return report;
}

async function main() {
  console.log("🔎 Validating generated sitemap XML feeds…");
  const [sitemap, bing] = await Promise.all([
    import("../src/routes/sitemap[.]xml.ts") as Promise<RouteMod>,
    import("../src/routes/bing-feed[.]xml.ts") as Promise<RouteMod>,
  ]);
  const reports: FeedReport[] = [];
  for (const [mod, label] of [
    [sitemap, "/sitemap.xml"] as const,
    [bing, "/bing-feed.xml"] as const,
  ]) {
    try {
      const xml = await invokeGet(mod, label);
      reports.push(validateXml(label, xml));
    } catch (e) {
      reports.push({
        label,
        ok: false,
        urlCount: 0,
        lastmodChecked: 0,
        imagesChecked: 0,
        errors: [e instanceof Error ? e.message : String(e)],
        duplicates: [],
        fatal: { code: "HANDLER_FAILURE", message: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  for (const r of reports) {
    if (r.ok) {
      console.log(
        `  ✓ ${r.label}: well-formed, ${r.urlCount} <url> (lastmod:${r.lastmodChecked}, image:${r.imagesChecked})`,
      );
    } else {
      console.log(`  ✗ ${r.label}: ${r.errors.length} error(s)`);
      for (const e of r.errors) console.log(`     ${e}`);
    }
  }

  const summary = {
    tool: "check-sitemap-xml",
    generatedAt: new Date().toISOString(),
    ok: reports.every((r) => r.ok),
    totalErrors: reports.reduce((n, r) => n + r.errors.length, 0),
    feeds: reports,
  };

  const jsonOut = process.env.REPORT_JSON;
  if (jsonOut) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
    console.log(`📄 JSON report written to ${jsonOut}`);
  }

  if (!summary.ok) {
    console.error("❌ Sitemap XML validation failed.");
    process.exit(1);
  }
  console.log("✅ Both feeds are well-formed XML.");
}

main().catch((err) => {
  console.error("❌ Sitemap XML validation crashed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

