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

function validateXml(label: string, xml: string): void {
  // 1) Strict well-formedness — tags balanced, attrs quoted, no stray chars.
  const check = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (check !== true) {
    const { code, msg, line, col } = check.err;
    throw new Error(`${label}: malformed XML [${code}] at ${line}:${col} — ${msg}`);
  }

  // 2) Structural sanity — must be a sitemap urlset with >= 1 <url><loc>.
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === "url",
  });
  const doc = parser.parse(xml) as {
    urlset?: {
      "@_xmlns"?: string;
      url?: Array<{ loc?: string }>;
    };
  };
  const urlset = doc.urlset;
  if (!urlset) throw new Error(`${label}: missing <urlset> root element`);
  if (urlset["@_xmlns"] !== "http://www.sitemaps.org/schemas/sitemap/0.9") {
    throw new Error(`${label}: <urlset> xmlns is not the sitemap 0.9 schema`);
  }
  const urls = urlset.url ?? [];
  if (urls.length === 0) throw new Error(`${label}: zero <url> entries`);
  const missingLoc = urls.findIndex((u) => !u.loc || typeof u.loc !== "string");
  if (missingLoc >= 0) {
    throw new Error(`${label}: <url> at index ${missingLoc} has no <loc>`);
  }
  console.log(`  ✓ ${label}: well-formed, ${urls.length} <url> entries`);
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
