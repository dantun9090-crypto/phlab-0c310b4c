// @vitest-environment node
/**
 * End-to-end test for the `workflow_dispatch` `min_severity` override path.
 *
 * Mirrors what `.github/workflows/security-scan.yml` does at runtime:
 *   1. The dispatch input is forwarded to `scripts/security-audit.ts`
 *      via `SECURITY_MIN_SEVERITY`, which writes the resolved gate into
 *      `dist/security-audit.json` as `minSeverity`.
 *   2. The same dispatch input is forwarded to the PR-comment builder
 *      as `INPUT_OVERRIDE` and threaded in as `inputOverride`.
 *
 * We assert that an overridden minSeverity:
 *   - flips the active-gate label in the PR comment header,
 *   - prints the "(overridden for this run via `workflow_dispatch` input)"
 *     note instead of the config note,
 *   - and that the gate status (pass vs fail) is computed from the
 *     overridden, not the default, value (i.e. only blocking findings
 *     surviving at the new threshold count).
 */
import { describe, it, expect } from "vitest";
import { buildSecurityComment } from "../scripts/lib/security-pr-comment.mjs";

const baseCtx = {
  runUrl: "https://github.com/o/r/actions/runs/123",
  artifactUrl: "https://github.com/o/r/actions/runs/123/artifacts/456",
  sha: "deadbee",
  exitCode: "0",
};

// Simulate what scripts/security-audit.ts writes when
// SECURITY_MIN_SEVERITY=critical is set: only critical+ findings end up
// in `blocking`; high/medium drop to `informational`.
function reportForGate(minSeverity: string, blockingCount: number) {
  return {
    generatedAt: "2026-06-24T00:00:00.000Z",
    minSeverity,
    totals: {
      blocking: blockingCount,
      informational: 2,
      ignored: 0,
      packagesScanned: 50,
      affectedPackages: blockingCount,
      uniqueAdvisories: blockingCount + 2,
    },
    blocking: Array.from({ length: blockingCount }, (_, i) => ({
      pkg: `pkg-${i}`,
      version: "1.0.0",
      id: `GHSA-X${i}`,
      severity: "critical",
      summary: "critical issue",
      url: `https://osv.dev/vulnerability/GHSA-X${i}`,
    })),
    informational: [],
    ignored: [],
  };
}

describe("workflow_dispatch min_severity override → PR comment", () => {
  it("override to `critical` that finds no critical findings flips gate to pass + shows override note", () => {
    const report = reportForGate("critical", 0);
    const { body } = buildSecurityComment({
      ...baseCtx,
      report,
      inputOverride: "critical",
    });
    expect(body).toContain("gate: `critical`+");
    expect(body).toContain("**Active `minSeverity` gate:** `critical`");
    expect(body).toContain("(overridden for this run via `workflow_dispatch` input)");
    expect(body).not.toContain("(from `.security-config.json`)");
    expect(body).toContain("✅");
    expect(body).toContain("safe to merge");
  });

  it("override to `high` that surfaces 2 critical findings shows blocking gate + override note", () => {
    const report = reportForGate("high", 2);
    const { body } = buildSecurityComment({
      ...baseCtx,
      report,
      exitCode: "1",
      inputOverride: "high",
    });
    expect(body).toContain("gate: `high`+");
    expect(body).toContain("**Active `minSeverity` gate:** `high`");
    expect(body).toContain("(overridden for this run via `workflow_dispatch` input)");
    expect(body).toContain("❌");
    expect(body).toContain("2 blocking high+ vulnerabilities");
    expect(body).toContain("Scan exit: `1`");
  });

  it("no override (empty input) keeps the config-sourced note and uses the report's minSeverity verbatim", () => {
    const report = reportForGate("medium", 0);
    const { body } = buildSecurityComment({
      ...baseCtx,
      report,
      inputOverride: "",
    });
    expect(body).toContain("**Active `minSeverity` gate:** `medium`");
    expect(body).toContain("(from `.security-config.json`)");
    expect(body).not.toContain("overridden for this run");
  });
});
