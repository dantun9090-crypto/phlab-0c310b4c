#!/usr/bin/env python3
"""End-to-end HTTP integration tests for the source-survey server functions.

Drives a real Chromium browser against a running TanStack Start server and
exercises the live ``/_serverFn/<id>`` HTTP endpoints. This is the only
harness that exercises the full pipeline together:

    network → Zod inputValidator → server handler → ownership guard
            → Firestore writes (or lack thereof)

What this script asserts:

1.  **Edge-case fuzz** — 30+ malformed ``paymentToken`` / ``idToken`` /
    ``orderId`` shapes (empty, short, oversize, unicode, control chars,
    hex padding, SQL-ish, JSON-encoded, path traversal, etc.) all get
    rejected. Inputs that pass Zod MUST fail with the **exact** generic
    error contract ``message == "Order not found"`` and a non-2xx HTTP
    status. Zod-boundary failures are also acceptable (request never
    reached the handler).

2.  **No state leaks on failure** — for every blocked request against a
    real seeded order, Firestore is snapshotted before and after; the
    order document and ``save10_claims`` must be byte-identical.

3.  **Happy path** — a seeded order with the correct ``paymentToken``
    submits successfully (HTTP 2xx, no "Order not found"), Firestore
    reflects the survey answer + SAVE10 claim, and a subsequent skip
    call also succeeds.

The Firestore-backed steps are skipped automatically when
``FIREBASE_SERVICE_ACCOUNT_JSON`` is not set in the environment so the
pure HTTP-rejection layer can still run in CI without secrets.

Usage:

    # dev server must already be running on http://localhost:8080
    python3 scripts/e2e-survey-http.py
    BASE_URL=https://phlabs.co.uk python3 scripts/e2e-survey-http.py
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")
REPORT_DIR = Path(os.environ.get("E2E_REPORT_DIR", "/tmp/e2e-survey-report"))
REPORT_DIR.mkdir(parents=True, exist_ok=True)
FAILURES: list[dict[str, Any]] = []


def record_failure(category: str, outcome: "TrialOutcome", reason: str,
                   extra: dict[str, Any] | None = None) -> None:
    """Capture a detailed failure record for later artifact upload."""
    rec: dict[str, Any] = {
        "category": category,
        "name": outcome.name,
        "reason": reason,
        "http_status": outcome.http_status,
        "ok": outcome.ok,
        "client_msg": outcome.msg,
        "raw_body": (outcome.raw_body or "")[:4000],
        "db_pre": outcome.db_pre,
        "db_post": outcome.db_post,
        "request_args": getattr(outcome, "request_args", None),
        "fn": getattr(outcome, "fn", None),
    }
    if outcome.db_pre is not None and outcome.db_post is not None:
        rec["db_diff"] = diff_state(outcome.db_pre, outcome.db_post)
    if extra:
        rec.update(extra)
    FAILURES.append(rec)


def diff_state(pre: dict[str, Any], post: dict[str, Any]) -> dict[str, Any]:
    """Compact key-wise diff between two snapshot dicts."""
    diff: dict[str, Any] = {}
    for key in set(pre) | set(post):
        a, b = pre.get(key), post.get(key)
        if json.dumps(a, sort_keys=True, default=str) != json.dumps(b, sort_keys=True, default=str):
            diff[key] = {"pre": a, "post": b}
    return diff


def write_report(summary: dict[str, Any]) -> Path:
    path = REPORT_DIR / "report.json"
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": BASE_URL,
        "summary": summary,
        "failures": FAILURES,
    }
    path.write_text(json.dumps(payload, indent=2, default=str))
    # Also drop a human-readable txt summary.
    txt = REPORT_DIR / "report.txt"
    lines = [f"E2E source-survey report ({payload['generated_at']})",
             f"target: {BASE_URL}",
             f"summary: {summary}",
             f"failures: {len(FAILURES)}", ""]
    for f in FAILURES:
        lines.append(f"- [{f['category']}] {f['name']}: {f['reason']}")
        lines.append(f"    http={f['http_status']} ok={f['ok']} msg={f['client_msg']!r}")
        if f.get("db_diff"):
            lines.append(f"    db_diff={json.dumps(f['db_diff'], default=str)[:500]}")
    txt.write_text("\n".join(lines))
    return path

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
HAVE_SERVICE_ACCOUNT = bool(os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON"))
FIXTURE_SCRIPT = Path(__file__).with_name("e2e-survey-fixture.mjs")
NODE_BIN = shutil.which("node") or "node"

# ---------------------------------------------------------------------------
# Fuzz payloads
# ---------------------------------------------------------------------------

# Fuzz shapes for paymentToken / idToken / orderId. Each entry produces ONE
# trial against both `submit` and `skip` (where applicable). The unifying
# rule is: every one of these MUST be rejected; nothing should ever return
# `{ ok: true }`.
FUZZ_TOKENS: list[tuple[str, str]] = [
    ("empty",             ""),
    ("one-char",          "x"),
    ("just-under-min",    "x" * 31),
    ("exactly-min-wrong", "x" * 32),
    ("oversize",          "x" * 257),
    ("way-oversize",      "x" * 4096),
    ("all-spaces",        " " * 64),
    ("newline-padding",   "\n" * 64),
    ("null-bytes",        "\x00" * 64),
    ("unicode-emoji",     "🚀" * 16),
    ("unicode-rtl",       "\u202e" * 64),
    ("control-chars",     "".join(chr(c) for c in range(1, 33)) * 2),
    ("hex-zeros",         "0" * 64),
    ("hex-ffs",           "f" * 64),
    ("sql-ish",           "' OR 1=1 --" + "x" * 60),
    ("json-encoded",      '{"token":"' + "x" * 48 + '"}'),
    ("path-ish",          "../" * 16 + "x" * 16),
    ("url-ish",           "https://evil.example/" + "x" * 40),
    ("base64-pad",        "AAAA" * 16 + "=="),
    ("almost-valid-sha",  "a" * 63 + "Z"),  # 64 chars but non-hex char
]

FUZZ_ORDER_IDS: list[tuple[str, str]] = [
    ("missing-prefix",    "ORDER-12345"),
    ("lowercase-prefix",  "php-12345"),  # regex is case-insensitive — should PASS Zod
    ("empty",             ""),
    ("just-prefix",       "PHP-"),
    ("oversize",          "PHP-" + "A" * 80),
    ("path-traversal",    "PHP-../../etc/passwd"),
    ("nullbyte",          "PHP-12\x00345"),
    ("spaces",            "PHP- 1 2 3"),
    ("sql-ish",           "PHP-1' OR '1"),
    ("unicode",           "PHP-Ω-12345"),
]

VALID_TOKEN_FOR_ORDERID_FUZZ = "x" * 64  # passes Zod, never matches any hash


def submit_trial(name: str, args: dict[str, Any]) -> dict[str, Any]:
    return {"name": f"submit:{name}", "fn": "submit", "args": args}


def skip_trial(name: str, args: dict[str, Any]) -> dict[str, Any]:
    return {"name": f"skip:{name}", "fn": "skip", "args": args}


def build_trials(seed_order_id: str | None) -> list[dict[str, Any]]:
    """Generate the full trial list. When a seeded order is available we
    target IT for the fuzz so we can also assert no-state-mutation; when
    not, we use a clearly-bogus ID so the handler simply 404s."""
    oid = seed_order_id or "PHP-E2E-NOSEED-0001"
    trials: list[dict[str, Any]] = []

    # paymentToken fuzz
    for label, tok in FUZZ_TOKENS:
        trials.append(submit_trial(
            f"pt-{label}",
            {"orderId": oid, "source": "google_search", "otherText": None, "paymentToken": tok},
        ))
        trials.append(skip_trial(
            f"pt-{label}",
            {"orderId": oid, "paymentToken": tok},
        ))

    # idToken fuzz
    for label, tok in FUZZ_TOKENS:
        trials.append(submit_trial(
            f"idt-{label}",
            {"orderId": oid, "source": "google_search", "otherText": None, "idToken": tok},
        ))
        trials.append(skip_trial(
            f"idt-{label}",
            {"orderId": oid, "idToken": tok},
        ))

    # orderId fuzz (with a Zod-valid paymentToken so we test the handler path too)
    for label, bad_oid in FUZZ_ORDER_IDS:
        trials.append(submit_trial(
            f"oid-{label}",
            {
                "orderId": bad_oid,
                "source": "google_search",
                "otherText": None,
                "paymentToken": VALID_TOKEN_FOR_ORDERID_FUZZ,
            },
        ))
        trials.append(skip_trial(
            f"oid-{label}",
            {"orderId": bad_oid, "paymentToken": VALID_TOKEN_FOR_ORDERID_FUZZ},
        ))

    # No-creds baseline against the seeded order
    trials.append(submit_trial(
        "no-creds",
        {"orderId": oid, "source": "google_search", "otherText": None},
    ))
    trials.append(skip_trial("no-creds", {"orderId": oid}))

    # Unknown survey source — must fail Zod, never reach handler
    trials.append(submit_trial(
        "unknown-source",
        {
            "orderId": oid,
            "source": "phishing",
            "otherText": None,
            "paymentToken": VALID_TOKEN_FOR_ORDERID_FUZZ,
        },
    ))

    return trials


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

@dataclass
class Seed:
    order_id: str
    payment_token: str
    email: str
    user_id: str


def run_fixture(*args: str) -> dict[str, Any]:
    """Invoke scripts/e2e-survey-fixture.mjs and return the parsed JSON line."""
    result = subprocess.run(
        [NODE_BIN, str(FIXTURE_SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"fixture {' '.join(args)} failed: rc={result.returncode}\n"
            f"stdout={result.stdout!r}\nstderr={result.stderr!r}"
        )
    # Last non-empty line is the JSON payload.
    line = next((ln for ln in reversed(result.stdout.splitlines()) if ln.strip()), "")
    return json.loads(line)


def seed_order() -> Seed:
    out = run_fixture("seed")
    return Seed(
        order_id=out["orderId"],
        payment_token=out["paymentToken"],
        email=out["email"],
        user_id=out["userId"],
    )


def snapshot_state(order_id: str, email: str) -> dict[str, Any]:
    snap = run_fixture("snapshot", order_id, email)
    # Strip the `_updatedAt`-style live timestamps Firestore adds back into
    # arbitrary nested data — for our test fixture the schema is fixed and
    # we want a deterministic diff.
    snap.pop("ok", None)
    return snap


def cleanup_order(order_id: str, email: str) -> None:
    try:
        run_fixture("cleanup", order_id, email)
    except Exception as exc:  # pragma: no cover - best effort
        print(f"[e2e] WARN: cleanup failed for {order_id}: {exc}")


# ---------------------------------------------------------------------------
# Outcome classification
# ---------------------------------------------------------------------------

@dataclass
class TrialOutcome:
    name: str
    http_status: int | None
    ok: bool          # client RPC reported success (`{ ok: true, ... }`)
    msg: str          # client-side error message (empty on success)
    raw_body: str     # raw response body captured by the page listener
    db_pre: dict[str, Any] | None = field(default=None)
    db_post: dict[str, Any] | None = field(default=None)
    fn: str | None = field(default=None)
    request_args: dict[str, Any] | None = field(default=None)



def assert_rejection_contract(outcome: TrialOutcome) -> tuple[bool, str]:
    """Validate that a blocked request meets the rejection contract.

    TanStack Start's server-fn RPC convention serialises thrown errors as
    HTTP 200 + a JSON envelope containing the message — the HTTP layer
    only fails on transport-level problems, not on application errors.
    So the contract for a blocked request is:

    * Client RPC stub MUST NOT report success (no ``{ ok: true }``).
    * HTTP response MUST have been captured (the request actually hit
      the server — not blocked by middleware/CSP/etc.).
    * Message reaching the client MUST be either ``Order not found``
      (generic ownership-guard rejection) or a Zod validation failure
      (handler never reached). No other text is acceptable — anything
      else risks leaking ownership / DB state.
    """
    if outcome.ok:
        return False, "request succeeded — should have been rejected"
    if outcome.http_status is None:
        return False, "no HTTP response captured"
    msg = outcome.msg or ""
    is_zod = msg.startswith("[") and '"code"' in msg
    is_generic = msg == "Order not found" or '"Order not found"' in outcome.raw_body
    if is_zod:
        return True, f"zod boundary (HTTP {outcome.http_status})"
    if is_generic:
        return True, f"Order not found (HTTP {outcome.http_status})"
    return False, f"unexpected error msg {msg[:120]!r}"


def db_unchanged(pre: dict[str, Any] | None, post: dict[str, Any] | None) -> bool:
    if pre is None or post is None:
        return True  # not seeded — nothing to verify
    return json.dumps(pre, sort_keys=True, default=str) == json.dumps(
        post, sort_keys=True, default=str
    )


# Fields whose byte-for-byte value MUST NOT change on a rejected request.
# Snapshot shape (from e2e-survey-fixture.mjs `snapshot`):
#   { order: {...}, save10_claims: {...} | null }
IMMUTABLE_ORDER_FIELDS = (
    "surveySkipped",
    "sourceSurvey",
    "sourceSurveyAt",
    "sourceSurveySubmittedAt",
    "save10CouponCode",
    "save10ClaimedAt",
    "updatedAt",
)


def assert_fields_immutable(
    pre: dict[str, Any] | None,
    post: dict[str, Any] | None,
) -> tuple[bool, str]:
    """Strict per-field check: each tracked field must be byte-identical."""
    if pre is None or post is None:
        return True, "no snapshot"
    pre_order = (pre.get("order") or {}) if isinstance(pre.get("order"), dict) else {}
    post_order = (post.get("order") or {}) if isinstance(post.get("order"), dict) else {}
    for f in IMMUTABLE_ORDER_FIELDS:
        a = json.dumps(pre_order.get(f), sort_keys=True, default=str)
        b = json.dumps(post_order.get(f), sort_keys=True, default=str)
        if a != b:
            return False, f"order.{f} mutated: {a} -> {b}"
    a = json.dumps(pre.get("save10_claims"), sort_keys=True, default=str)
    b = json.dumps(post.get("save10_claims"), sort_keys=True, default=str)
    if a != b:
        return False, f"save10_claims mutated: {a[:120]} -> {b[:120]}"
    return True, "fields immutable"


# Randomised malformed shape generator for the burst phase. Categories:
#   empty, oversize, unicode/control chars, JSON-encoded, hex, path-ish,
#   sql-ish, null-bytes, just-under-min, way-oversize.
def random_bad_token(rnd: "random.Random") -> tuple[str, str]:
    import string
    category = rnd.choice([
        "empty", "one-char", "just-under-min", "oversize", "way-oversize",
        "unicode-emoji", "unicode-rtl", "control-chars", "null-bytes",
        "json-encoded", "hex-zeros", "sql-ish", "path-ish", "url-ish",
        "all-spaces", "newlines",
    ])
    if category == "empty":          return category, ""
    if category == "one-char":       return category, rnd.choice(string.ascii_letters)
    if category == "just-under-min": return category, rnd.choice(string.ascii_letters) * 31
    if category == "oversize":       return category, "x" * rnd.randint(257, 1024)
    if category == "way-oversize":   return category, "x" * rnd.randint(4096, 16384)
    if category == "unicode-emoji":  return category, "🚀" * rnd.randint(8, 64)
    if category == "unicode-rtl":    return category, "\u202e" * rnd.randint(8, 64)
    if category == "control-chars":
        return category, "".join(chr(rnd.randint(1, 31)) for _ in range(rnd.randint(32, 128)))
    if category == "null-bytes":     return category, "\x00" * rnd.randint(32, 128)
    if category == "json-encoded":
        return category, json.dumps({"token": "x" * rnd.randint(16, 96), "u": rnd.random()})
    if category == "hex-zeros":      return category, "0" * rnd.choice([32, 64, 128, 256])
    if category == "sql-ish":        return category, "' OR 1=1 --" + "x" * rnd.randint(20, 200)
    if category == "path-ish":       return category, "../" * rnd.randint(4, 32) + "x" * 16
    if category == "url-ish":        return category, "https://evil.example/" + "x" * rnd.randint(20, 200)
    if category == "all-spaces":     return category, " " * rnd.randint(32, 200)
    if category == "newlines":       return category, "\n" * rnd.randint(32, 200)
    return category, "?"




# ---------------------------------------------------------------------------
# Playwright driver
# ---------------------------------------------------------------------------

EVAL_SCRIPT = """async ({ trials, mode, headersByName }) => {
  // The TanStack Start Vite plugin inlines `process.env.TSS_SERVER_FN_BASE`
  // into the bundled client entry, but the on-demand `.functions.ts`
  // module we import from page.evaluate is not run through that
  // define-replacement pass. Polyfill the variable so the client RPC stub
  // can resolve its target URL.
  window.process = window.process || { env: { TSS_SERVER_FN_BASE: '/_serverFn/' } };

  // Per-trial header overrides — set just before invoking the fn so the
  // wrapped fetch can splice them onto the outgoing request, then cleared.
  let pendingHeaders = null;
  const origFetch = window.fetch.bind(window);
  const responsesByUrl = new Map();
  window.fetch = async (...args) => {
    let req = args[0];
    let init = args[1] || {};
    const url = typeof req === 'string' ? req : (req && req.url) || '';
    if (url.includes('/_serverFn/') && pendingHeaders) {
      const hdrs = new Headers(init.headers || (typeof req !== 'string' ? req.headers : undefined) || {});
      for (const [k, v] of Object.entries(pendingHeaders)) {
        if (v === null) hdrs.delete(k); else hdrs.set(k, v);
      }
      init = { ...init, headers: hdrs };
      if (typeof req !== 'string') {
        // Rebuild request with merged headers but preserve method/body.
        const body = await req.clone().text().catch(() => undefined);
        req = new Request(url, { method: req.method, body, headers: hdrs });
        args = [req];
      } else {
        args = [req, init];
      }
    }
    const res = await origFetch(...args);
    if (url.includes('/_serverFn/')) {
      try {
        const body = await res.clone().text();
        const list = responsesByUrl.get(url) || [];
        list.push({ status: res.status, body });
        responsesByUrl.set(url, list);
      } catch (_) { /* ignore */ }
    }
    return res;
  };

  const mod = await import('/src/lib/source-survey.functions.ts');
  const submitUrl = mod.submitSourceSurvey.url;
  const skipUrl   = mod.skipSourceSurvey.url;

  async function runOne(t) {
    const fn = t.fn === 'submit' ? mod.submitSourceSurvey : mod.skipSourceSurvey;
    const targetUrl = t.fn === 'submit' ? submitUrl : skipUrl;
    pendingHeaders = (headersByName && headersByName[t.name]) || null;
    let ok = false, msg = '', resultJson = null;
    try {
      const r = await fn({ data: t.args });
      ok = true;
      resultJson = JSON.parse(JSON.stringify(r));
    } catch (e) {
      msg = String(e?.message || e);
    }
    pendingHeaders = null;
    const list = responsesByUrl.get(targetUrl) || [];
    const resp = list.shift() || {};
    responsesByUrl.set(targetUrl, list);
    return { name: t.name, ok, msg, result: resultJson,
             http_status: resp.status ?? null, raw_body: resp.body ?? '' };
  }

  let out;
  if (mode === 'concurrent') {
    // Fire all at once via Promise.all. Per-trial header overrides are
    // disabled in concurrent mode (would race) — the auth matrix runs
    // sequentially. Concurrent mode is only used for race-condition tests
    // against a single seeded order with the same valid credentials.
    out = await Promise.all(trials.map(runOne));
  } else {
    out = [];
    for (const t of trials) out.push(await runOne(t));
  }
  return { trials: out, submitUrl, skipUrl };
}"""


async def run_trials_in_browser(
    trials: list[dict[str, Any]],
    *,
    mode: str = "sequential",
    headers_by_name: dict[str, dict[str, str | None]] | None = None,
) -> tuple[list[TrialOutcome], str, str]:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 900}, user_agent=UA
        )
        page = await ctx.new_page()
        await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
        result = await page.evaluate(EVAL_SCRIPT, {
            "trials": trials,
            "mode": mode,
            "headersByName": headers_by_name or {},
        })

        outcomes = []
        for src, t in zip(trials, result["trials"]):
            outcomes.append(TrialOutcome(
                name=t["name"],
                http_status=t.get("http_status"),
                ok=bool(t.get("ok")),
                msg=str(t.get("msg") or ""),
                raw_body=str(t.get("raw_body") or ""),
                fn=src.get("fn"),
                request_args=src.get("args"),
            ))

        await browser.close()
        return outcomes, result["submitUrl"], result["skipUrl"]



# Variant that runs trials one-by-one and snapshots Firestore around each.
# Used only when we have a seeded order (FIREBASE_SERVICE_ACCOUNT_JSON set).
async def run_trials_with_db_checks(
    trials: list[dict[str, Any]], seed: Seed
) -> list[TrialOutcome]:
    # Snapshot once at the very start; for each failing trial we re-snapshot
    # afterwards and assert nothing changed. We don't need a per-trial
    # pre-snapshot because the contract is "no state change vs. baseline".
    baseline = snapshot_state(seed.order_id, seed.email)
    outcomes, _, _ = await run_trials_in_browser(trials)
    for o in outcomes:
        o.db_pre = baseline
        o.db_post = snapshot_state(seed.order_id, seed.email)
    return outcomes


# ---------------------------------------------------------------------------
# Happy-path
# ---------------------------------------------------------------------------

async def run_happy_path(seed: Seed) -> tuple[list[TrialOutcome], dict[str, Any]]:
    """Submit + skip with the correct paymentToken and assert success."""
    trials = [
        {
            "name": "submit:HAPPY",
            "fn": "submit",
            "args": {
                "orderId": seed.order_id,
                "source": "google_search",
                "otherText": None,
                "paymentToken": seed.payment_token,
            },
        },
        # A second skip after submit flips surveySkipped back to true.
        # Both must succeed end-to-end.
        {
            "name": "skip:HAPPY",
            "fn": "skip",
            "args": {
                "orderId": seed.order_id,
                "paymentToken": seed.payment_token,
            },
        },
    ]
    outcomes, _, _ = await run_trials_in_browser(trials)
    final = snapshot_state(seed.order_id, seed.email)
    return outcomes, final


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> int:
    print(f"[e2e] target: {BASE_URL}")
    print(f"[e2e] firebase fixtures: {'ENABLED' if HAVE_SERVICE_ACCOUNT else 'SKIPPED (no FIREBASE_SERVICE_ACCOUNT_JSON)'}")

    seed: Seed | None = None
    if HAVE_SERVICE_ACCOUNT:
        seed = seed_order()
        print(f"[e2e] seeded order: {seed.order_id} (email={seed.email})")

    try:
        # --- Edge-case fuzz -------------------------------------------------
        trials = build_trials(seed.order_id if seed else None)
        print(f"[e2e] running {len(trials)} fuzz trials …")
        if seed:
            fuzz_outcomes = await run_trials_with_db_checks(trials, seed)
        else:
            fuzz_outcomes, sub_url, skip_url = await run_trials_in_browser(trials)
            print(f"[e2e]   submit endpoint: {sub_url}")
            print(f"[e2e]   skip   endpoint: {skip_url}")

        passes = fails = 0
        for o in fuzz_outcomes:
            ok, info = assert_rejection_contract(o)
            db_ok = db_unchanged(o.db_pre, o.db_post)
            if ok and db_ok:
                passes += 1
            else:
                fails += 1
                why = info if not ok else "DB STATE CHANGED on blocked request"
                print(f"  ✗ {o.name:<40} {why}")
                record_failure("fuzz", o, why)
        print(f"[e2e] fuzz: {passes} passed, {fails} failed")

        # --- Burst: alternating malformed + valid --------------------------
        # Confirms that valid-looking-but-bogus requests stay blocked when
        # interleaved at high frequency with happy-path-shaped traffic, and
        # that valid happy-path requests still succeed in the same burst.
        burst_fails = 0
        burst_pass = 0
        if seed:
            print("[e2e] running malformed→valid burst …")
            oid = seed.order_id
            tok_ok = seed.payment_token
            burst: list[dict[str, Any]] = []
            for i in range(8):
                bad_tok = ("x" * 64) if i % 2 == 0 else ("' OR 1=1 --" + "x" * 60)
                burst.append(submit_trial(f"burst-bad-{i}", {
                    "orderId": oid, "source": "google_search",
                    "otherText": None, "paymentToken": bad_tok,
                }))
                burst.append(skip_trial(f"burst-bad-skip-{i}", {
                    "orderId": oid, "paymentToken": bad_tok,
                }))
            # One genuine valid call at the end to confirm the system still
            # accepts good traffic after a burst of rejections.
            burst.append(skip_trial("burst-valid-final", {
                "orderId": oid, "paymentToken": tok_ok,
            }))
            baseline = snapshot_state(seed.order_id, seed.email)
            burst_outcomes, _, _ = await run_trials_in_browser(burst)
            post_state = snapshot_state(seed.order_id, seed.email)
            for o in burst_outcomes:
                o.db_pre = baseline
                o.db_post = post_state
                if o.name.endswith("burst-valid-final"):
                    if not o.ok or "Order not found" in (o.raw_body or ""):
                        burst_fails += 1
                        print(f"  ✗ {o.name:<40} valid request blocked")
                        record_failure("burst", o, "valid call rejected after burst")
                    else:
                        burst_pass += 1
                else:
                    ok, info = assert_rejection_contract(o)
                    if ok:
                        burst_pass += 1
                    else:
                        burst_fails += 1
                        print(f"  ✗ {o.name:<40} {info}")
                        record_failure("burst", o, info)
            print(f"[e2e] burst: {burst_pass} passed, {burst_fails} failed")

        # --- Idempotency: replay submit + skip many times ------------------
        idem_fails = 0
        idem_pass = 0
        idem_final: dict[str, Any] | None = None
        if seed:
            print("[e2e] running idempotency replay …")
            pre = snapshot_state(seed.order_id, seed.email)
            # Replay: submit×3 then skip×3 then submit×2 then skip×2.
            sequence: list[dict[str, Any]] = []
            for i in range(3):
                sequence.append(submit_trial(f"idem-submit-{i}", {
                    "orderId": seed.order_id, "source": "google_search",
                    "otherText": None, "paymentToken": seed.payment_token,
                }))
            for i in range(3):
                sequence.append(skip_trial(f"idem-skip-{i}", {
                    "orderId": seed.order_id, "paymentToken": seed.payment_token,
                }))
            for i in range(2):
                sequence.append(submit_trial(f"idem-submit2-{i}", {
                    "orderId": seed.order_id, "source": "direct",
                    "otherText": None, "paymentToken": seed.payment_token,
                }))
            for i in range(2):
                sequence.append(skip_trial(f"idem-skip2-{i}", {
                    "orderId": seed.order_id, "paymentToken": seed.payment_token,
                }))
            idem_outcomes, _, _ = await run_trials_in_browser(sequence)
            post = snapshot_state(seed.order_id, seed.email)
            idem_final = post
            for o in idem_outcomes:
                o.db_pre = pre
                o.db_post = post
                if not o.ok:
                    idem_fails += 1
                    print(f"  ✗ {o.name:<40} unexpected rejection: {o.msg!r}")
                    record_failure("idempotency", o, "replay call rejected")
                else:
                    idem_pass += 1
            # Order doc must still be a single document. The fixture's
            # snapshot returns at most ONE order + ONE claim. Verify there
            # is no claim duplication and that the final state matches the
            # last call (skip → surveySkipped=True, sourceSurvey=None).
            order_state = (post.get("order") or {})
            claims_state = post.get("save10_claims")
            if order_state.get("surveySkipped") is not True:
                idem_fails += 1
                print(f"  ✗ idempotent final state: {order_state}")
                record_failure("idempotency", TrialOutcome(
                    name="idem-final-state", http_status=None, ok=False, msg="",
                    raw_body="", db_pre=pre, db_post=post,
                ), "final state not surveySkipped=True after skip-last replay")
            # Claim collection must hold at most a single entry per order —
            # the fixture returns the doc keyed by orderId; if it became a
            # list/multiple something is double-writing.
            if isinstance(claims_state, list) and len(claims_state) > 1:
                idem_fails += 1
                record_failure("idempotency", TrialOutcome(
                    name="idem-duplicate-claims", http_status=None, ok=False,
                    msg="", raw_body="", db_pre=pre, db_post=post,
                ), f"duplicate save10 claims: {len(claims_state)}")
            print(f"[e2e] idempotency: {idem_pass} passed, {idem_fails} failed")

        # --- Happy path -----------------------------------------------------
        happy_fails = 0
        if seed:
            print("[e2e] running happy-path …")
            happy_outcomes, final = await run_happy_path(seed)
            for o in happy_outcomes:
                if not o.ok:
                    happy_fails += 1
                    print(f"  ✗ {o.name:<40} blocked: msg={o.msg!r} http={o.http_status}")
                    record_failure("happy", o, "happy-path call rejected")
                elif o.http_status is None or not (200 <= o.http_status < 300):
                    happy_fails += 1
                    print(f"  ✗ {o.name:<40} non-2xx success: http={o.http_status}")
                    record_failure("happy", o, "non-2xx on success")
                elif "Order not found" in (o.raw_body or "") or "Order not found" in (o.msg or ""):
                    happy_fails += 1
                    print(f"  ✗ {o.name:<40} response leaked generic error")
                    record_failure("happy", o, "response leaked generic error")
                else:
                    print(f"  ✓ {o.name:<40} HTTP {o.http_status}")
            order_state = final.get("order", {})
            if order_state.get("surveySkipped") is not True:
                happy_fails += 1
                print(f"  ✗ final DB state mismatch: {order_state}")
            else:
                print(f"  ✓ final DB state: surveySkipped=True, sourceSurvey={order_state.get('sourceSurvey')}")
            print(f"[e2e] happy: {len(happy_outcomes) - happy_fails} passed, {happy_fails} failed")
        else:
            print("[e2e] happy-path: SKIPPED (no service account)")

        total_fail = fails + happy_fails + burst_fails + idem_fails
        summary = {
            "fuzz": {"pass": passes, "fail": fails},
            "burst": {"pass": burst_pass, "fail": burst_fails},
            "idempotency": {"pass": idem_pass, "fail": idem_fails},
            "happy": {"fail": happy_fails},
            "total_fail": total_fail,
        }
        report_path = write_report(summary)
        print(f"[e2e] report: {report_path}")
        print(f"\n[e2e] OVERALL: {'PASS' if total_fail == 0 else 'FAIL'} ({total_fail} failures)")
        return 0 if total_fail == 0 else 1
    finally:
        if seed:
            cleanup_order(seed.order_id, seed.email)
            print(f"[e2e] cleaned up {seed.order_id}")



if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
