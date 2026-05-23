import { useState, useEffect } from 'react';

import { db, collection, getDocs, addDoc, deleteDoc, doc, setDoc, getDoc } from '@/lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, Wifi, AlertTriangle, CheckCircle, Loader2, ToggleLeft, ToggleRight, Copy, RefreshCw } from 'lucide-react';

interface IpEntry {
  id: string;
  ip: string;
  label: string;
  addedAt: string;
}

async function fetchMyIp(): Promise<string> {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip || '';
  } catch {
    return '';
  }
}

export default function IpWhitelistTab() {
  const [entries, setEntries] = useState<IpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [myIp, setMyIp] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addError, setAddError] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Load enabled flag
      const cfgSnap = await getDoc(doc(db, 'settings', 'ipWhitelist'));
      if (cfgSnap.exists()) {
        setEnabled(cfgSnap.data()?.enabled === true);
      }
      // Load IP entries
      const snap = await getDocs(collection(db, 'ipWhitelist'));
      const list: IpEntry[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as IpEntry));
      setEntries(list.sort((a, b) => a.addedAt?.localeCompare(b.addedAt ?? '') ?? 0));
    } catch (e) {
      showToast('Failed to load whitelist', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    fetchMyIp().then(setMyIp);
  }, []);

  const validateIp = (ip: string) => {
    // IPv4
    const v4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    // IPv6 loose check
    const v6 = /^[0-9a-fA-F:]+$/;
    return v4.test(ip.trim()) || v6.test(ip.trim());
  };

  const handleAdd = async () => {
    setAddError('');
    const ip = newIp.trim();
    if (!ip) { setAddError('Enter an IP address'); return; }
    if (!validateIp(ip)) { setAddError('Invalid IP format (e.g. 1.2.3.4 or 1.2.3.0/24)'); return; }
    if (entries.some(e => e.ip === ip)) { setAddError('This IP is already in the list'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'ipWhitelist'), {
        ip,
        label: newLabel.trim() || 'No label',
        addedAt: new Date().toISOString(),
      });
      setNewIp('');
      setNewLabel('');
      await loadData();
      showToast(`IP ${ip} added to whitelist`);
    } catch {
      showToast('Failed to add IP', 'error');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, ip: string) => {
    if (!confirm(`Remove ${ip} from whitelist?`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'ipWhitelist', id));
      await loadData();
      showToast(`Removed ${ip}`);
    } catch {
      showToast('Failed to remove IP', 'error');
    }
    setSaving(false);
  };

  const handleToggle = async () => {
    const next = !enabled;
    if (next && entries.length === 0) {
      showToast('Add at least one IP before enabling the guard — or you will lock yourself out!', 'error');
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'ipWhitelist'), { enabled: next }, { merge: true });
      setEnabled(next);
      showToast(next ? 'IP guard ENABLED — only whitelisted IPs can open Admin' : 'IP guard disabled');
    } catch {
      showToast('Failed to update setting', 'error');
    }
    setSaving(false);
  };

  const handleAddMyIp = () => {
    if (myIp) { setNewIp(myIp); setNewLabel('My IP'); }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl text-sm font-medium border ${
              toast.type === 'success'
                ? 'bg-[#0b2a1a] border-green-500/30 text-green-300'
                : 'bg-[#2a0b0b] border-red-500/30 text-red-300'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#f0f6ff]">IP Whitelist Guard</h2>
            <p className="text-xs text-[#3a5a82]">Block Admin panel access from unrecognised IPs</p>
          </div>
        </div>
        <button onClick={loadData} aria-label="Refresh IP whitelist" className="p-2 rounded-lg hover:bg-white/[0.04] text-[#3a5a82] hover:text-[#6b8fba] transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Warning banner */}
      <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-200/80 space-y-1">
          <p className="font-semibold text-amber-300">Read before enabling</p>
          <p>Always add your own IP first. If the guard is on and your IP is not listed, you will be locked out of Admin. Home &amp; Shop pages are never affected — only the /admin route.</p>
        </div>
      </div>

      {/* Enable / Disable toggle */}
      <div className="flex items-center justify-between p-5 bg-[#04101f] border border-white/[0.07] rounded-2xl">
        <div>
          <p className="text-[#f0f6ff] font-semibold text-sm">Guard status</p>
          <p className="text-xs text-[#3a5a82] mt-0.5">
            {enabled ? 'Admin is protected — only whitelisted IPs allowed' : 'Guard is off — anyone with admin credentials can access'}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          aria-label={`IP whitelist guard: ${enabled ? 'enabled' : 'disabled'}`}
          aria-pressed={enabled}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
            enabled
              ? 'bg-green-500/10 border-green-500/30 text-green-300 hover:bg-green-500/20'
              : 'bg-white/[0.04] border-white/[0.08] text-[#6b8fba] hover:border-blue-500/30 hover:text-blue-300'
          }`}
        >
          {enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {/* My current IP */}
      <div className="flex items-center gap-3 p-4 bg-[#04101f] border border-white/[0.07] rounded-xl">
        <Wifi className="w-4 h-4 text-[#3a5a82] shrink-0" />
        <div className="flex-1">
          <p className="text-xs text-[#3a5a82]">Your current IP address</p>
          <p className="text-[#f0f6ff] font-mono text-sm">{myIp || 'Detecting…'}</p>
        </div>
        {myIp && (
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(myIp); showToast('Copied to clipboard'); }}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[#3a5a82] hover:text-[#6b8fba] transition-colors"
              title="Copy IP"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleAddMyIp}
              className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 rounded-lg text-xs font-medium transition-all"
            >
              + Add my IP
            </button>
          </div>
        )}
      </div>

      {/* Add new IP */}
      <div className="p-5 bg-[#04101f] border border-white/[0.07] rounded-2xl space-y-4">
        <p className="text-sm font-semibold text-[#f0f6ff]">Add allowed IP</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={newIp}
              onChange={e => { setNewIp(e.target.value); setAddError(''); }}
              placeholder="e.g. 1.2.3.4 or 1.2.3.0/24"
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Home Office)"
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !newIp.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
        {addError && <p className="text-red-400 text-xs">{addError}</p>}
      </div>

      {/* IP List */}
      <div className="bg-[#04101f] border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
          <p className="text-sm font-semibold text-[#f0f6ff]">Allowed IPs</p>
          <span className="text-xs text-[#3a5a82] bg-white/[0.04] px-2.5 py-1 rounded-full">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <Shield className="w-8 h-8 text-[#1a3a5c] mb-3" />
            <p className="text-[#3a5a82] text-sm">No IPs added yet</p>
            <p className="text-[#1a3a5c] text-xs mt-1">Add your IP above before enabling the guard</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {entries.map(entry => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${entry.ip === myIp ? 'bg-green-400' : 'bg-blue-400/50'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[#f0f6ff] font-mono text-sm">{entry.ip}
                    {entry.ip === myIp && <span className="ml-2 text-xs text-green-400/80 font-sans">you</span>}
                  </p>
                  <p className="text-[#3a5a82] text-xs truncate">{entry.label}</p>
                </div>
                <p className="text-[#2a4a7a] text-xs hidden sm:block shrink-0">
                  {entry.addedAt ? new Date(entry.addedAt).toLocaleDateString('en-GB') : '—'}
                </p>
                <button
                  onClick={() => handleDelete(entry.id, entry.ip)}
                  disabled={saving}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-all"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="text-xs text-[#2a4a7a] space-y-1 pb-4">
        <p>IP check runs in the browser before the admin UI loads. It is a deterrent layer — for military-grade security, combine with Firestore Rules (already deployed) and Cloudflare WAF.</p>
        <p>CIDR ranges (e.g. 192.168.1.0/24) are supported for office networks.</p>
      </div>
    </div>
  );
}
