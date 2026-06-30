import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Package } from 'lucide-react';
import { useLiveOrders } from '@/hooks/useLiveOrders';
import { formatLivePopupText, type LiveOrder } from '@/lib/orderFormatter';
import { auth } from '@/lib/firebase';

interface PopupState {
  order: LiveOrder | null;
  visible: boolean;
}

const HIDDEN_ROUTES = ['/checkout', '/cart', '/success', '/account', '/login'];
const AUTO_DISMISS_MS = 5500;
const ROTATE_INTERVAL_MS = 3000;
const DEBOUNCE_MS = 1500;
const SNOOZE_MS = 60_000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const isDebug = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem('livePopupDebug') === '1') return true;
    if (new URLSearchParams(window.location.search).get('livePopupDebug') === '1') {
      window.localStorage?.setItem('livePopupDebug', '1');
      return true;
    }
  } catch {}
  return false;
};
const dlog = (...args: unknown[]) => {
  if (isDebug()) console.log('[LiveSalesPopup]', ...args);
};

export default function LiveSalesPopup() {
  const pathname = useLocation().pathname;
  const { recentOrders, latestNewOrder } = useLiveOrders();
  const [state, setState] = useState<PopupState>({ order: null, visible: false });
  const [hovered, setHovered] = useState(false);
  const snoozeUntilRef = useRef<number>(0);
  const lastTriggerRef = useRef<number>(0);
  const queueRef = useRef<LiveOrder[]>([]);
  const rotateIdxRef = useRef<number>(0);
  const dismissTimerRef = useRef<number | null>(null);
  const rotateTimerRef = useRef<number | null>(null);
  const visibleRef = useRef<boolean>(false);
  const eligibleRef = useRef<LiveOrder[]>([]);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const isHiddenRoute = HIDDEN_ROUTES.some((r) => pathname.startsWith(r));
  const currentUid = auth.currentUser?.uid;

  // Filter eligible orders (recent, not own). Refreshed live via sanitized API.
  const eligible = useMemo(() => {
    const cutoff = Date.now() - MAX_AGE_MS;
    const list = recentOrders.filter((o) => {
      const hasUsableTime = Number.isFinite(o.createdAtMs) && o.createdAtMs > 0;
      return (!hasUsableTime || o.createdAtMs >= cutoff) && (!currentUid || o.userId !== currentUid);
    });
    dlog('pool refresh — recentOrders:', recentOrders.length, 'eligible:', list.length, list);
    return list;
  }, [recentOrders, currentUid]);

  // Keep ref in sync so the rotation interval always sees the freshest pool
  // without tearing down on every snapshot.
  useEffect(() => {
    eligibleRef.current = eligible;
  }, [eligible]);

  // Track visibility for single-popup lock inside interval closures.
  useEffect(() => {
    visibleRef.current = state.visible;
  }, [state.visible]);


  const clearDismissTimer = () => {
    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  const scheduleDismiss = () => {
    clearDismissTimer();
    dismissTimerRef.current = window.setTimeout(() => {
      setState((s) => ({ ...s, visible: false }));
    }, AUTO_DISMISS_MS);
  };

  const showOrder = (order: LiveOrder) => {
    const now = Date.now();
    if (visibleRef.current) {
      // Single-popup lock: never stack a second toast over a visible one.
      if (!queueRef.current.find((o) => o.id === order.id)) queueRef.current.push(order);
      dlog('skip (popup already visible) — queued:', order.id);
      return;
    }
    if (now - lastTriggerRef.current < DEBOUNCE_MS) {
      if (!queueRef.current.find((o) => o.id === order.id)) queueRef.current.push(order);
      dlog('skip (debounce) — queued:', order.id);
      return;
    }
    lastTriggerRef.current = now;
    dlog('show order:', order.id, order);
    setState({ order, visible: true });
    scheduleDismiss();
  };

  // New order arrival
  useEffect(() => {
    if (!latestNewOrder || isHiddenRoute) return;
    if (Date.now() < snoozeUntilRef.current) return;
    if (currentUid && latestNewOrder.userId === currentUid) return;
    dlog('new order arrived:', latestNewOrder.id);
    showOrder(latestNewOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestNewOrder]);

  // Rotation through recent orders. Uses refs so the interval picks up the
  // newest pool without resetting every Firestore snapshot.
  useEffect(() => {
    if (isHiddenRoute) return;
    const tick = () => {
      if (hovered) return;
      if (visibleRef.current) {
        dlog('tick skipped — popup still visible');
        return;
      }
      if (Date.now() < snoozeUntilRef.current) return;
      const next = queueRef.current.shift();
      if (next) {
        dlog('tick — from queue:', next.id);
        lastTriggerRef.current = Date.now();
        setState({ order: next, visible: true });
        scheduleDismiss();
        return;
      }
      const pool = eligibleRef.current.slice(0, 20);
      if (pool.length === 0) {
        dlog('tick — pool empty');
        return;
      }
      const order = pool[Math.floor(Math.random() * pool.length)];
      rotateIdxRef.current += 1;
      dlog('tick — picked random:', order.id, 'from pool size', pool.length);
      lastTriggerRef.current = Date.now();
      setState({ order, visible: true });
      scheduleDismiss();
    };
    const kickoff = window.setTimeout(tick, 500);
    rotateTimerRef.current = window.setInterval(tick, ROTATE_INTERVAL_MS);
    return () => {
      window.clearTimeout(kickoff);
      if (rotateTimerRef.current) window.clearInterval(rotateTimerRef.current);
    };
  }, [isHiddenRoute, hovered]);



  // Dynamically measure the fixed research-disclaimer strip and
  // set --phl-popup-top so the popup sits exactly underneath it.
  useEffect(() => {
    const updateTop = () => {
      const el = document.getElementById('phl-research-disclaimer');
      if (!el) {
        document.documentElement.style.removeProperty('--phl-popup-top');
        return;
      }
      const rect = el.getBoundingClientRect();
      const header = el.closest('header');
      const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
      const value = Math.round(Math.max(rect.bottom, headerBottom) + 8);
      document.documentElement.style.setProperty('--phl-popup-top', `${value}px`);
    };

    // Only set when the user is near the top of the page; below that the
    // fixed popup stays in place while the disclaimer scrolls away.
    const NEAR_TOP_THRESHOLD = 60;
    const raf = requestAnimationFrame(updateTop);

    // Throttled scroll handler: max one measurement per animation frame.
    let scrollPending = false;
    const onScroll = () => {
      if (window.scrollY >= NEAR_TOP_THRESHOLD) return;
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(() => {
        scrollPending = false;
        if (window.scrollY < NEAR_TOP_THRESHOLD) updateTop();
      });
    };

    // Debounced resize handler: wait for the layout to settle.
    let resizeTimer: number | null = null;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (window.scrollY < NEAR_TOP_THRESHOLD) updateTop();
      }, 150);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  }, [pathname]);

  // Cleanup on unmount
  useEffect(() => () => clearDismissTimer(), []);

  // Pause on hover
  const handleMouseEnter = () => {
    setHovered(true);
    clearDismissTimer();
  };
  const handleMouseLeave = () => {
    setHovered(false);
    if (state.visible) scheduleDismiss();
  };

  const handleClose = () => {
    snoozeUntilRef.current = Date.now() + SNOOZE_MS;
    queueRef.current = [];
    setState((s) => ({ ...s, visible: false }));
  };

  if (isHiddenRoute || !state.order) return null;

  const { order, visible } = state;
  const text = formatLivePopupText(order);

  const transition = reduced ? 'none' : 'transform 400ms ease-out, opacity 300ms ease-out';
  const transform = visible ? 'translateX(0)' : reduced ? 'none' : 'translateX(-110%)';
  const opacity = visible ? 1 : 0;

  return (
    <div
      id="phl-live-sales-popup"
      role="status"
      aria-live="polite"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="phl-live-sales-popup fixed pointer-events-auto"
      style={{
        transform,
        opacity,
        transition,
      }}
    >
      <div
        className="flex items-center gap-3 rounded-xl border border-white/10 p-3 pr-8 shadow-2xl backdrop-blur"
        style={{ background: 'rgba(2, 6, 23, 0.92)' }}
      >
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800">
          {order.productImage ? (
            <img src={order.productImage} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Package className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          )}
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        </div>

        <div className="min-w-0 flex-1 text-[13px] leading-snug text-white">
          <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
            <span>Live</span>
          </div>
          <p className="truncate" title={text}>{text}</p>
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label="Dismiss notification"
          className="absolute right-1.5 top-1.5 rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Locked layout lives in src/styles.css (.phl-live-sales-popup) so it
          is not re-injected on every render and is testable without the
          component being mounted. */}
    </div>
  );
}

