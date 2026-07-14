import { useEffect, useRef, useState } from 'react';
import type { LiveOrder } from '@/lib/orderFormatter';

interface UseLiveOrdersResult {
  recentOrders: LiveOrder[];
  latestNewOrder: LiveOrder | null;
  isListening: boolean;
}

// Shared singleton poller so mounting multiple components doesn't create
// duplicate requests. Orders stay private in Firestore; this hits a sanitized
// same-origin endpoint that returns only GDPR-safe social-proof fields.
const POLL_MS = 30_000;
const MAX_POLL_MS = 120_000;
let sharedStop: (() => void) | null = null;
let sharedOrders: LiveOrder[] = [];
let sharedListeners: Set<(orders: LiveOrder[], newOrder: LiveOrder | null) => void> = new Set();
let seenIds: Set<string> = new Set();
let firstSnapshot = true;

const isDebug = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem('livePopupDebug') === '1' || new URLSearchParams(window.location.search).get('livePopupDebug') === '1';
  } catch {
    return false;
  }
};

const dlog = (...args: unknown[]) => {
  if (isDebug()) console.log('[useLiveOrders]', ...args);
};

const startSharedListener = () => {
  if (sharedStop || typeof window === 'undefined') return;

  let stopped = false;
  let timer: number | null = null;
  let inFlight: AbortController | null = null;
  let nextDelayMs = POLL_MS;
  let failureCount = 0;

  const notify = (orders: LiveOrder[], newest: LiveOrder | null) => {
    sharedOrders = orders;
    sharedListeners.forEach((fn) => fn(orders, newest));
  };

  const poll = async () => {
    if (stopped) return;
    try {
      inFlight?.abort();
      inFlight = new AbortController();
      const debug = isDebug();
      const res = await fetch(`/api/public/live-orders?limit=20${debug ? '&debug=1' : ''}`, {
        cache: 'no-store',
        credentials: 'omit',
        signal: inFlight.signal,
      });
      const data = (await res.json().catch(() => ({ orders: [] }))) as { orders?: LiveOrder[]; count?: number; debug?: unknown };
      const orders = Array.isArray(data.orders) ? data.orders : [];
      nextDelayMs = POLL_MS;
      failureCount = 0;
      const previous = seenIds;
      let newest: LiveOrder | null = null;
      for (const order of orders) {
        if (!firstSnapshot && !previous.has(order.id) && !newest) newest = order;
      }
      seenIds = new Set([...Array.from(previous).slice(-100), ...orders.map((order) => order.id)]);
      firstSnapshot = false;
      dlog('poll result:', { count: orders.length, newest: newest?.id || null, debug: data.debug, orders });
      notify(orders, newest);
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') {
        failureCount += 1;
        nextDelayMs = Math.min(MAX_POLL_MS, POLL_MS * 2 ** Math.min(failureCount, 3));
        if (failureCount === 1 || failureCount % 5 === 0) {
          console.warn('[useLiveOrders] poll error', error);
        }
      }
    } finally {
      if (!stopped) timer = window.setTimeout(poll, nextDelayMs);
    }
  };

  void poll();
  sharedStop = () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    inFlight?.abort();
    sharedStop = null;
    firstSnapshot = true;
  };
};

const stopSharedListenerIfIdle = () => {
  if (sharedListeners.size === 0 && sharedStop) sharedStop();
};

export const useLiveOrders = (): UseLiveOrdersResult => {
  const [recentOrders, setRecentOrders] = useState<LiveOrder[]>(sharedOrders);
  const [latestNewOrder, setLatestNewOrder] = useState<LiveOrder | null>(null);
  const [isListening, setIsListening] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // LCP optimisation: skip live-order polling on the homepage.
    // The LiveSalesPopup only renders on non-home routes anyway, and the
    // extra fetch chain was contending with hero-image bandwidth on mobile.
    if (window.location.pathname === '/') return;
    let cancelled = false;

    const cb = (orders: LiveOrder[], newOrder: LiveOrder | null) => {
      setRecentOrders(orders);
      if (newOrder) setLatestNewOrder(newOrder);
    };
    sharedListeners.add(cb);

    // Delay start until after page load (perf), then refresh every popup
    // rotation interval so the pool stays current.
    const startNow = () => {
      timerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        startSharedListener();
        setIsListening(true);
      }, 3000);
    };
    if (document.readyState === 'complete') startNow();
    else window.addEventListener('load', startNow, { once: true });

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.removeEventListener('load', startNow);
      sharedListeners.delete(cb);
      stopSharedListenerIfIdle();
    };
  }, []);

  return { recentOrders, latestNewOrder, isListening };
};
