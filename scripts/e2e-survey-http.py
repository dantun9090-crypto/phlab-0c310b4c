#!/usr/bin/env python3
"""End-to-end HTTP integration test for the source-survey server functions.

Drives a real Chromium browser against the running dev server (or any
TanStack Start build) and invokes ``submitSourceSurvey`` / ``skipSourceSurvey``
through their actual ``/_serverFn/<id>`` HTTP endpoints. Exercises the full
pipeline:

    network → Zod inputValidator → server handler → ownership guard

Every edge-case payload (no creds, empty / short / wrong paymentToken,
empty / short / forged idToken, malformed orderId, unknown source,
path-traversal orderId) MUST be rejected. Payloads that pass Zod MUST
fail with the generic ``Order not found`` message so an attacker cannot
distinguish "no such order" from "exists, wrong credentials".

Usage:

    # dev server must already be running on http://localhost:8080
    python3 scripts/e2e-survey-http.py
    BASE_URL=https://phlabs.co.uk python3 scripts/e2e-survey-http.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any

from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

SUBMIT_TRIALS: list[dict[str, Any]] = [
    {"name": "submit:no-creds",           "args": {"orderId": "PHP-NOAUTH1", "source": "google_search", "otherText": None}},
    {"name": "submit:empty-paymentToken", "args": {"orderId": "PHP-NOAUTH2", "source": "google_search", "otherText": None, "paymentToken": ""}},
    {"name": "submit:short-paymentToken", "args": {"orderId": "PHP-NOAUTH3", "source": "google_search", "otherText": None, "paymentToken": "short"}},
    {"name": "submit:wrong-paymentToken", "args": {"orderId": "PHP-NOAUTH4", "source": "google_search", "otherText": None, "paymentToken": "x" * 48}},
    {"name": "submit:malformed-orderId",  "args": {"orderId": "ORDER-123",           "source": "google_search", "otherText": None, "paymentToken": "x" * 48}},
    {"name": "submit:pathtrav-orderId",   "args": {"orderId": "PHP-../etc/passwd",   "source": "google_search", "otherText": None, "paymentToken": "x" * 48}},
    {"name": "submit:empty-idToken",      "args": {"orderId": "PHP-NOAUTH5", "source": "google_search", "otherText": None, "idToken": ""}},
    {"name": "submit:short-idToken",      "args": {"orderId": "PHP-NOAUTH6", "source": "google_search", "otherText": None, "idToken": "abc"}},
    {"name": "submit:forged-idToken",     "args": {"orderId": "PHP-NOAUTH7", "source": "google_search", "otherText": None, "idToken": "a" * 64}},
    {"name": "submit:unknown-source",     "args": {"orderId": "PHP-NOAUTH8", "source": "phishing",       "otherText": None, "paymentToken": "x" * 48}},
]

SKIP_TRIALS: list[dict[str, Any]] = [
    {"name": "skip:no-creds",       "args": {"orderId": "PHP-SK1"}},
    {"name": "skip:empty-pt",       "args": {"orderId": "PHP-SK2", "paymentToken": ""}},
    {"name": "skip:wrong-pt",       "args": {"orderId": "PHP-SK3", "paymentToken": "x" * 48}},
    {"name": "skip:short-idToken",  "args": {"orderId": "PHP-SK4", "idToken": "abc"}},
    {"name": "skip:forged-idToken", "args": {"orderId": "PHP-SK5", "idToken": "a" * 64}},
    {"name": "skip:empty-idToken",  "args": {"orderId": "PHP-SK6", "idToken": ""}},
]


def classify(name: str, outcome: dict[str, Any]) -> tuple[bool, str]:
    """A passing trial is one that did NOT succeed and either:
      a) tripped the Zod boundary (request never reached the handler), or
      b) returned the generic "Order not found" message.
    Any other outcome leaks ownership state or grants access — fail.
    """
    if outcome.get("ok"):
        return False, "request succeeded (should have been rejected)"
    msg = str(outcome.get("msg") or "")
    is_zod = msg.startswith("[") and '"code"' in msg
    is_generic = msg == "Order not found" or "Order not found" in msg
    if is_zod:
        return True, "<zod boundary>"
    if is_generic:
        return True, "Order not found"
    return False, f"unexpected error: {msg[:200]}"


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900}, user_agent=UA)
        page = await ctx.new_page()

        print(f"[e2e] dev server: {BASE_URL}")
        await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")

        # The TanStack Start Vite plugin inlines `process.env.TSS_SERVER_FN_BASE`
        # into the bundled entry, but `.functions.ts` imported on-demand from
        # page.evaluate is not run through that define-replacement pass. Polyfill
        # the variable with the default base so the client RPC stub can resolve
        # its target URL.
        await page.evaluate(
            "window.process = window.process || { env: { TSS_SERVER_FN_BASE: '/_serverFn/' } };"
        )

        result = await page.evaluate(
            """async ({ submitTrials, skipTrials }) => {
              const mod = await import('/src/lib/source-survey.functions.ts');
              const run = async (fn, trials) => {
                const out = [];
                for (const t of trials) {
                  try {
                    const r = await fn({ data: t.args });
                    out.push({ name: t.name, ok: true, r });
                  } catch (e) {
                    out.push({ name: t.name, ok: false, msg: String(e?.message || e) });
                  }
                }
                return out;
              };
              return {
                submit: await run(mod.submitSourceSurvey, submitTrials),
                skip:   await run(mod.skipSourceSurvey, skipTrials),
                submitUrl: mod.submitSourceSurvey.url,
                skipUrl:   mod.skipSourceSurvey.url,
              };
            }""",
            {"submitTrials": SUBMIT_TRIALS, "skipTrials": SKIP_TRIALS},
        )

        print(f"[e2e] endpoint submit: {result['submitUrl']}")
        print(f"[e2e] endpoint skip:   {result['skipUrl']}\n")

        passes = fails = 0
        for outcome in [*result["submit"], *result["skip"]]:
            ok, info = classify(outcome["name"], outcome)
            mark = "✓" if ok else "✗"
            print(f"  {mark} {outcome['name']:<32} {('rejected (' + info + ')') if ok else info}")
            passes += int(ok)
            fails += int(not ok)

        print(f"\n[e2e] {passes} passed, {fails} failed")
        await browser.close()
        return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
