import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight, Command as CmdIcon, RefreshCw, ExternalLink, LogOut, Cloud } from 'lucide-react';

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  action: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}

export default function CommandPalette({ open, onClose, items }: Props) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items
      .map((it) => {
        const hay = `${it.label} ${it.group} ${it.keywords ?? ''}`.toLowerCase();
        let score = 0;
        if (hay.includes(needle)) score += 10;
        if (it.label.toLowerCase().startsWith(needle)) score += 20;
        // subsequence match (fuzzy)
        let i = 0;
        for (const ch of hay) {
          if (ch === needle[i]) i++;
          if (i === needle.length) break;
        }
        if (i === needle.length) score += 5;
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.it);
  }, [q, items]);

  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[active];
        if (item) { item.action(); onClose(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, active, onClose]);

  // scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-start justify-center px-4 pt-[12vh]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, #0a1628 0%, #04101f 100%)',
              border: '1px solid rgba(59,130,246,0.25)',
              boxShadow: '0 20px 60px -10px rgba(0,0,0,0.8), 0 0 0 1px rgba(59,130,246,0.1)',
            }}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 h-14 border-b border-white/5">
              <Search className="w-4 h-4 text-blue-400/70 shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Jump to a tab or action…"
                className="flex-1 bg-transparent outline-none text-white placeholder:text-[#3a5a82] text-[14px]"
              />
              <kbd className="text-[10px] font-mono text-[#3a5a82] border border-white/10 rounded px-1.5 py-0.5">esc</kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-[#3a5a82] text-sm">No matches</div>
              ) : (
                (() => {
                  const groups: Record<string, CommandItem[]> = {};
                  filtered.forEach((it) => { (groups[it.group] ||= []).push(it); });
                  let runningIdx = -1;
                  return Object.entries(groups).map(([group, list]) => (
                    <div key={group} className="mb-1">
                      <div className="px-4 py-1 text-[9px] font-semibold tracking-widest uppercase text-blue-400/40">
                        {group}
                      </div>
                      {list.map((it) => {
                        runningIdx++;
                        const idx = runningIdx;
                        const Icon = it.icon ?? ArrowRight;
                        const isActive = idx === active;
                        return (
                          <button
                            key={it.id}
                            data-idx={idx}
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => { it.action(); onClose(); }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                            style={{ background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent' }}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-300' : 'text-[#9cb8d9]'}`} />
                            <span className={`flex-1 text-[13px] ${isActive ? 'text-white' : 'text-[#cfdcef]'}`}>{it.label}</span>
                            {it.shortcut && (
                              <kbd className="text-[10px] font-mono text-[#3a5a82] border border-white/10 rounded px-1.5 py-0.5">{it.shortcut}</kbd>
                            )}
                            {isActive && <ArrowRight className="w-3.5 h-3.5 text-blue-300" />}
                          </button>
                        );
                      })}
                    </div>
                  ));
                })()
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 h-9 border-t border-white/5 text-[10px] text-[#3a5a82]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><kbd className="font-mono border border-white/10 rounded px-1">↑</kbd><kbd className="font-mono border border-white/10 rounded px-1">↓</kbd> navigate</span>
                <span className="flex items-center gap-1"><kbd className="font-mono border border-white/10 rounded px-1">↵</kbd> open</span>
              </div>
              <div className="flex items-center gap-1">
                <CmdIcon className="w-3 h-3" />
                <span>Command Palette</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const QuickActionIcons = { RefreshCw, ExternalLink, LogOut, Cloud };
