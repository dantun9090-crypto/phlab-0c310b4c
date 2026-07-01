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

function validateXml(label: string, xml: string): void {
  const errors: string[] = [];
  const push = (msg: string) => errors.push(`${label}: ${msg}`);

  // 1) Strict well-formedness — tags balanced, attrs quoted, no stray chars.
  const check = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (check !== true) {
    const { code, msg, line, col } = check.err;
    throw new Error(`${label}: malformed XML [${code}] at ${line}:${col} — ${msg}`);
  }

  // 2) Structural sanity — must be a sitemap urlset with >= 1 <url><loc>.
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === "url" || name === "image:image",
  });
  const doc = parser.parse(xml) as {
    urlset?: {
      "@_xmlns"?: string;
      url?: UrlEntry[];
    };
  };
  const urlset = doc.urlset;
  if (!urlset) throw new Error(`${label}: missing <urlset> root element`);
  if (urlset["@_xmlns"] !== "http://www.sitemaps.org/schemas/sitemap/0.9") {
    throw new Error(`${label}: <urlset> xmlns is not the sitemap 0.9 schema`);
  }
  const urls = urlset.url ?? [];
  if (urls.length === 0) throw new Error(`${label}: zero <url> entries`);

  // 3) Per-entry field assertions.
  let imagesChecked = 0;
  let lastmodChecked = 0;
  const locIndexes = new Map<string, number[]>();
  const imageLocIndexes = new Map<string, string[]>();
  const lastmodIndexes = new Map<string, number[]>();

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
      lastmodChecked++;
      if (typeof u.lastmod !== "string" || u.lastmod.trim() === "") {
        push(`${at} has empty <lastmod>`);
      } else if (!isValidLastmod(u.lastmod)) {
        push(
          `${at} <lastmod>="${u.lastmod}" is not W3C Datetime (YYYY-MM-DD or full ISO-8601)`,
        );
      } else {
        const list = lastmodIndexes.get(u.lastmod) ?? [];
        list.push(i);
        lastmodIndexes.set(u.lastmod, list);
      }
    }

    if ("changefreq" in u && u.changefreq !== undefined) {
      if (typeof u.changefreq !== "string" || !VALID_CHANGEFREQ.has(u.changefreq)) {
        push(
          `${at} invalid <changefreq>="${u.changefreq}" (allowed: ${[...VALID_CHANGEFREQ].join(", ")})`,
        );
      }
    }

    if ("priority" in u && u.priority !== undefined) {
      const n =
        typeof u.priority === "number" ? u.priority : Number(u.priority);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        push(`${at} <priority>="${u.priority}" must be a number in [0.0, 1.0]`);
      }
    }

    const imgs = u["image:image"];
    if (imgs !== undefined) {
      const arr = Array.isArray(imgs) ? imgs : [imgs];
      arr.forEach((img, j) => {
        imagesChecked++;
        const iat = `${at} <image:image> #${j}`;
        if (!img || typeof img !== "object") {
          push(`${iat} is empty (no child elements)`);
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

  // 4) Duplicate detection — no value may repeat within the same feed.
  //    Each duplicate group is reported with the 0-based <url> indexes
  //    (and image sub-indexes as "urlIdx.imageIdx") of every occurrence
  //    so the offending generator call sites are trivial to locate.
  const reportDupes = <T>(
    map: Map<string, T[]>,
    field: string,
    fmt: (idxs: T[]) => string,
  ) => {
    const dupes = [...map.entries()]
      .filter(([, idxs]) => idxs.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    for (const [value, idxs] of dupes) {
      push(
        `duplicate ${field} "${value}" appears ${idxs.length}× at ${fmt(idxs)}`,
      );
    }
  };
  reportDupes(locIndexes, "<loc>", (idxs) => `<url> indexes [${idxs.join(", ")}]`);
  reportDupes(
    imageLocIndexes,
    "<image:loc>",
    (idxs) => `<url>.<image:image> indexes [${idxs.join(", ")}]`,
  );
  reportDupes(
    lastmodIndexes,
    "<lastmod>",
    (idxs) => `<url> indexes [${idxs.join(", ")}]`,
  );


  if (errors.length > 0) {
    const lines = ["", ...errors.map((e) => `  ✗ ${e}`)].join("\n");
    throw new Error(
      `${label}: ${errors.length} metadata assertion(s) failed:${lines}`,
    );
  }

  console.log(
    `  ✓ ${label}: well-formed, ${urls.length} <url> (lastmod:${lastmodChecked}, image:${imagesChecked})`,
  );
}

async function main() {
  console.log("🔎 Validating generated sitemap XML feeds…");
  const [sitemap, bing] = await Promise.all([
    import("../src/routes/sitemap[.]xml.ts") as Promise<RouteMod>,
    import("../src/routes/bing-feed[.]xml.ts") as Promise<RouteMod>,
  ]);
  const [sitemapXml, bingXml] = await Promise.all([
    invokeGet(sitemap, "/sitemap.xml"),
    invokeGet(bing, "/bing-feed.xml"),
  ]);
  validateXml("/sitemap.xml", sitemapXml);
  validateXml("/bing-feed.xml", bingXml);
  console.log("✅ Both feeds are well-formed XML.");
}

main().catch((err) => {
  console.error("❌ Sitemap XML validation failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
