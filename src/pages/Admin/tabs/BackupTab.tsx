import { useState, useEffect } from 'react';
import {
  Download, Upload, CheckCircle2, AlertCircle, Loader2,
  HardDrive, Clock, FileArchive, Trash2, RefreshCw, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { db, storage, collection, getDocs, storageRef, uploadBytes, getDownloadURL, listAll, deleteObject, getMetadata } from '@/lib/firebase';
import JSZip from 'jszip';

interface BackupEntry {
  name: string;
  url: string;
  fullPath: string;
  size: number;
  createdAt: string;
}

const COLLECTIONS = ['products', 'orders', 'customers', 'coupons', 'siteSettings', 'adverts'];

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
}

export default function BackupTab() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const loadBackups = async () => {
    setListLoading(true);
    try {
      const folderRef = storageRef(storage, 'backups/');
      const result = await listAll(folderRef);
      const entries: BackupEntry[] = await Promise.all(
        result.items.map(async (item) => {
          const [url, meta] = await Promise.all([getDownloadURL(item), getMetadata(item)]);
          return {
            name: item.name,
            url,
            fullPath: item.fullPath,
            size: meta.size ?? 0,
            createdAt: meta.timeCreated ?? '',
          };
        })
      );
      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setBackups(entries);
    } catch (e: any) {
      // If no backups folder yet that's fine
      if (!e?.message?.includes('404')) console.error(e);
      setBackups([]);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { loadBackups(); }, []);

  const handleBackup = async () => {
    setLoading(true);
    setStatus(null);
    setProgress(null);
    try {
      const zip = new JSZip();
      const folder = zip.folder('backup');

      for (const col of COLLECTIONS) {
        setProgress(`Exporting ${col}…`);
        try {
          const snap = await getDocs(collection(db, col));
          const data: Record<string, any> = {};
          snap.forEach(d => { data[d.id] = d.data(); });
          folder!.file(`${col}.json`, JSON.stringify(data, null, 2));
        } catch {
          folder!.file(`${col}.json`, JSON.stringify({ error: 'collection not found or empty' }));
        }
      }

      // Metadata
      folder!.file('_meta.json', JSON.stringify({
        version: '1.0',
        createdAt: new Date().toISOString(),
        collections: COLLECTIONS,
        source: 'ProHealth Peptides Admin Backup',
      }, null, 2));

      setProgress('Compressing…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `backup_${ts}.zip`;

      setProgress('Uploading to Firebase Storage…');
      const fileRef = storageRef(storage, `backups/${filename}`);
      await uploadBytes(fileRef, blob, { contentType: 'application/zip' });

      setStatus({ type: 'success', msg: `Backup saved: ${filename} (${fmtBytes(blob.size)})` });
      await loadBackups();
    } catch (e: any) {
      console.error(e);
      setStatus({ type: 'error', msg: e?.message ?? 'Backup failed. Check Firebase Storage rules.' });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleDelete = async (entry: BackupEntry) => {
    if (!confirm(`Delete backup "${entry.name}"?`)) return;
    setDeleting(entry.fullPath);
    try {
      await deleteObject(storageRef(storage, entry.fullPath));
      setBackups(prev => prev.filter(b => b.fullPath !== entry.fullPath));
    } catch (e: any) {
      setStatus({ type: 'error', msg: e?.message ?? 'Delete failed' });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            Database Backups
          </h1>
          <p className="text-[#9cb8d9] text-sm mt-1">Export all Firestore collections as a ZIP archive saved to Firebase Storage</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadBackups}
            disabled={listLoading}
            className="flex items-center gap-2 px-3 py-2 bg-[#0f2640] hover:bg-[#1a3a5c] text-[#8caad4] rounded-xl text-sm transition-colors border border-white/[0.07]"
          >
            <RefreshCw className={`w-4 h-4 ${listLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleBackup}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors shadow-[0_4px_16px_rgba(37,99,235,0.35)]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {loading ? (progress ?? 'Working…') : 'Create Backup Now'}
          </button>
        </div>
      </div>

      {/* Status */}
      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
              status.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {status.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            <span>{status.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* What gets backed up */}
      <div className="bg-[#0b1a30]/80 border border-white/[0.07] rounded-2xl p-5">
        <h3 className="text-[#e8f0fe] font-semibold mb-3 flex items-center gap-2">
          <FileArchive className="w-4 h-4 text-blue-400" /> What's included
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {COLLECTIONS.map(col => (
            <div key={col} className="flex items-center gap-2 px-3 py-2 bg-[#04101f] border border-white/[0.05] rounded-lg text-[#9cb8d9] text-sm">
              <Shield className="w-3 h-3 text-blue-400 shrink-0" />
              {col}
            </div>
          ))}
        </div>
        <p className="text-[#2a4a7a] text-xs mt-3">Each collection is exported as a JSON file inside a single ZIP archive. Backups are stored in Firebase Storage under <code className="bg-white/5 px-1.5 py-0.5 rounded text-blue-400">backups/</code></p>
      </div>

      {/* Backup list */}
      <div className="bg-[#0b1a30]/80 border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-[#e8f0fe] font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" /> Saved Backups
            {!listLoading && (
              <span className="ml-1 text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-medium">
                {backups.length}
              </span>
            )}
          </h3>
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-[#9cb8d9] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading backups…
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-[#2a4a7a]">
            <HardDrive className="w-10 h-10 opacity-30" />
            <p className="text-sm">No backups yet — click "Create Backup Now" to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {backups.map((b, i) => (
              <motion.div
                key={b.fullPath}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <FileArchive className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[#e8f0fe] text-sm font-medium truncate">{b.name}</p>
                  <p className="text-[#2a4a7a] text-xs">{fmtDate(b.createdAt)} · {fmtBytes(b.size)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={b.url}
                    download={b.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-500/25 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 rotate-180" /> Download
                  </a>
                  <button
                    onClick={() => handleDelete(b)}
                    disabled={deleting === b.fullPath}
                    aria-label="Delete backup"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#2a4a7a] hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    {deleting === b.fullPath
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-400/80 text-xs leading-relaxed">
          Backups require Firebase Storage write access. If upload fails, verify your <code className="bg-white/5 px-1 rounded">storage.rules</code> allow writes to the <code className="bg-white/5 px-1 rounded">backups/</code> path for authenticated admins. Downloaded ZIP files can be used to restore data manually via the Firebase Console.
        </p>
      </div>

    </div>
  );
}
