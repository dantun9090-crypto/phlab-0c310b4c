/**
 * Lightweight modal + dropdown for the admin Templates gallery. Built on
 * framer-motion (already its own vendor chunk) instead of Radix so nothing
 * is added to the shared vendor-radix chunk the storefront loads.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}

export function AdminModal({ open, onClose, label, className = '', children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,button')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); prev?.focus?.(); };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={label} initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className={`w-full bg-[#0b1a30] border border-white/[0.12] rounded-2xl p-6 shadow-2xl text-[#f0f6ff] ${className}`}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface MenuItem { label: string; icon: React.ComponentType<{ className?: string }>; run: () => void; danger?: boolean }

export function AdminMenu({ label, trigger, items, className = '' }: { label: string; trigger: ReactNode; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#9cb8d9] hover:text-white">
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-10 z-30 min-w-40 rounded-xl border border-white/[0.12] bg-[#0b1a30] p-1 shadow-xl">
            {items.map((i) => (
              <li key={i.label}>
                <button type="button" role="menuitem" onClick={() => { setOpen(false); i.run(); }} className={`w-full min-h-[44px] flex items-center gap-2 px-3 rounded-lg text-sm hover:bg-white/[0.06] ${i.danger ? 'text-red-300' : 'text-[#f0f6ff]'}`}>
                  <i.icon className="w-4 h-4" />{i.label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
