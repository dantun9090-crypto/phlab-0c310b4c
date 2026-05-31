import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import { getMailHealth, type MailHealth, type DeliveryEvent } from '@/lib/mail-health.functions';
import {
  Mail, RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle,
  Server, Shield, Inbox, Forward, Search,
} from 'lucide-react';

const STATUS_META: Record<string, { label: string; cls: string; Icon: any }> = {
  success: { label: 'Delivered', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', Icon: CheckCircle2 },
  defer:   { label: 'Deferred',  cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',       Icon: Clock },
  failure: { label: 'Failed',    cls: 'bg-red-500/10 text-red-300 border-red-500/30',             Icon: XCircle },
  rejected:{ label: 'Rejected',  cls: 'bg-red-500/10 text-red-300 border-red-500/30',             Icon: XCircle },
};

function statusKey(s: string): keyof typeof STATUS_META | 'other' {
  const x = s.toLowerCase();
  if (x.includes('success') || x.includes('deliver')) return 'success';
  if (x.includes('defer')) return 'defer';
  if (x.includes('reject')) return 'rejected';
  if (x.includes('fail')) return 'failure';
  return 'other';
}

export default function MailHealthTab() {
  const [data, setData] = useState<MailHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'failure' | 'defer' | 'success'>('all');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await getMailHealth({ data: { idToken } });
      setData(res);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo<DeliveryEvent[]>(() => {
    if (!data) return [];
    return data.events.filter((e) => {
      const k = statusKey(e.status);
      if (filter !== 'all' && k !== filter) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const hay = `${e.sender} ${e.recipient} ${e.result}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [data, filter, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Mail className="w-6 h-6 text-blue-400" /> Mail Health — phlabs.co.uk
          </h1>
          <p className="text-[#9cb8d9] text-sm mt-1">
            Live status of the mail server, mailboxes, DNS records and recent delivery events (last 24h).
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 text-sm">
          {err}
        </div>
      )}

      {loading && !data && <div className="text-center py-12 text-[#9cb8d9]">Loading…</div>}

      {data && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Events 24h" value={data.counts.total} tone="slate" />
            <Stat label="Delivered" value={data.counts.success} tone="emerald" />
            <Stat label="Deferred" value={data.counts.defer} tone="amber" />
            <Stat label="Failed / Rejected" value={data.counts.failure + data.counts.rejected} tone="red" />
          </div>

          {/* DNS */}
          <Card title="DNS records" Icon={Shield}>
            <Row label="MX">
              {data.dns.mx.length ? data.dns.mx.map((m, i) => (
                <div key={i} className="font-mono text-xs text-emerald-300">{m}</div>
              )) : <span className="text-red-300 text-xs">No MX records found</span>}
            </Row>
            <Row label="SPF">
              {data.dns.spf.length ? data.dns.spf.map((s, i) => (
                <div key={i} className="font-mono text-[11px] text-[#9cb8d9] break-all">{s}</div>
              )) : <span className="text-amber-300 text-xs">No SPF record</span>}
            </Row>
            <Row label="DMARC">
              {data.dns.dmarc.length ? data.dns.dmarc.map((s, i) => (
                <div key={i} className="font-mono text-[11px] text-[#9cb8d9] break-all">{s}</div>
              )) : <span className="text-amber-300 text-xs">No DMARC record</span>}
            </Row>
          </Card>

          {/* Mailboxes */}
          <Card title={`Mailboxes (${data.mailboxes.length})`} Icon={Inbox}>
            <div className="space-y-2">
              {data.mailboxes.map((m) => (
                <div key={m.email} className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0">
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">{m.email}</div>
                    <div className="text-[#3a5a82] text-xs">{m.diskUsedHuman} / {m.diskQuotaHuman}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.suspendedIncoming && <span className="px-2 py-0.5 bg-red-500/10 text-red-300 text-[10px] rounded border border-red-500/30">RX suspended</span>}
                    {m.suspendedLogin && <span className="px-2 py-0.5 bg-red-500/10 text-red-300 text-[10px] rounded border border-red-500/30">Login suspended</span>}
                    {!m.suspendedIncoming && !m.suspendedLogin && (
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 text-[10px] rounded border border-emerald-500/30">Active</span>
                    )}
                  </div>
                </div>
              ))}
              {!data.mailboxes.length && <p className="text-[#9cb8d9] text-sm">No mailboxes found.</p>}
            </div>
          </Card>

          {/* Forwarders */}
          {data.forwarders.length > 0 && (
            <Card title={`Forwarders (${data.forwarders.length})`} Icon={Forward}>
              <div className="space-y-1">
                {data.forwarders.map((f, i) => (
                  <div key={i} className="text-xs text-[#9cb8d9] flex items-center gap-2">
                    <span className="font-mono text-white">{f.dest}</span>
                    <span className="text-[#3a5a82]">→</span>
                    <span className="font-mono">{f.forward}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Events */}
          <Card title="Recent delivery events (24h)" Icon={Server}>
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <div className="flex bg-[#04101f]/70 border border-white/[0.08] rounded-lg overflow-hidden">
                {(['all', 'failure', 'defer', 'success'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${filter === t ? 'bg-blue-500/20 text-blue-300' : 'text-[#9cb8d9] hover:bg-white/[0.04]'}`}
                  >
                    {t === 'all' ? 'All' : t === 'failure' ? 'Failed' : t === 'defer' ? 'Deferred' : 'Delivered'}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a5a82]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by email, message…"
                  className="w-full pl-9 pr-3 py-1.5 bg-[#04101f]/70 border border-white/[0.08] rounded-lg text-white text-sm placeholder-[#3a5a82] focus:outline-none focus:border-blue-500/40"
                />
              </div>
              <span className="text-xs text-[#3a5a82]">{filtered.length} match{filtered.length === 1 ? '' : 'es'}</span>
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-[#9cb8d9] text-sm py-8">No events match.</p>
            ) : (
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[#3a5a82] text-[10px] uppercase tracking-wider">
                      <th className="text-left px-4 py-2 font-semibold">Time</th>
                      <th className="text-left px-4 py-2 font-semibold">Status</th>
                      <th className="text-left px-4 py-2 font-semibold">From → To</th>
                      <th className="text-left px-4 py-2 font-semibold">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e, i) => {
                      const k = statusKey(e.status);
                      const meta = STATUS_META[k as keyof typeof STATUS_META] ?? {
                        label: e.status, cls: 'bg-slate-500/10 text-slate-300 border-slate-500/30', Icon: AlertCircle,
                      };
                      const Icon = meta.Icon;
                      return (
                        <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-[#9cb8d9] text-xs whitespace-nowrap">
                            {e.time ? new Date(e.time * 1000).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' }) : '—'}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border rounded-md text-[11px] font-medium ${meta.cls}`}>
                              <Icon className="w-3 h-3" /> {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <div className="text-[#9cb8d9] truncate max-w-[220px]" title={e.sender}>{e.sender || '—'}</div>
                            <div className="text-white truncate max-w-[220px]" title={e.recipient}>{e.recipient || '—'}</div>
                          </td>
                          <td className="px-4 py-2 text-[11px] text-[#9cb8d9] max-w-[360px] truncate" title={e.result}>
                            {e.result || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {data.errors.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <p className="text-amber-300 text-xs font-semibold mb-1">Partial data — some sources failed:</p>
              <ul className="text-[11px] text-amber-200/80 font-mono space-y-0.5">
                {data.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-[#3a5a82] text-right">
            Generated {new Date(data.generatedAt).toLocaleString('en-GB')}
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'amber' | 'red' }) {
  const cls = {
    slate:   'bg-[#04101f]/70 border-white/[0.08]   text-white',
    emerald: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300',
    amber:   'bg-amber-500/5   border-amber-500/20   text-amber-300',
    red:     'bg-red-500/5     border-red-500/20     text-red-300',
  }[tone];
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function Card({ title, Icon, children }: { title: string; Icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-xl p-4">
      <p className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
        <Icon className="w-4 h-4 text-blue-400" /> {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2 border-b border-white/[0.04] last:border-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3a5a82] mb-1">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
