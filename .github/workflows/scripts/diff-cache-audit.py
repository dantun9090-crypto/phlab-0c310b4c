#!/usr/bin/env python3
"""Diff two cache-audit reports and emit a readable CI report.

Usage:
    diff-cache-audit.py <previous.json> <current.json>

- Reads two JSON reports produced by audit-cache-headers.sh (schema v1).
- Compares `cache-control`, `cdn-cache-control`, `cf-cache-status`, `http`,
  `buildId`, `ok` per route.
- Writes a Markdown diff report to $GITHUB_STEP_SUMMARY (or stdout).
- Exit code:
    0 → no relevant deltas (or previous report missing → informational)
    1 → at least one contract-relevant regression detected
"""
from __future__ import annotations
import json, os, sys
from typing import Any

SUMMARY = os.environ.get("GITHUB_STEP_SUMMARY") or "/dev/stdout"

# Fields we watch and their severity. If a delta appears on a "regression"
# field AND the new value fails the no-store / allowlist contract, we fail.
WATCH_FIELDS = ["cc", "cdncc", "cf", "http", "buildId", "ok"]
ALLOWED_CF = {"DYNAMIC", "BYPASS", "MISS", "EXPIRED", "", "NONE", "UNKNOWN"}


def load(path: str) -> dict[str, Any] | None:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def index_routes(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {r["path"]: r for r in report.get("routes", [])}


def is_regression(field: str, prev: Any, curr: Any) -> bool:
    """A change is a regression when the *new* value violates the contract,
    regardless of whether the old value was already broken."""
    if field == "cc" or field == "cdncc":
        return "no-store" not in (curr or "").lower()
    if field == "cf":
        return (curr or "").upper() not in ALLOWED_CF
    if field == "http":
        return int(curr or 0) != 200
    if field == "ok":
        return curr is False
    return False  # buildId change is informational


def fmt(v: Any) -> str:
    if v is None or v == "":
        return "—"
    return f"`{v}`"


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: diff-cache-audit.py <previous.json> <current.json>", file=sys.stderr)
        return 2

    prev_path, curr_path = sys.argv[1], sys.argv[2]
    curr = load(curr_path)
    if not curr:
        print(f"::error::current report not found or invalid: {curr_path}", file=sys.stderr)
        return 2
    prev = load(prev_path)

    lines: list[str] = []
    lines.append("## 🔀 Cache-Audit Diff vs Previous Deploy")
    lines.append("")
    if not prev:
        lines.append(f"_No previous report found ({prev_path}). Baseline established from this run — future diffs will compare against it._")
        lines.append("")
        _write(lines)
        return 0

    prev_meta = f"commit `{(prev.get('commit') or '')[:8] or '?'}` at {prev.get('ranAt', '?')}"
    curr_meta = f"commit `{(curr.get('commit') or '')[:8] or '?'}` at {curr.get('ranAt', '?')}"
    lines.append(f"**Previous:** {prev_meta}  →  **Current:** {curr_meta}")
    lines.append("")

    prev_idx, curr_idx = index_routes(prev), index_routes(curr)
    all_paths = sorted(set(prev_idx) | set(curr_idx))

    diff_rows: list[str] = []
    regressions: list[str] = []
    stable: list[str] = []

    for p in all_paths:
        pr, cr = prev_idx.get(p), curr_idx.get(p)
        if pr and not cr:
            diff_rows.append(f"| `{p}` | ⚠️ removed | previous had `{pr.get('cf','')}` — route no longer audited |")
            continue
        if cr and not pr:
            diff_rows.append(f"| `{p}` | 🆕 new | not present in previous audit — baseline set |")
            continue
        assert pr and cr
        route_deltas: list[str] = []
        for f in WATCH_FIELDS:
            pv, cv = pr.get(f), cr.get(f)
            if pv == cv:
                continue
            marker = "❌" if is_regression(f, pv, cv) else "🔎"
            route_deltas.append(f"{marker} **{f}**: {fmt(pv)} → {fmt(cv)}")
            if marker == "❌":
                regressions.append(f"{p} · {f}: {pv!r} → {cv!r}")
        if route_deltas:
            diff_rows.append(f"| `{p}` | changed | {'<br>'.join(route_deltas)} |")
        else:
            stable.append(p)

    if diff_rows:
        lines.append("| Route | State | Deltas |")
        lines.append("| --- | --- | --- |")
        lines.extend(diff_rows)
        lines.append("")
    if stable:
        lines.append(f"✅ Unchanged: {', '.join('`'+p+'`' for p in stable)}")
        lines.append("")

    if regressions:
        lines.append(f"### ❌ {len(regressions)} regression(s) detected")
        for r in regressions:
            lines.append(f"- {r}")
        lines.append("")
        lines.append("**Legend:** ❌ new value violates cache contract · 🔎 informational drift (e.g. build ID)")
        _write(lines)
        for r in regressions:
            print(f"::error title=Cache header regression::{r}")
        return 1

    lines.append("✅ No cache-contract regressions vs previous deploy.")
    lines.append("**Legend:** 🔎 informational drift (e.g. build ID rotation)")
    _write(lines)
    return 0


def _write(lines: list[str]) -> None:
    body = "\n".join(lines) + "\n"
    with open(SUMMARY, "a", encoding="utf-8") as fh:
        fh.write(body)
    print(body)


if __name__ == "__main__":
    sys.exit(main())
