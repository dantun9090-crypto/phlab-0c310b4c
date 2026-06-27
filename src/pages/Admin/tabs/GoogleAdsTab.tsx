import { useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  CAMPAIGNS,
  buildAdsEditorCsvs,
  scanCampaign,
  type Campaign,
} from '@/lib/google-ads-campaign';
import { pushCampaignToGoogleAds } from '@/lib/google-ads-push.functions';

function download(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadZip(files: Record<string, string>, zipName: string) {
  // tiny "zip-ish" fallback: bundle into a single .txt so user always gets something
  // — but most users will use the individual CSVs above. We just emit them one by one.
  for (const [name, content] of Object.entries(files)) {
    download(name, content);
  }
  // also emit a manifest
  const manifest = Object.keys(files).map((f) => `- ${f}`).join('\n');
  download(`${zipName}__manifest.txt`, manifest, 'text/plain');
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const scan = useMemo(() => scanCampaign(campaign), [campaign]);
  const csvs = useMemo(() => buildAdsEditorCsvs(campaign), [campaign]);
  const [showKeywords, setShowKeywords] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<Record<string, unknown> | null>(null);
  const pushFn = useServerFn(pushCampaignToGoogleAds);

  async function handlePush(dryRun: boolean) {
    if (!dryRun && !confirm(`LIVE push to Google Ads: create "${campaign.name}" (PAUSED) in your account?`)) return;
    setPushing(true);
    setPushResult(null);
    try {
      const r = await pushFn({ data: { campaignId: campaign.id, dryRun } });
      setPushResult(r as Record<string, unknown>);
    } catch (e) {
      setPushResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setPushing(false);
    }
  }

  const totalKeywords = campaign.adGroups.reduce((s, a) => s + a.keywords.length, 0);
  const totalHeadlines = campaign.adGroups.reduce((s, a) => s + a.headlines.length, 0);

  return (
    <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-xl font-bold text-white">{campaign.name}</h3>
          <p className="text-sm text-slate-400 mt-1">
            Landing:{' '}
            <a href={campaign.landingPage} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
              {campaign.landingPage}
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded text-xs font-semibold ${
              scan.ok ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'
            }`}
            aria-label={scan.ok ? 'Policy scan passed' : 'Policy scan failed'}
          >
            {scan.ok ? '✓ Policy-clean' : `✗ ${scan.hits.length} hit(s)`}
          </span>
          <span className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-200">
            £{campaign.dailyBudget}/day
          </span>
          <span className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-200">
            {campaign.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-sm">
        <div className="bg-slate-800 rounded p-3">
          <div className="text-slate-400">Ad Groups</div>
          <div className="text-white text-lg font-semibold">{campaign.adGroups.length}</div>
        </div>
        <div className="bg-slate-800 rounded p-3">
          <div className="text-slate-400">Keywords</div>
          <div className="text-white text-lg font-semibold">{totalKeywords}</div>
        </div>
        <div className="bg-slate-800 rounded p-3">
          <div className="text-slate-400">Headlines</div>
          <div className="text-white text-lg font-semibold">{totalHeadlines}</div>
        </div>
        <div className="bg-slate-800 rounded p-3">
          <div className="text-slate-400">Negatives</div>
          <div className="text-white text-lg font-semibold">{campaign.negativeKeywords.length}</div>
        </div>
      </div>

      {!scan.ok && (
        <div className="mb-4 rounded border-2 border-red-700 bg-red-950 p-3 text-sm">
          <div className="font-semibold text-red-200 mb-1">Banned-token hits:</div>
          <ul className="text-red-300 text-xs space-y-1 max-h-32 overflow-auto">
            {scan.hits.slice(0, 10).map((h, i) => (
              <li key={i}>
                <span className="font-mono text-red-200">[{h.token}]</span> in {h.where} → "{h.text}"
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => handlePush(false)}
          disabled={pushing || !scan.ok}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold text-sm"
          title={scan.ok ? 'Push to Google Ads (PAUSED)' : 'Fix policy hits first'}
        >
          {pushing ? '⏳ Pushing…' : '🚀 Push to Google Ads'}
        </button>
        <button
          onClick={() => handlePush(true)}
          disabled={pushing}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-xs"
          title="Build operations and show what would be sent — no API call"
        >
          🧪 Dry-run preview
        </button>
      </div>

      {pushResult && (
        <div
          className={`mb-3 rounded border-2 p-3 text-xs ${
            pushResult.ok ? 'border-emerald-700 bg-emerald-950' : 'border-red-700 bg-red-950'
          }`}
        >
          <div className={`font-semibold mb-1 ${pushResult.ok ? 'text-emerald-200' : 'text-red-200'}`}>
            {pushResult.ok ? '✓' : '✗'} {String(pushResult.mode ?? 'result')}
            {typeof pushResult.reason === 'string' && ` — ${pushResult.reason}`}
            {typeof pushResult.hint === 'string' && ` — ${pushResult.hint}`}
          </div>
          {typeof pushResult.deepLink === 'string' && (
            <a href={pushResult.deepLink} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
              Open in Google Ads →
            </a>
          )}
          <pre className="mt-2 max-h-64 overflow-auto text-slate-300 whitespace-pre-wrap break-all">
            {JSON.stringify(pushResult, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={() => downloadZip(csvs, campaign.id)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-semibold text-sm"
        >
          ⬇ Download all CSVs ({Object.keys(csvs).length})
        </button>
        {Object.entries(csvs).map(([name, content]) => (
          <button
            key={name}
            onClick={() => download(name, content)}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs"
          >
            {name.split('__')[1]?.replace('.csv', '') ?? name}
          </button>
        ))}
        <button
          onClick={() => setShowKeywords((s) => !s)}
          className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs"
        >
          {showKeywords ? 'Hide' : 'Show'} ad groups
        </button>
      </div>

      {showKeywords && (
        <div className="space-y-3 mt-3">
          {campaign.adGroups.map((ag) => (
            <details key={ag.name} className="bg-slate-800 rounded p-3">
              <summary className="cursor-pointer text-white font-semibold">
                {ag.name} <span className="text-slate-400 text-xs">(£{ag.maxCpc} max CPC)</span>
              </summary>
              <div className="mt-3 grid md:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-emerald-400 font-semibold mb-1">Keywords ({ag.keywords.length})</div>
                  <ul className="text-slate-300 space-y-0.5 font-mono">
                    {ag.keywords.map((k) => <li key={k}>{k}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-emerald-400 font-semibold mb-1">Headlines ({ag.headlines.length})</div>
                  <ul className="text-slate-300 space-y-0.5">
                    {ag.headlines.map((h) => (
                      <li key={h}>
                        {h} <span className="text-slate-500">({h.length})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-emerald-400 font-semibold mb-1">Descriptions ({ag.descriptions.length})</div>
                  <ul className="text-slate-300 space-y-1">
                    {ag.descriptions.map((d) => (
                      <li key={d}>
                        {d} <span className="text-slate-500">({d.length})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GoogleAdsTab() {
  const allScan = CAMPAIGNS.map(scanCampaign);
  const allClean = allScan.every((s) => s.ok);

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-white">Google Ads — Search Text Campaigns</h2>
        <p className="text-slate-400 text-sm mt-1">
          Standard <strong className="text-white">Search text ads</strong> (Responsive Search Ads) — no Google Merchant Center required. Two campaigns targeting{' '}
          <code className="text-emerald-400">/compound</code> and{' '}
          <code className="text-emerald-400">/landing/phlabs</code>. Download CSVs and import via{' '}
          Google Ads Editor → File → Import → Choose file. All campaigns ship PAUSED — review and enable.
        </p>
      </header>

      <div className="mb-4 rounded-lg border-2 border-blue-700 bg-blue-950 p-3 text-sm text-blue-200">
        <strong>ℹ️ Search-only — no Merchant Center</strong>{' '}
        These are classic text ads (headlines + descriptions) that appear in Google Search results. They do <strong>not</strong> use Google Merchant Center or Shopping ads, so product disapprovals in GMC do not block them.
      </div>

      <div
        className={`mb-4 rounded-lg p-3 border-2 ${
          allClean ? 'border-emerald-700 bg-emerald-950 text-emerald-200' : 'border-red-700 bg-red-950 text-red-200'
        }`}
        role="status"
      >
        <strong>{allClean ? '✓ All campaigns policy-clean' : '✗ Policy issues detected'}</strong>{' '}
        — banned-token scanner verifies headlines, descriptions, sitelinks and callouts against
        Google Ads pharma / medical triggers before download.
      </div>

      <div className="mb-6 rounded-lg border-2 border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
        <div className="font-semibold text-white mb-2">How to import into Google Ads Editor</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Download all 4 CSVs per campaign (structure, keywords, ads, extensions).</li>
          <li>Open Google Ads Editor → select your account.</li>
          <li><strong>Account → Import → From file</strong>, then pick CSVs one at a time.</li>
          <li>Review changes in the side panel, then <strong>Post</strong>.</li>
          <li>In Google Ads UI, set <strong>Status: Enabled</strong> when ready to launch.</li>
        </ol>
      </div>

      {CAMPAIGNS.map((c) => <CampaignCard key={c.id} campaign={c} />)}
    </div>
  );
}
