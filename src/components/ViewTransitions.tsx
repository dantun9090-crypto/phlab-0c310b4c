import { useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';

/**
 * Wraps client-side route commits in a View Transition (subtle 150ms
 * cross-fade). Progressive-enhancement only: browsers without
 * document.startViewTransition see the default TanStack render and
 * pay zero cost. Skipped under prefers-reduced-motion.
 */
export default function ViewTransitions() {
  const router = useRouter();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> };
    };
    if (typeof doc.startViewTransition !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let lastPath = router.state.location.pathname;
    const unsub = router.subscribe('onResolved', () => {
      const nextPath = router.state.location.pathname;
      if (nextPath === lastPath) return;
      lastPath = nextPath;
      try {
        doc.startViewTransition?.(() =>
          new Promise<void>(resolve => {
            // Give React a frame to commit the new tree before capturing.
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
        );
      } catch { /* no-op */ }
    });
    return () => { unsub(); };
  }, [router]);

  return null;
}
