import { Search } from 'lucide-react';

/** Reusable empty state for admin lists/tables (icon + title + optional hint). */
export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16">
      <Search className="w-10 h-10 mx-auto text-[#2a4a7a]" />
      <p className="mt-3 text-[#9cb8d9]">{title}</p>
      {hint && <p className="mt-1 text-xs text-[#5f7ba3]">{hint}</p>}
    </div>
  );
}
