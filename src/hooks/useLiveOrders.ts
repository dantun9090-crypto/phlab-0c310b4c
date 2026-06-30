import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { mapRawOrderToLive, type LiveOrder } from '@/lib/orderFormatter';

interface UseLiveOrdersResult {
  recentOrders: LiveOrder[];
  latestNewOrder: LiveOrder | null;
  isListening: boolean;
}

// Shared singleton listener so mounting multiple components doesn't create
// duplicate Firestore subscriptions.
let sharedUnsub: Unsubscribe | null = null;
let sharedOrders: LiveOrder[] = [];
let sharedListeners: Set<(orders: LiveOrder[], newOrder: LiveOrder | null) => void> = new Set();
let seenIds: Set<string> = new Set();
let firstSnapshot = true;

const startSharedListener = () => {
  if (sharedUnsub || typeof window === 'undefined') return;
  try {
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['completed', 'paid']),
      orderBy('orderDate', 'desc'),
      limit(20),
    );
    sharedUnsub = onSnapshot(
      q,
      (snap) => {
        const orders: LiveOrder[] = [];
        let newest: LiveOrder | null = null;
        snap.docChanges().forEach((change) => {
          if (change.type === 'added' && !firstSnapshot) {
            const mapped = mapRawOrderToLive({ id: change.doc.id, ...(change.doc.data() as any) });
            if (mapped && !seenIds.has(mapped.id)) newest = mapped;
          }
        });
        snap.docs.forEach((d) => {
          const mapped = mapRawOrderToLive({ id: d.id, ...(d.data() as any) });
          if (mapped) {
            orders.push(mapped);
            seenIds.add(mapped.id);
          }
        });
        firstSnapshot = false;
        sharedOrders = orders;
        sharedListeners.forEach((fn) => fn(orders, newest));
      },
      (err) => {
        // Permissions / index errors: silently stop; component renders nothing.
        console.warn('[useLiveOrders] snapshot error', err);
      },
    );
  } catch (e) {
    console.warn('[useLiveOrders] init failed', e);
  }
};

const stopSharedListenerIfIdle = () => {
  if (sharedListeners.size === 0 && sharedUnsub) {
    sharedUnsub();
    sharedUnsub = null;
    firstSnapshot = true;
  }
};

export const useLiveOrders = (): UseLiveOrdersResult => {
  const [recentOrders, setRecentOrders] = useState<LiveOrder[]>(sharedOrders);
  const [latestNewOrder, setLatestNewOrder] = useState<LiveOrder | null>(null);
  const [isListening, setIsListening] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cb = (orders: LiveOrder[], newOrder: LiveOrder | null) => {
      setRecentOrders(orders);
      if (newOrder) setLatestNewOrder(newOrder);
    };
    sharedListeners.add(cb);

    // Delay listener start until after page load (perf).
    const startNow = () => {
      timerRef.current = window.setTimeout(() => {
        startSharedListener();
        setIsListening(true);
      }, 3000);
    };
    if (document.readyState === 'complete') startNow();
    else window.addEventListener('load', startNow, { once: true });

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      sharedListeners.delete(cb);
      stopSharedListenerIfIdle();
    };
  }, []);

  return { recentOrders, latestNewOrder, isListening };
};
