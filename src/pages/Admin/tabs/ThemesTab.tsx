import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy so the gallery, wizard and their animation code stay in an admin-only chunk.
const TemplateGallery = lazy(() => import('@/components/admin/templates/TemplateGallery'));

function GallerySkeleton() {
  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[16/12] w-full rounded-2xl bg-white/[0.06]" />
      ))}
    </div>
  );
}

export default function ThemesTab() {
  return (
    <Suspense fallback={<GallerySkeleton />}>
      <TemplateGallery />
    </Suspense>
  );
}
