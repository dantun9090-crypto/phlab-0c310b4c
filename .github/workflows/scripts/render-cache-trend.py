#!/usr/bin/env python3
"""Render a readable multi-deploy trend report for cache audits.

Aggregates the current `audit-cache-headers.json` plus any prior JSON reports
found under ./history/**/audit-cache-headers.json (downloaded by the workflow),
sorts them chronologically, and writes to $GITHUB_STEP_SUMMARY:

  1. A per-route markdown table of the last N deploys (status, cache-control,
     cf-cache-status, x-build-id, ok flag).
  2. A Mermaid xychart-beta showing HIT vs MISS/BYPASS/DYNAMIC counts per
     deploy, so regressions where the edge starts serving HIT jump out.

Usage:
  render-cache-trend.py <current.json> [history_dir]

The script never fails the job — trend rendering is purely informational.
"""
from __future__ import annotations

import glob
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

MAX_DEPLOYS = 10
ROUTES = ("/", "/products")
GOOD_STATUSES = {"DYNAMIC", "BYPASS", "MISS", "EXPIRED", "NONE", "UNKNOWN", ""}


def load(path: str) -> dict | None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return None
        data.setdefault("_path", path)
        return data
    except Exception:
        return None


def timestamp(report: dict) -> str:
    return (
        report.get("generated_at")
        or report.get("timestamp")
        or datetime.fromtimestamp(
            os.path.getmtime(report["_path"]), tz=timezone.utc
        ).isoformat()
    )


def short_ts(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%m-%d %H:%M")
    except Exception:
        return iso[:16]


def route_entry(report: dict, route: str) -> dict:
    routes = report.get("routes") or report.get("results") or []
    if isinstance(routes, dict):
        return routes.get(route) or {}
    for r in routes:
        if isinstance(r, dict) and (r.get("path") == route or r.get("route") == route or r.get("url", "").endswith(route)):
            return r
    return {}


def status_icon(entry: dict) -> str:
    cf = (entry.get("cf_cache_status") or entry.get("cf-cache-status") or "").upper()
    ok = entry.get("ok")
    if ok is False:
        return "❌"
    if cf and cf not in GOOD_STATUSES:
        return "⚠️"
    return "✅"


def render_table(deploys: list[dict], route: str, out) -> None:
    out.write(f"\n#### Route `{route}`\n\n")
    out.write("| When | Status | HTTP | cache-control | cf-cache-status | x-build-id |\n")
    out.write("|---|---|---|---|---|---|\n")
    for d in deploys:
        e = route_entry(d, route)
        cc = (e.get("cache_control") or e.get("cache-control") or "—").replace("|", "\\|")
        cf = (e.get("cf_cache_status") or e.get("cf-cache-status") or "—").upper()
        http = e.get("http") or e.get("status") or "—"
        bid = (e.get("x_build_id") or e.get("x-build-id") or "—")[:12]
        out.write(
            f"| {short_ts(timestamp(d))} | {status_icon(e)} | {http} | `{cc}` | `{cf}` | `{bid}` |\n"
        )


def render_chart(deploys: list[dict], out) -> None:
    """Mermaid xychart-beta: HIT count vs safe (MISS/BYPASS/DYNAMIC) count per deploy.

    HIT > 0 across / and /products means CF started caching HTML — regression.
    """
    labels: list[str] = []
    hit_series: list[int] = []
    safe_series: list[int] = []
    for d in deploys:
        labels.append(short_ts(timestamp(d)))
        hit = 0
        safe = 0
        for r in ROUTES:
            cf = (route_entry(d, r).get("cf_cache_status") or route_entry(d, r).get("cf-cache-status") or "").upper()
            if cf in {"HIT", "STALE", "REVALIDATED", "UPDATING"}:
                hit += 1
            elif cf in GOOD_STATUSES and cf:
                safe += 1
        hit_series.append(hit)
        safe_series.append(safe)

    if not labels:
        return

    y_max = max(max(hit_series + safe_series), len(ROUTES))
    out.write("\n#### Trend — HIT vs safe (MISS/BYPASS/DYNAMIC) across last deploys\n\n")
    out.write("```mermaid\n")
    out.write("xychart-beta\n")
    out.write('  title "Cache status per deploy (lower HIT = better)"\n')
    out.write(f"  x-axis [{', '.join(f'\"{l}\"' for l in labels)}]\n")
    out.write(f"  y-axis \"routes\" 0 --> {y_max}\n")
    out.write(f"  bar {hit_series}\n")
    out.write(f"  line {safe_series}\n")
    out.write("```\n")
    out.write("_Bars = HIT/STALE (bad for HTML). Line = safe statuses (expected)._\n")


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: render-cache-trend.py <current.json> [history_dir]", file=sys.stderr)
        return 0

    current = load(sys.argv[1])
    history_dir = sys.argv[2] if len(sys.argv) > 2 else "./history"

    reports: list[dict] = []
    for p in glob.glob(f"{history_dir}/**/audit-cache-headers.json", recursive=True):
        r = load(p)
        if r:
            reports.append(r)
    if current:
        reports.append(current)

    # De-dupe by (timestamp, build id), then sort chronologically.
    seen = set()
    unique: list[dict] = []
    for r in reports:
        key = (timestamp(r), json.dumps(route_entry(r, "/").get("x_build_id") or ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)
    unique.sort(key=timestamp)
    deploys = unique[-MAX_DEPLOYS:]

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return 0

    with open(summary_path, "a", encoding="utf-8") as out:
        out.write("\n## 📊 Cache-header trend across recent deploys\n")
        out.write(f"_Showing last {len(deploys)} of {len(unique)} deploys._\n")
        render_chart(deploys, out)
        for route in ROUTES:
            render_table(deploys, route, out)
        out.write("\n<sub>Generated by `render-cache-trend.py`. HIT/STALE on HTML = regression.</sub>\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
