/**
 * Internal e2e harness for the Orders detail modal centering / a11y.
 *
 * Re-creates the same modal wrapper used in `src/pages/Admin/tabs/OrdersTab.tsx`
 * (portalled to body, `fixed inset-0 z-[1000] flex items-center justify-center`)
 * without auth or Firestore, so Playwright can:
 *   - scroll the page far down
 *   - click "Open" and assert the panel is visually centered in the viewport
 *   - press Escape and assert focus returns to the trigger button
 *
 * Safety:
 *   - 404s on production hosts (apex + www) — preview / localhost only.
 *   - Carries `noindex, nofollow`.
 */
import { createFileRoute, notFound } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const LEGACY_APEX = ['prohealthpeptides', 'co', 'uk'].join('.');
const PROD_HOSTS = new Set([
  'phlabs.co.uk',
  'www.phlabs.co.uk',
  LEGACY_APEX,
  `www.${LEGACY_APEX}`,
]);

function isAllowedHost(host: string): boolean {
  if (!host) return false;
  return !PROD_HOSTS.has(host.toLowerCase());
}

export const Route = createFileRoute('/e2e/orders-modal')({
  head: () => ({
    meta: [
      { title: 'E2E Harness — Orders Modal' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  beforeLoad: ({ location }) => {
    const host = typeof window !== 'undefined' ? window.location.host : '';
    if (host && !isAllowedHost(host)) throw notFound();
    void location;
  },
  component: OrdersModalHarness,
});

function OrdersModalHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined' || !open) return;
    triggerRef.current = (document.activeElement as HTMLElement) || null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeBtnRef.current?.focus(), 30);
    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const getPanel = () => document.querySelector<HTMLElement>('[data-testid="orders-modal-panel"]');
    const focusables = () => {
      const panel = getPanel();
      if (!panel) return [] as HTMLElement[];
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); closeBtnRef.current?.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const panel = getPanel();
      const inside = !!(panel && active && panel.contains(active));
      if (!inside) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prev;
      const t = triggerRef.current;
      if (t && document.contains(t) && typeof t.focus === 'function') {
        try { t.focus(); } catch { /* ignore */ }
      }
      triggerRef.current = null;
    };
  }, [open]);

  return (
    <main className="min-h-dvh bg-[#060f1e] p-6 text-white">
      <h1 className="mb-4 text-xl font-bold">E2E: Orders Modal</h1>
      {/* External focusable element used to verify the focus trap does not escape. */}
      <button
        type="button"
        data-testid="outside-button"
        className="mb-4 min-h-[44px] rounded border border-slate-600 px-3"
      >
        Outside the modal
      </button>
      {/* Spacer so the page is scrollable — the modal must stay centered regardless. */}
      <div style={{ height: '2400px' }} className="rounded bg-slate-900/40 p-4 text-sm text-slate-400">
        Scroll spacer. Open trigger at the bottom.
      </div>
      <button
        type="button"
        data-testid="orders-modal-open"
        onClick={() => setOpen(true)}
        className="min-h-[48px] rounded-lg bg-emerald-500 px-4 font-semibold text-slate-950"
      >
        Open order modal
      </button>

      {typeof document !== 'undefined' && open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Order details"
          data-testid="orders-modal-overlay"
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            data-testid="orders-modal-panel"
            className="relative z-[1001] bg-[#04101f] border border-white/[0.08] rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl p-6"
          >
            <h2 className="text-lg font-bold">Mock order #ABCDEFGH</h2>
            <p className="mt-2 text-sm text-slate-300">Centered, escape-closable, focus-restoring.</p>
            <button
              ref={closeBtnRef}
              type="button"
              data-testid="orders-modal-close"
              onClick={() => setOpen(false)}
              className="mt-4 min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-900 px-4 font-semibold text-slate-200"
            >
              Close
            </button>
            <button
              type="button"
              data-testid="orders-modal-action"
              className="mt-4 ml-2 min-h-[48px] rounded-lg bg-emerald-500 px-4 font-semibold text-slate-950"
            >
              Action
            </button>
            <a
              href="#noop"
              data-testid="orders-modal-link"
              className="mt-4 ml-2 inline-block min-h-[48px] rounded-lg border border-slate-600 px-4 py-2 font-semibold text-slate-200"
              onClick={(e) => e.preventDefault()}
            >
              Link
            </a>
          </div>
        </div>,
        document.body,
      )}
    </main>
  );
}
