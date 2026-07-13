#!/usr/bin/env python3
"""Guard against Cloudflare HTML edge-cache rules for / and /products.

Fails (exit 1) if any enabled cache rule in the phlabs.co.uk zone matches
`/` or `/products` and sets a positive edge TTL (e.g. the historical
"HTML edge cache — 4h TTL" rule at 14400s). Writes a Markdown report to
$GITHUB_STEP_SUMMARY.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
import urllib.error

ZONE = os.environ.get("CF_ZONE_ID") or ""
TOKEN = os.environ.get("CF_API_TOKEN") or ""
SUMMARY = os.environ.get("GITHUB_STEP_SUMMARY") or "/dev/stderr"

if not ZONE or not TOKEN:
    print("::error::CF_ZONE_ID or CF_API_TOKEN missing", file=sys.stderr)
    sys.exit(2)

HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
BASE = f"https://api.cloudflare.com/client/v4/zones/{ZONE}"

# Paths this guard protects. Match Cloudflare rule expressions like:
#   http.request.uri.path eq "/"
#   http.request.uri.path eq "/products"
#   starts_with(http.request.uri.path, "/products")
PROTECTED = ["/", "/products"]

# Any TTL >0 seconds on a protected path is a violation. We also flag the
# historical 4h value explicitly for readability.
POSITIVE_TTL_RE = re.compile(r'"(?:edge_ttl|browser_ttl)"\s*:\s*\{[^}]*"default"\s*:\s*([1-9]\d*)')
CACHE_TTL_BY_STATUS_RE = re.compile(r'"cache_ttl_by_status"[^}]*:\s*\{[^}]*"[^"]+"\s*:\s*([1-9]\d*)')


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.load(res)


def rule_matches_protected(expression: str) -> list[str]:
    """Return which protected paths a rule expression targets."""
    if not expression:
        return []
    hits = []
    expr = expression.lower()
    for p in PROTECTED:
        needle_eq = f'http.request.uri.path eq "{p}"'
        needle_prefix = f'starts_with(http.request.uri.path, "{p}"'
        if needle_eq in expr or needle_prefix in expr:
            hits.append(p)
        # Also catch `in {"/", "/products"}` style
        if f'"{p}"' in expr and "http.request.uri.path in" in expr:
            if p not in hits:
                hits.append(p)
    return hits


def rule_has_positive_ttl(params: dict) -> tuple[bool, str]:
    """True if the rule actively caches HTML with a positive TTL."""
    if params.get("cache") is not True:
        return (False, "")
    blob = json.dumps(params)
    ttls: list[int] = []
    for m in POSITIVE_TTL_RE.finditer(blob):
        ttls.append(int(m.group(1)))
    for m in CACHE_TTL_BY_STATUS_RE.finditer(blob):
        ttls.append(int(m.group(1)))
    if ttls:
        return (True, f"ttl={max(ttls)}s")
    # Stale-while-updating enabled on a cache rule = still a violation.
    if '"disable_stale_while_updating": false' in blob:
        return (True, "stale-while-updating enabled")
    return (False, "")


def main() -> int:
    try:
        rulesets = get_json(f"{BASE}/rulesets").get("result") or []
    except urllib.error.HTTPError as e:
        print(f"::error::Cloudflare API error: {e}", file=sys.stderr)
        return 2

    offenders: list[dict] = []
    scanned = 0

    for rs in rulesets:
        if rs.get("phase") != "http_request_cache_settings":
            continue
        try:
            detail = (get_json(f"{BASE}/rulesets/{rs['id']}") or {}).get("result") or {}
        except urllib.error.HTTPError as e:
            print(f"::warning::Could not fetch ruleset {rs.get('id')}: {e}", file=sys.stderr)
            continue
        for rule in detail.get("rules") or []:
            scanned += 1
            if rule.get("enabled") is False:
                continue
            paths = rule_matches_protected(rule.get("expression") or "")
            if not paths:
                continue
            positive, why = rule_has_positive_ttl(rule.get("action_parameters") or {})
            if not positive:
                continue
            offenders.append({
                "ruleset": detail.get("name") or rs.get("name"),
                "rule": rule.get("description") or rule.get("id"),
                "paths": paths,
                "reason": why,
                "expression": rule.get("expression"),
            })

    # Report
    lines = ["## 🚨 Cloudflare HTML Edge-Cache Guard", ""]
    lines.append(f"Scanned **{scanned}** cache rules in phase `http_request_cache_settings` on zone `{ZONE[:8]}…`.")
    lines.append("")
    lines.append("Protected paths (must never be edge-cached with positive TTL): " + ", ".join(f"`{p}`" for p in PROTECTED))
    lines.append("")
    if not offenders:
        lines.append("✅ No re-enabled HTML edge-cache rules found for `/` or `/products`.")
        exit_code = 0
    else:
        lines.append(f"❌ **{len(offenders)} offending rule(s) detected** — HTML edge cache has been re-enabled.")
        lines.append("")
        lines.append("| Ruleset | Rule | Paths | Reason | Expression |")
        lines.append("| --- | --- | --- | --- | --- |")
        for o in offenders:
            expr = (o["expression"] or "").replace("|", "\\|")
            if len(expr) > 120:
                expr = expr[:117] + "…"
            lines.append(
                f"| {o['ruleset']} | {o['rule']} | {', '.join('`'+p+'`' for p in o['paths'])} | "
                f"{o['reason']} | `{expr}` |"
            )
        lines.append("")
        lines.append("**Action:** disable or delete the rule in the Cloudflare dashboard → Caching → Cache Rules. "
                     "Public HTML shells must stay `no-store` — the origin worker sets the correct headers already.")
        exit_code = 1

    report = "\n".join(lines) + "\n"
    with open(SUMMARY, "a", encoding="utf-8") as fh:
        fh.write(report)
    print(report)

    for o in offenders:
        print(f"::error title=Cloudflare HTML edge cache re-enabled::{o['ruleset']} / {o['rule']} on {','.join(o['paths'])} ({o['reason']})")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
