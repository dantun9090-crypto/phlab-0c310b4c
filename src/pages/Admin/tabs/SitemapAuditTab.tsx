/**
 * Admin → SEO → Sitemap Audit
 *
 * Reruns the sitemap-vs-live-routes audit (via runSitemapAudit server fn)
 * and renders a clear report with separate sections for:
 *   - Missing indexable routes
 *   - URLs the sitemap shouldn't contain
 *   - URLs in the sitemap that return 4xx/5xx
 *   - Intentional exclusions (false positives) labelled with the reason
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  runSitemapAudit,
  type SitemapAuditReport,
} from "@/lib/sitemap-audit.functions";
import { auth, db, doc, getDoc, onAuthStateChanged } from "@/lib/firebase";
import {
  Map as MapIcon,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Loader2,
  Lock,
} from "lucide-react";

function Pill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "err" | "info";
  children: React.ReactNode;
}) {
  const cls = {
    ok: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    warn: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    err: "bg-red-500/10 text-red-300 border-red-500/30",
    info: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-mono ${cls}`}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  icon,
  tone,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "ok" | "warn" | "err" | "info";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-white font-semibold">
          {icon}
          <span>{title}</span>
        </div>
        <Pill tone={tone}>{count}</Pill>
      </div>
      {count === 0 ? (
        <p className="text-slate-400 text-sm">None.</p>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </div>
  );
}

export default function SitemapAuditTab() {
  const run = useServerFn(runSitemapAudit);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SitemapAuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"checking" | "admin" | "denied">(
    "checking",
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthState("denied");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "customers", user.uid));
        setAuthState(snap.exists() && snap.data()?.isAdmin === true ? "admin" : "denied");
      } catch {
        setAuthState("denied");
      }
    });
    return () => unsub();
  }, []);

  const trigger = async () => {
    if (authState !== "admin") return;
    setLoading(true);
    setError(null);
    try {
      const idToken = (await auth.currentUser?.getIdToken()) ?? "";
      if (!idToken) throw new Error("Not signed in");
      const r = await run({ data: { idToken } });
      setReport(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (authState === "checking") {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Verifying admin access…
      </div>
    );
  }

  if (authState === "denied") {
    return (
      <div className="bg-red-500/10 border-2 border-red-500/30 rounded-lg p-8 text-center max-w-xl mx-auto">
        <Lock className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Access denied</h2>
        <p className="text-slate-300 text-sm">
          The Sitemap Audit is restricted to authorised admin accounts. Sign in
          with an admin account to run this tool.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <MapIcon className="w-6 h-6 text-emerald-400" />
            Sitemap Audit
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Cross-references{" "}
            <code className="text-emerald-300">/sitemap.xml</code> against the
            live route surface and{" "}
            <code className="text-emerald-300">robots.txt</code>. Flags missing
            routes, URLs that shouldn't be indexed, and false-positive
            exclusions explicitly.
          </p>
        </div>
        <button
          onClick={trigger}
          disabled={loading}
          className="px-4 py-2.5 min-h-[48px] bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {loading ? "Auditing…" : "Run audit"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border-2 border-red-500/30 rounded-lg p-4 text-red-300 text-sm font-mono">
          {error}
        </div>
      )}

      {!report && !loading && !error && (
        <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-8 text-center">
          <MapIcon className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-300">
            Click <strong>Run audit</strong> to verify the live sitemap against
            policy.
          </p>
        </div>
      )}

      {report && (
        <>
          {/* Headline */}
          <div
            className={`rounded-lg p-4 border-2 flex items-center gap-3 ${
              report.ok
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-amber-500/10 border-amber-500/30"
            }`}
          >
            {report.ok ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            )}
            <div className="flex-1">
              <p className="text-white font-semibold">
                {report.ok
                  ? "Sitemap is healthy"
                  : "Sitemap needs attention"}
              </p>
              <p className="text-slate-300 text-sm">
                {report.totalUrlsInSitemap} URLs in sitemap ·{" "}
                {report.totalIndexableRoutes} expected indexable routes ·{" "}
                {report.robotsRulesApplied} robots rules applied · HTTP{" "}
                {report.sitemapStatus}
              </p>
              <p className="text-slate-500 text-xs mt-1">
                Last run: {new Date(report.ranAt).toLocaleString("en-GB")}
              </p>
            </div>
          </div>

          {report.errors.length > 0 && (
            <Section
              title="Audit errors"
              icon={<XCircle className="w-5 h-5 text-red-400" />}
              tone="err"
              count={report.errors.length}
            >
              {report.errors.map((e, i) => (
                <code
                  key={i}
                  className="block bg-slate-950 border border-red-500/30 rounded p-2 text-red-300 text-xs"
                >
                  {e}
                </code>
              ))}
            </Section>
          )}

          <Section
            title="Missing — indexable routes not in sitemap"
            icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
            tone={report.missing.length === 0 ? "ok" : "warn"}
            count={report.missing.length}
          >
            {report.missing.map((m) => (
              <div
                key={m.path}
                className="flex items-center justify-between bg-slate-950 border border-amber-500/30 rounded px-3 py-2 text-sm"
              >
                <code className="text-amber-300">{m.path}</code>
                <Pill tone="warn">should be in sitemap</Pill>
              </div>
            ))}
          </Section>

          <Section
            title="Extra — URLs in sitemap that policy disallows"
            icon={<XCircle className="w-5 h-5 text-red-400" />}
            tone={report.extraBlocked.length === 0 ? "ok" : "err"}
            count={report.extraBlocked.length}
          >
            {report.extraBlocked.map((m) => (
              <div
                key={m.path}
                className="flex items-center justify-between gap-3 bg-slate-950 border border-red-500/30 rounded px-3 py-2 text-sm"
              >
                <code className="text-red-300">{m.path}</code>
                <Pill tone="err">
                  {m.reason.kind}: {m.reason.detail}
                </Pill>
              </div>
            ))}
          </Section>

          <Section
            title="Broken — sampled URLs returning 4xx/5xx"
            icon={<XCircle className="w-5 h-5 text-red-400" />}
            tone={report.extra404.length === 0 ? "ok" : "err"}
            count={report.extra404.length}
          >
            {report.extra404.map((m) => (
              <div
                key={m.path}
                className="flex items-center justify-between bg-slate-950 border border-red-500/30 rounded px-3 py-2 text-sm"
              >
                <code className="text-red-300">{m.path}</code>
                <Pill tone="err">HTTP {m.status}</Pill>
              </div>
            ))}
          </Section>

          <Section
            title="False positives — intentional exclusions"
            icon={<Info className="w-5 h-5 text-sky-400" />}
            tone="info"
            count={report.expectedExclusions.length}
          >
            <p className="text-slate-400 text-xs mb-2">
              These paths look like “missing” entries to a naive scanner but
              are excluded on purpose. Reason shown next to each.
            </p>
            {report.expectedExclusions.map((m) => (
              <div
                key={m.path}
                className="flex items-center justify-between gap-3 bg-slate-950 border border-sky-500/30 rounded px-3 py-2 text-sm"
              >
                <code className="text-sky-300">{m.path}</code>
                <Pill tone="info">
                  {m.reason.kind}: {m.reason.detail}
                </Pill>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
