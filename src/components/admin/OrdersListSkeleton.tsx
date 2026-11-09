/**
 * Skeleton placeholder for the orders list while the first fetch is in flight.
 * Matches the real row card shape (border, radius, padding) so there is no
 * layout jump when rows swap in.
 */
export default function OrdersListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading orders">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="bg-[#0b1a30]/60 border border-white/[0.07] rounded-xl p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="h-4 w-28 rounded bg-white/[0.08]" />
            <div className="h-5 w-16 rounded-full bg-white/[0.06]" />
            <div className="h-5 w-20 rounded-full bg-white/[0.06]" />
          </div>
          <div className="mt-3 h-3 w-2/3 rounded bg-white/[0.06]" />
          <div className="mt-2 h-3 w-1/3 rounded bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}
