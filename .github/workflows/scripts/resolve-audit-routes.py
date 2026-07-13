#!/usr/bin/env python3
"""Resolve the list of routes to audit.

Precedence (highest first):
  1. $AUDIT_ROUTES  — newline/comma-separated list of paths (workflow_dispatch input).
  2. $AUDIT_ROUTES_FILE / default `.github/cache-audit.routes.json`
     — JSON `{ "routes": [...], "slugs": { "<name>": [...] } }`.
  3. Fallback defaults: /, /products.

`:name` placeholders in routes are expanded against `slugs[name]` from the
config file (Cartesian product per route). Every resolved path is validated
(must start with '/', no spaces, no unresolved ':' segments). Prints one path
per line to stdout for easy consumption by bash.
"""
from __future__ import annotations

import itertools
import json
import os
import re
import sys
from pathlib import Path

DEFAULTS = ["/", "/products"]
PLACEHOLDER = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)")


def parse_inline(raw: str) -> list[str]:
    parts = re.split(r"[\n,]+", raw)
    return [p.strip() for p in parts if p.strip()]


def load_config(path: str) -> tuple[list[str], dict[str, list[str]]]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [], {}
    except Exception as e:
        print(f"::warning::Could not parse {path}: {e}", file=sys.stderr)
        return [], {}
    routes = [r for r in data.get("routes", []) if isinstance(r, str)]
    slugs = {
        k: [str(v) for v in vs]
        for k, vs in (data.get("slugs") or {}).items()
        if isinstance(vs, list)
    }
    return routes, slugs


def expand(route: str, slugs: dict[str, list[str]]) -> list[str]:
    names = PLACEHOLDER.findall(route)
    if not names:
        return [route]
    choices = []
    for n in names:
        vals = slugs.get(n)
        if not vals:
            print(f"::warning::No sample values for ':{n}' — skipping route {route}", file=sys.stderr)
            return []
        choices.append([(n, v) for v in vals])
    out = []
    for combo in itertools.product(*choices):
        r = route
        for n, v in combo:
            r = r.replace(f":{n}", v)
        out.append(r)
    return out


def validate(path: str) -> bool:
    if not path.startswith("/"):
        print(f"::warning::Ignoring '{path}' — must start with '/'", file=sys.stderr)
        return False
    if " " in path or "\t" in path:
        print(f"::warning::Ignoring '{path}' — contains whitespace", file=sys.stderr)
        return False
    if PLACEHOLDER.search(path):
        print(f"::warning::Ignoring '{path}' — unresolved placeholder", file=sys.stderr)
        return False
    return True


def main() -> int:
    inline = os.environ.get("AUDIT_ROUTES", "").strip()
    config_path = os.environ.get(
        "AUDIT_ROUTES_FILE", ".github/cache-audit.routes.json"
    )

    cfg_routes, slugs = load_config(config_path)

    if inline:
        raw_routes = parse_inline(inline)
        source = "workflow input"
    elif cfg_routes:
        raw_routes = cfg_routes
        source = config_path
    else:
        raw_routes = DEFAULTS
        source = "built-in defaults"

    resolved: list[str] = []
    seen: set[str] = set()
    for r in raw_routes:
        for exp in expand(r, slugs):
            if validate(exp) and exp not in seen:
                seen.add(exp)
                resolved.append(exp)

    if not resolved:
        print("::error::No valid routes resolved for cache audit", file=sys.stderr)
        return 2

    print(f"::notice::Auditing {len(resolved)} route(s) from {source}", file=sys.stderr)
    for r in resolved:
        print(r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
