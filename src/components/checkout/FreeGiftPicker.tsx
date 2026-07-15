import { Gift } from 'lucide-react';
import type { FreeGiftItem } from '@/lib/free-gift-config';

interface Props {
  eligible: FreeGiftItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Compact mode used inside the sticky order-summary. */
  compact?: boolean;
}

/**
 * Renders either a static "free gift" badge (when there's exactly one
 * eligible item — same as the legacy behaviour) or a radio picker so the
 * customer can choose one of several extras (e.g. pen, vial case).
 */
export default function FreeGiftPicker({ eligible, selectedId, onSelect, compact = false }: Props) {
  if (eligible.length === 0) return null;

  // Single-gift shape → keep the old compact badge exactly as before.
  if (eligible.length === 1) {
    const g = eligible[0];
    return (
      <div className="flex justify-between items-start gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-2.5 py-2">
        <span className="text-emerald-300 text-[11px] font-semibold flex items-start gap-1.5">
          <Gift className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            Free Gift: {g.title}
            {g.description && (
              <span className="block text-emerald-300/70 font-normal mt-0.5">{g.description}</span>
            )}
          </span>
        </span>
        <span className="text-emerald-300 text-[11px] font-semibold shrink-0">FREE</span>
      </div>
    );
  }

  // Multiple options → radio picker.
  const active = eligible.find((g) => g.id === selectedId) ?? eligible[0];

  return (
    <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-emerald-300 text-[11px] font-semibold">
        <Gift className="w-3.5 h-3.5" />
        <span>Choose your free gift</span>
        <span className="ml-auto">FREE</span>
      </div>
      <div className={`grid gap-1.5 ${compact ? '' : 'sm:grid-cols-2'}`}>
        {eligible.map((g) => {
          const checked = g.id === active.id;
          return (
            <label
              key={g.id}
              className={`flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors border ${
                checked
                  ? 'bg-emerald-500/15 border-emerald-500/50'
                  : 'bg-slate-900/40 border-white/10 hover:border-emerald-500/30'
              }`}
            >
              <input
                type="radio"
                name="free-gift-choice"
                value={g.id}
                checked={checked}
                onChange={() => onSelect(g.id)}
                className="mt-0.5 accent-emerald-500"
              />
              <span className="flex-1 min-w-0">
                <span className="block text-white text-xs font-semibold truncate">{g.title}</span>
                {g.description && (
                  <span className="block text-emerald-300/70 text-[11px] font-normal mt-0.5 line-clamp-2">
                    {g.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
