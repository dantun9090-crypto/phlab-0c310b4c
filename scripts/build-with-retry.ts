import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Phase = {
  name: string;
  command: string[];
  retryable: boolean;
};

type PhaseResult = {
  code: number;
  output: string;
};

const MAX_ATTEMPTS = Number(process.env.BUILD_RETRY_ATTEMPTS || "3");
const BUILD_LOG_DIR = process.env.BUILD_LOG_DIR || "build-logs";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const logDir = join(process.cwd(), BUILD_LOG_DIR, `prod-build-${runId}`);
const summaryPath = join(logDir, "summary.md");
const contextPath = join(logDir, "context.json");

const transientPatterns = [
  /Temporary infrastructure issue/i,
  /preparing the build environment/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /EAI_AGAIN/i,
  /ENOTFOUND/i,
  /network\s+error/i,
  /fetch\s+failed/i,
  /socket\s+hang\s+up/i,
  /TLS connection/i,
  /HTTP\s+(408|425|429|500|502|503|504)/i,
  /npm registry/i,
  /registry\.npmjs\.org/i,
  /bunfig/i,
];

const phases: Phase[] = [
  { name: "environment-health", command: ["bun", "--version"], retryable: false },
  { name: "preflight-guards", command: ["bun", "run", "build:preflight"], retryable: false },
  { name: "production-build", command: ["bun", "run", "build:raw"], retryable: true },
  { name: "postbuild-artifacts", command: ["bun", "run", "build:post"], retryable: true },
];

function appendSummary(text: string) {
  writeFileSync(summaryPath, `${text}\n`, { flag: "a" });
  const githubSummary = process.env.GITHUB_STEP_SUMMARY;
  if (githubSummary) writeFileSync(githubSummary, `${text}\n`, { flag: "a" });
}

function writeContext() {
  const context = {
    runId,
    cwd: process.cwd(),
    bunVersion: Bun.version,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    buildId: process.env.BUILD_ID || process.env.GITHUB_SHA || null,
    github: {
      repository: process.env.GITHUB_REPOSITORY || null,
      ref: process.env.GITHUB_REF || null,
      runId: process.env.GITHUB_RUN_ID || null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    },
    files: {
      packageJson: existsSync("package.json"),
      bunLock: existsSync("bun.lock"),
      nodeModules: existsSync("node_modules") && statSync("node_modules").isDirectory(),
      viteConfig: existsSync("vite.config.ts"),
      serverEntry: existsSync("src/server.ts"),
    },
    retry: {
      maxAttempts: MAX_ATTEMPTS,
      transientPatterns: transientPatterns.map((pattern) => String(pattern)),
    },
  };
  writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`);
}

async function runPhase(phase: Phase, attempt: number): Promise<PhaseResult> {
  const label = `${phase.name}-attempt-${attempt}`;
  const logPath = join(logDir, `${label}.log`);
  const proc = Bun.spawn(phase.command, {
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const [code, stdout, stderr] = await Promise.all([proc.exited, stdoutPromise, stderrPromise]);
  const output = [
    `$ ${phase.command.join(" ")}`,
    `phase=${phase.name}`,
    `attempt=${attempt}`,
    `exit=${code}`,
    "--- stdout ---",
    stdout,
    "--- stderr ---",
    stderr,
  ].join("\n");

  writeFileSync(logPath, output);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  appendSummary(`- ${code === 0 ? "✅" : "❌"} ${phase.name} attempt ${attempt}: exit ${code} — log: \`${logPath}\``);
  return { code, output };
}

function isTransient(output: string): boolean {
  return transientPatterns.some((pattern) => pattern.test(output));
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 2 ** (attempt - 1) * 10_000);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  mkdirSync(logDir, { recursive: true });
  writeContext();
  appendSummary(`## Production build with transient retry`);
  appendSummary(`Diagnostic context: \`${contextPath}\``);

  for (const phase of phases) {
    const limit = phase.retryable ? MAX_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= limit; attempt++) {
      const result = await runPhase(phase, attempt);
      if (result.code === 0) break;

      const transient = phase.retryable && isTransient(result.output);
      if (!transient || attempt >= limit) {
        appendSummary(`\n**Build failed in phase:** ${phase.name}`);
        appendSummary(`**Retryable transient detected:** ${transient ? "yes" : "no"}`);
        appendSummary(`Full logs are in \`${logDir}\`.`);
        process.exit(result.code || 1);
      }

      const wait = backoffMs(attempt);
      appendSummary(`  ↳ transient infrastructure/network signal detected; retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }

  appendSummary(`\n✅ Production build completed successfully after retry guard.`);
}

main().catch((error) => {
  mkdirSync(logDir, { recursive: true });
  const message = error instanceof Error ? `${error.message}\n${error.stack || ""}` : String(error);
  writeFileSync(join(logDir, "runner-exception.log"), message);
  appendSummary(`\n❌ Build retry runner crashed. Logs: \`${logDir}\``);
  console.error(message);
  process.exit(1);
});