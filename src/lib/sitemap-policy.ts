/**
 * Shared sitemap inclusion policy.
 *
 * Single source of truth for: "what URLs are allowed in the sitemap".
 * Used by:
 *   - src/routes/sitemap[.]xml.ts           (filters generated entries)
 *   - src/lib/sitemap-audit.functions.ts    (admin audit server fn)
 *   - tests/sitemap-validation.test.ts      (CI test)
 *
 * Rules:
 *   1. Anything blocked by robots.txt (User-agent: *) MUST be excluded.
 *   2. Transactional / non-public endpoints MUST be excluded even if robots
 *      doesn't block them (cart, checkout, payment flow callbacks, feeds,
 *      splat catch-alls).
 *   3. Anything else is fair game.
 */

// Import the project's robots.txt as a string at build time so the worker
// doesn't need filesystem access. Updating public/robots.txt automatically
// updates the sitemap filter — no drift possible.
import ROBOTS_TXT_RAW from "../../public/robots.txt?raw";

/** Patterns we never want indexed, even if robots.txt forgets to block them. */
export const TRANSACTIONAL_PREFIXES = [
  "/cart",
  "/checkout",
  "/payment",            // /payment/success, /payment/cancel
  "/account",
  "/login",
  "/register",
  "/admin",
  "/api",
  "/webhook",
  "/server-functions",
  "/lovable",
  "/vip-store",
] as const;

/** Suffixes that identify machine-readable feeds / non-HTML endpoints. */
export const NON_INDEXABLE_SUFFIXES = [
  ".xml",                // sitemap, merchant feed
  ".json",
  ".txt",                // robots.txt, security.txt
] as const;

/** Routes that look real to the route tree but must never ship in a sitemap. */
export const NEVER_INDEX_EXACT = new Set<string>([
  "/$",                  // TanStack splat catch-all
  "/not-found",
  "/search",
]);

export interface RobotsRule {
  /** Disallow pattern as written in robots.txt (e.g. "/admin/", "/*?utm_*"). */
  pattern: string;
  /** Source line for debugging. */
  raw: string;
}

/**
 * Parse the `User-agent: *` block out of a robots.txt body and return its
 * Disallow patterns. We deliberately ignore other UA blocks (AdsBot etc.) —
 * the generic block is what governs organic search.
 */
export function parseRobotsDisallows(robotsTxt: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let inStarBlock = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      inStarBlock = value === "*";
      continue;
    }
    if (inStarBlock && key === "disallow" && value) {
      rules.push({ pattern: value, raw: rawLine });
    }
  }
  return rules;
}

/**
 * Match a path (e.g. "/admin/foo") against a single robots Disallow pattern.
 * Supports the two wildcards Google understands:
 *   - `*`  any character sequence
 *   - `$`  end-of-URL anchor (only at the end of the pattern)
 *
 * Patterns without wildcards are treated as prefix matches per the spec.
 */
export function matchesRobotsPattern(path: string, pattern: string): boolean {
  if (!pattern) return false;
  if (!pattern.includes("*") && !pattern.endsWith("$")) {
    return path.startsWith(pattern);
  }
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    "^" +
      body
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      (anchored ? "$" : ""),
  );
  return re.test(path);
}

const COMPILED_ROBOTS_RULES = parseRobotsDisallows(ROBOTS_TXT_RAW);

export interface ExclusionReason {
  /** "transactional" | "robots" | "feed" | "splat" | "never_index" */
  kind: "transactional" | "robots" | "feed" | "splat" | "never_index";
  detail: string;
}

/**
 * Returns the reason `path` should be excluded from the sitemap, or null if
 * it's safe to include. Path must be a root-relative URL ("/products/foo").
 */
export function exclusionReason(path: string): ExclusionReason | null {
  if (!path.startsWith("/")) {
    return { kind: "never_index", detail: "non-absolute path" };
  }
  if (NEVER_INDEX_EXACT.has(path)) {
    return { kind: "splat", detail: `exact-match exclusion (${path})` };
  }
  for (const suffix of NON_INDEXABLE_SUFFIXES) {
    if (path.endsWith(suffix)) {
      return { kind: "feed", detail: `non-HTML endpoint (${suffix})` };
    }
  }
  for (const prefix of TRANSACTIONAL_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      return { kind: "transactional", detail: `matches prefix ${prefix}` };
    }
  }
  for (const rule of COMPILED_ROBOTS_RULES) {
    if (matchesRobotsPattern(path, rule.pattern)) {
      return { kind: "robots", detail: `robots.txt Disallow ${rule.pattern}` };
    }
  }
  return null;
}

/** Convenience inverse of {@link exclusionReason}. */
export function isIndexable(path: string): boolean {
  return exclusionReason(path) === null;
}

/** Exported for the audit tab so the UI can render the rule set. */
export const RAW_ROBOTS_TXT = ROBOTS_TXT_RAW;
export const ROBOTS_RULES = COMPILED_ROBOTS_RULES;
