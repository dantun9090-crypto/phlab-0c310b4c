import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Order } from '@/lib/firebase';

/**
 * Window-virtualized orders list: renders only the rows in (or near) the
 * viewport instead of the full filtered set. With a few hundred orders the
 * old plain `.map()` mounted every card (badges, buttons, motion wrappers)
 * on each filter change; this keeps the DOM at ~viewport size.
 *
 * Rows self-measure via measureElement (ResizeObserver), so variable heights
 * — expanded customer-history panels, wrapped addresses on mobile — stay
 * correct without a fixed row-height contract.
 */
export default function VirtualizedOrdersList({
  rows,
  renderRow,
}: {
  rows: Order[];
  renderRow: (order: Order) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // Distance from the top of the document to the start of this list. Kept in
  // state (refs must not be read during render); re-measured on mount, on
  // resize and whenever the row count changes — the panels above the list
  // expand/collapse together with the underlying orders data.
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const el = listRef.current;
      if (!el) return;
      const next = el.getBoundingClientRect().top + window.scrollY;
      setScrollMargin((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [rows.length]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 150,
    overscan: 6,
    scrollMargin,
  });

  return (
    <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((vi) => {
        const order = rows[vi.index];
        if (!order) return null;
        return (
          <div
            key={order.id}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full pb-3"
            style={{ transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)` }}
          >
            {renderRow(order)}
          </div>
        );
      })}
    </div>
  );
}
