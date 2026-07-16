import { useEffect, useRef } from 'react';

/**
 * Magnetic hover — translates the target toward the cursor on
 * pointer:fine devices only, and only when prefers-reduced-motion
 * is not set. Springs back on mouseleave. Uses transform only —
 * no layout thrash.
 */
export function useMagneticHover<T extends HTMLElement>(strength = 0.25) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    if (!window.matchMedia?.('(pointer: fine)').matches) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let tx = 0, ty = 0;

    const apply = () => {
      raf = 0;
      const settling = tx === 0 && ty === 0;
      el.style.transition = settling
        ? 'transform .35s cubic-bezier(.2,.9,.3,1.2)'
        : 'transform .12s ease-out';
      el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
    };

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * strength;
      ty = (e.clientY - (r.top + r.height / 2)) * strength;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = '';
      el.style.transition = '';
    };
  }, [strength]);

  return ref;
}
