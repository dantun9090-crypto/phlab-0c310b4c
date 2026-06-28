import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Rocket, Loader2, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { triggerReindex, type ReindexHookResponse } from "@/lib/reindex.functions";

const PRESETS: Record<string, string[]> = {
  "Landing pages (/compound + /peptide-calculator)": [
    "/compound",
    "/peptide-calculator",
  ],
  "Retatrutide cluster": [
    "/products/retatrutide-research-peptide",
    "/research/retatrutide-uk",
  ],
  "Home + products index": ["/", "/products"],
};

export default function ReindexHookTab() {
  const run = useServerFn(triggerReindex);
  const [urlsText, setUrlsText] = useState(PRESETS["Landing pages (/compound + /peptide-calculator)"].join("\n"));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReindexHookResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const urls = urlsText.split("\n").map((u) => u.trim()).filter(Boolean);
    try {
      const res = await run({ data: { urls } });
      setResult(res);
      toast.success(
        res.ok
          ? `Reindex queued for ${res.submittedUrls.length} URL(s)`
          : `Partial: IndexNow ${res.indexNow.status}, Prerender D${res.prerender.desktop.status}/M${res.prerender.mobile.status}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(`Reindex failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Rocket className="w-6 h-6 text-emerald-400" /> Fast Reindex Hook
        </h1>
        <p className="text-slate-300 text-sm mt-1">
          Pushes URLs to <strong>IndexNow</strong> (Bing/Yandex/Seznam/Naver),
          requests a <strong>Prerender.io</strong> recache for desktop + mobile,
          and returns <strong>Google Search Console URL Inspector</strong>{" "}
          deep-links you can click to submit indexing requests from the GSC UI.
        </p>
      </header>

      <section className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([label, urls]) => (
            <button
              key={label}
              type="button"
              onClick={() => setUrlsText(urls.join("\n"))}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-800 border-2 border-slate-600 text-white hover:bg-slate-700"
            >
              {label}
            </button>
          ))}
        </div>

        <label className="block text-sm text-slate-200 font-medium">
          URLs (one per line — path or absolute)
        </label>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          rows={6}
          className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 text-white p-3 font-mono text-sm"
          spellCheck={false}
        />

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[48px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          {busy ? "Submitting…" : "Trigger reindex"}
        </button>
      </section>

      {error && (
        <div role="alert" className="bg-red-950 border-2 border-red-700 rounded-lg p-4 text-red-100 text-sm">
          {error}
        </div>
      )}

      {result && (
        <section className="bg-slate-900 border-2 border-slate-700 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2">
            {result.ok ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-amber-400" />
            )}
            <h2 className="text-lg font-semibold text-white">
              Reindex result — {result.submittedUrls.length} URL(s)
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-slate-800 rounded-md p-3 border border-slate-700">
              <div className="text-slate-400 text-xs uppercase">IndexNow</div>
              <div className="text-white font-mono">
                HTTP {result.indexNow.status} · {result.indexNow.submitted} submitted
              </div>
              <div className="text-slate-300 text-xs mt-1 break-words">
                {result.indexNow.response || "—"}
              </div>
            </div>
            <div className="bg-slate-800 rounded-md p-3 border border-slate-700">
              <div className="text-slate-400 text-xs uppercase">Prerender (desktop)</div>
              <div className="text-white font-mono">HTTP {result.prerender.desktop.status}</div>
              <div className="text-slate-300 text-xs mt-1 break-words">
                {result.prerender.desktop.response || "—"}
              </div>
            </div>
            <div className="bg-slate-800 rounded-md p-3 border border-slate-700">
              <div className="text-slate-400 text-xs uppercase">Prerender (mobile)</div>
              <div className="text-white font-mono">HTTP {result.prerender.mobile.status}</div>
              <div className="text-slate-300 text-xs mt-1 break-words">
                {result.prerender.mobile.response || "—"}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-2">
              GSC URL Inspector deep-links
            </h3>
            <p className="text-slate-400 text-xs mb-2">
              Click each link to open the URL in Search Console — then press
              "Request Indexing". Google has no public automation endpoint for
              this step.
            </p>
            <ul className="space-y-1.5">
              {result.gscInspectorLinks.map((link) => (
                <li key={link.url} className="flex items-center gap-2 text-sm">
                  <a
                    href={link.inspector}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {link.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {result.note && (
            <p className="text-slate-400 text-xs italic">{result.note}</p>
          )}
        </section>
      )}
    </div>
  );
}
