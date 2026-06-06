import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, MessageSquare, Package, Mail, BarChart3, Copy, Check, AlertCircle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { aiAdminChat } from '@/lib/ai-admin.functions';

type Mode = 'chat' | 'product_copy' | 'email_draft' | 'insights';
interface Msg { role: 'user' | 'assistant'; content: string; }

const MODES: { id: Mode; label: string; icon: typeof Sparkles; placeholder: string; intro: string }[] = [
  {
    id: 'chat',
    label: 'Assistant',
    icon: MessageSquare,
    placeholder: 'Ask about orders, customers, SEO, compliance…',
    intro: 'Ask anything about running the PH Labs shop. The assistant knows the brand, compliance rules, and admin context.',
  },
  {
    id: 'product_copy',
    label: 'Product Copy',
    icon: Package,
    placeholder: 'e.g. BPC-157 5mg, tissue-repair category, molecular weight 1419.5',
    intro: 'Describe a product (name, category, weight, key research notes) and the assistant will draft SEO title, meta, description, bullets, and the compliance disclaimer.',
  },
  {
    id: 'email_draft',
    label: 'Email Draft',
    icon: Mail,
    placeholder: 'e.g. Draft a reply to a customer asking about delayed shipping due to weather…',
    intro: 'Describe the recipient and what the email should say. Brand tone, British English, signed off as the PH Labs Team.',
  },
  {
    id: 'insights',
    label: 'Order Insights',
    icon: BarChart3,
    placeholder: 'Ask: "Summarise today" — or leave blank and press Generate.',
    intro: 'Pulls the latest 50 orders + recent customers + product stock from the database and asks the AI to produce a briefing.',
  },
];

export default function AIAssistantTab() {
  const [mode, setMode] = useState<Mode>('chat');
  const [messages, setMessages] = useState<Record<Mode, Msg[]>>({
    chat: [], product_copy: [], email_draft: [], insights: [],
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const active = MODES.find((m) => m.id === mode)!;
  const thread = messages[mode];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread, loading]);
  useEffect(() => { textareaRef.current?.focus(); }, [mode]);

  const send = async () => {
    const text = input.trim();
    // Insights mode can run with no text input — uses live DB context
    if (!text && mode !== 'insights') return;
    setError(null);
    setLoading(true);

    const userMsg: Msg = { role: 'user', content: text || 'Generate a current operational briefing.' };
    const nextThread = [...thread, userMsg];
    setMessages((m) => ({ ...m, [mode]: nextThread }));
    setInput('');

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await aiAdminChat({
        data: { idToken, mode, messages: nextThread.map((m) => ({ role: m.role, content: m.content })) },
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        setMessages((m) => ({ ...m, [mode]: [...nextThread, { role: 'assistant', content: res.text }] }));
      }
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const copy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const clear = () => setMessages((m) => ({ ...m, [mode]: [] }));

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-[0_4px_16px_rgba(99,102,241,0.4)]">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-white text-xl font-bold">AI Assistant</h1>
          <p className="text-[#7a96b8] text-xs">Powered by Lovable AI · Admin only · {MODEL_LABEL}</p>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all min-h-[48px] ${
                active
                  ? 'bg-blue-600/15 border-blue-500/50 text-white shadow-[0_2px_12px_rgba(59,130,246,0.2)]'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Card */}
      <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: '60vh' }}>
        {/* Intro / messages */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
          {thread.length === 0 && (
            <div className="text-center py-10">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center mb-3">
                <active.icon className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-slate-300 text-sm max-w-md mx-auto leading-relaxed">{active.intro}</p>
            </div>
          )}

          {thread.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 border border-slate-700 text-slate-100'
              }`}>
                <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">{m.content}</div>
                {m.role === 'assistant' && (
                  <button
                    onClick={() => copy(m.content, i)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors"
                  >
                    {copiedIdx === i ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-900/30 border border-red-700 text-red-200 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t-2 border-slate-700 p-3 lg:p-4 bg-slate-900">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={active.placeholder}
              rows={2}
              disabled={loading}
              className="flex-1 resize-none border-2 border-slate-600 bg-slate-800 text-white placeholder:text-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 min-h-[48px] disabled:opacity-60"
            />
            <button
              onClick={send}
              disabled={loading || (!input.trim() && mode !== 'insights')}
              className="shrink-0 min-h-[48px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline">{mode === 'insights' && !input.trim() ? 'Generate' : 'Send'}</span>
            </button>
          </div>
          <div className="flex justify-between items-center mt-2">
            <p className="text-[10px] text-slate-500">Enter to send · Shift+Enter for newline</p>
            {thread.length > 0 && (
              <button onClick={clear} className="text-xs text-slate-500 hover:text-red-400 transition-colors">Clear conversation</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const MODEL_LABEL = 'Gemini 3 Flash';
