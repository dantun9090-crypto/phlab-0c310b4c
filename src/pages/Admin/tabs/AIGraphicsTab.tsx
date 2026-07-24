import { useState, useEffect } from 'react';
import { Image as ImageIcon, Sparkles, Loader2, Download, Copy, Check, AlertCircle, Cloud, RefreshCw, Wand2 } from 'lucide-react';
import { auth, storage, storageRef, uploadBytesResumable, getDownloadURL, listAll } from '@/lib/firebase';
import { aiGenerateImage } from '@/lib/ai-image.functions';

type Model = '@cf/black-forest-labs/flux-1-schnell' | '@cf/black-forest-labs/flux-2-dev';

interface Generated {
  base64: string;
  prompt: string;
  enhancedPrompt?: string;
}
interface LibraryItem {
  url: string;
  name: string;
}

const MODELS: { id: Model; label: string; hint: string }[] = [
  { id: '@cf/black-forest-labs/flux-1-schnell', label: 'Fast (Flux Schnell)', hint: '~5s per image, good quality' },
  { id: '@cf/black-forest-labs/flux-2-dev', label: 'Best (Flux 2 Dev)', hint: 'slower, highest quality' },
];

function base64ToBlob(base64: string, type = 'image/jpeg'): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export default function AIGraphicsTab() {
  const [prompt, setPrompt] = useState('');
  const [enhance, setEnhance] = useState(true);
  const [model, setModel] = useState<Model>('@cf/black-forest-labs/flux-1-schnell');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Generated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const loadLibrary = async () => {
    setLibraryLoading(true);
    try {
      const res = await listAll(storageRef(storage, 'ai-generated'));
      const items = await Promise.all(
        res.items.slice(-24).reverse().map(async (r) => ({
          name: r.name,
          url: await getDownloadURL(r),
        })),
      );
      setLibrary(items);
    } catch {
      setLibrary([]);
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => { void loadLibrary(); }, []);

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setError(null);
    setSavedUrl(null);
    setGenerating(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await aiGenerateImage({
        data: { idToken, prompt: prompt.trim(), enhance, model },
      });
      if (!res.ok) {
        setError(res.error);
        if (res.prompt) setResult(null);
      } else {
        setResult({ base64: res.base64, prompt: res.prompt, enhancedPrompt: res.enhancedPrompt });
      }
    } catch (e: any) {
      setError(e?.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!result || saving) return;
    setSaving(true);
    setError(null);
    try {
      const blob = base64ToBlob(result.base64);
      const name = `${Date.now()}.jpg`;
      const ref = storageRef(storage, `ai-generated/${name}`);
      const task = uploadBytesResumable(ref, blob, { contentType: 'image/jpeg' });
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', undefined, reject, () => resolve());
      });
      const url = await getDownloadURL(ref);
      setSavedUrl(url);
      setLibrary((lib) => [{ url, name }, ...lib]);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-[0_4px_16px_rgba(168,85,247,0.4)]">
          <ImageIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-white text-xl font-bold">AI Graphics</h1>
          <p className="text-[#7a96b8] text-xs">Cloudflare Workers AI (Flux) · images save to Firebase Storage · laboratory aesthetic only, no medical imagery</p>
        </div>
      </div>

      {/* Composer */}
      <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-4 lg:p-5 mb-5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image… e.g. hero banner with lyophilised vials on a dark navy lab bench, teal accent lighting"
          rows={3}
          disabled={generating}
          className="w-full resize-none border-2 border-slate-600 bg-slate-800 text-white placeholder:text-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-violet-500 disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enhance}
              onChange={(e) => setEnhance(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-violet-500"
            />
            <Wand2 className="w-3.5 h-3.5 text-violet-400" />
            Kimi improves my prompt (compliance-safe)
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as Model)}
            className="text-xs bg-slate-800 border-2 border-slate-600 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={generating || !prompt.trim()}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 mb-5 rounded-xl bg-red-900/30 border border-red-700 text-red-200 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-4 lg:p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <img
              src={`data:image/jpeg;base64,${result.base64}`}
              alt="AI generated"
              className="w-full rounded-xl border border-slate-700"
            />
            <div className="flex flex-col gap-3">
              {result.enhancedPrompt && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Enhanced prompt</p>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-800 border border-slate-700 rounded-lg p-3">{result.enhancedPrompt}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-auto">
                <button
                  onClick={save}
                  disabled={saving || Boolean(savedUrl)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedUrl ? <Check className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                  {savedUrl ? 'Saved to library' : saving ? 'Saving…' : 'Save to library'}
                </button>
                {savedUrl && (
                  <button
                    onClick={() => copy(savedUrl)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
                  >
                    {copiedUrl === savedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    Copy URL
                  </button>
                )}
              </div>
              {savedUrl && (
                <p className="text-[10px] text-slate-500 break-all">{savedUrl}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Library */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white text-sm font-bold">Library <span className="text-slate-500 font-normal">(ai-generated/)</span></h2>
        <button onClick={() => void loadLibrary()} className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1.5 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${libraryLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {libraryLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>
      ) : library.length === 0 ? (
        <p className="text-slate-500 text-sm py-6 text-center">No generated images yet — your saved images will appear here.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {library.map((item) => (
            <div key={item.name} className="group relative rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-900">
              <img src={item.url} alt={item.name} loading="lazy" className="w-full aspect-square object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 p-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-7 h-7 rounded-lg bg-slate-800/90 flex items-center justify-center text-slate-300 hover:text-white"
                  title="Open full size"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => copy(item.url)}
                  className="w-7 h-7 rounded-lg bg-slate-800/90 flex items-center justify-center text-slate-300 hover:text-white"
                  title="Copy URL"
                >
                  {copiedUrl === item.url ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
