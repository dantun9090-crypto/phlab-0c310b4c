import { describe, it, expect } from "vitest";
import { buildSecurityComment, MARKER } from "../scripts/lib/security-pr-comment.mjs";

const baseCtx = {
  runUrl: "https://github.com/o/r/actions/runs/123",
  artifactUrl: "https://github.com/o/r/actions/runs/123/artifacts/456",
  sha: "abc1234",
  exitCode: "0",
  inputOverride: "",
};

const passReport = {
  generatedAt: "2026-06-24T00:00:00.000Z",
  minSeverity: "medium",
  totals: {
    blocking: 0,
    informational: 4,
    ignored: 3,
    packagesScanned: 937,
    affectedPackages: 7,
    uniqueAdvisories: 9,
  },
  blocking: [],
  informational: [],
  ignored: [],
};

const failReport = {
  generatedAt: "2026-06-24T00:00:00.000Z",
  minSeverity: "high",
  totals: {
    blocking: 3,
    informational: 1,
    ignored: 0,
    packagesScanned: 100,
    affectedPackages: 2,
    uniqueAdvisories: 3,
  },
  blocking: [
    {
      pkg: "undici",
      version: "6.0.0",
      id: "GHSA-AAAA",
      severity: "critical",
      summary: "Critical issue in undici",
      url: "https://osv.dev/vulnerability/GHSA-AAAA",
    },
    {
      pkg: "undici",
      version: "6.0.0",
      id: "GHSA-BBBB",
      severity: "high",
      summary: "High issue in undici",
      url: "https://osv.dev/vulnerability/GHSA-BBBB",
    },
    {
      pkg: "ws",
      version: "7.0.0",
      id: "GHSA-CCCC",
      severity: "high",
      summary: "DoS in ws",
      url: "https://osv.dev/vulnerability/GHSA-CCCC",
    },
  ],
  informational: [],
  ignored: [],
};

describe("buildSecurityComment", () => {
  it("includes the hidden marker so the workflow updates instead of duplicating", () => {
    const { body } = buildSecurityComment({ ...baseCtx, report: passReport });
    expect(body.startsWith(MARKER)).toBe(true);
  });

  it("renders the safe-to-merge status on a passing scan", () => {
    const { body } = buildSecurityComment({ ...baseCtx, report: passReport });
    expect(body).toContain("✅");
    expect(body).toContain("safe to merge");
    expect(body).toContain("`medium`");
    expect(body).toContain("(from `.security-config.json`)");
    expect(body).toContain(baseCtx.artifactUrl);
    expect(body).toContain(`security-audit-${baseCtx.sha}.zip`);
    // No top-pkg table when there are no blocking findings.
    expect(body).not.toContain("Top vulnerable packages");
  });

  it("renders blocking status, top-package table, worst advisory IDs, and artifact link on failure", () => {
    const { body } = buildSecurityComment({
      ...baseCtx,
      report: failReport,
      exitCode: "1",
      inputOverride: "high",
    });
    expect(body).toContain("❌");
    expect(body).toContain("3 blocking");
    expect(body).toContain("merge gate failed");
    expect(body).toContain("Top vulnerable packages");
    // Worst-severity package surfaces first with its worst advisory ID.
    const undiciIdx = body.indexOf("`undici`");
    const wsIdx = body.indexOf("`ws`");
    expect(undiciIdx).toBeGreaterThan(-1);
    expect(wsIdx).toBeGreaterThan(undiciIdx);
    expect(body).toContain("**CRITICAL**");
    expect(body).toContain("GHSA-AAAA");
    expect(body).toContain("GHSA-BBBB");
    expect(body).toContain("GHSA-CCCC");
    // Override note swaps when a workflow_dispatch input was used.
    expect(body).toContain("overridden for this run via `workflow_dispatch` input");
    // Artifact one-click download link is present.
    expect(body).toContain(baseCtx.artifactUrl);
    expect(body).toContain("Scan exit: `1`");
    // Raw advisory list collapsed in <details>.
    expect(body).toContain("<details><summary>Blocking findings");
  });

  it("orders advisories within a package worst-first so the worst ID renders first", () => {
    const { body } = buildSecurityComment({
      ...baseCtx,
      report: failReport,
      exitCode: "1",
    });
    // In the undici row, GHSA-AAAA (critical) must appear before GHSA-BBBB (high).
    const row = body.split("\n").find((l) => l.includes("`undici`"));
    expect(row).toBeTruthy();
    const aIdx = row.indexOf("GHSA-AAAA");
    const bIdx = row.indexOf("GHSA-BBBB");
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
  });

  it("falls back to a crash notice when no report is available", () => {
    const { body } = buildSecurityComment({ ...baseCtx, report: null });
    expect(body).toContain("Report file missing");
    expect(body).toContain(baseCtx.runUrl);
  });
});
