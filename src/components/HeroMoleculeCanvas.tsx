import { useEffect, useRef } from 'react';

type Props = {
  /** Number of nodes. Kept small (~40) to preserve CPU budget. */
  density?: number;
  /** Optional className for the wrapping canvas element. */
  className?: string;
};

/**
 * Lightweight canvas-2D molecule field for the hero background.
 * - Initialises AFTER window load + requestIdleCallback so it never
 *   competes with LCP paint.
 * - Pauses when the tab is hidden or the viewport is off-screen.
 * - Skipped entirely when prefers-reduced-motion is set.
 * - No external libs; render loop is <15 KB.
 */
export default function HeroMoleculeCanvas({ density = 40, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let width = 0, height = 0;
    let particles: { x: number; y: number; vx: number; vy: number }[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      resize();
      const effective = width < 768 ? Math.min(density, 20) : density;
      particles = new Array(effective).fill(0).map(() => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
      }));
    };

    const draw = () => {
      if (!running) { raf = 0; return; }
      ctx.clearRect(0, 0, width, height);
      const maxDist = Math.min(140, Math.max(80, Math.hypot(width, height) * 0.09));

      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < maxDist) {
            const alpha = (1 - d / maxDist) * 0.14;
            ctx.strokeStyle = `rgba(16,185,129,${alpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(103,232,249,0.55)';
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    const start = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    const onVisibility = () => {
      running = !document.hidden;
      if (running) start(); else stop();
    };
    const onResize = () => resize();

    const kick = () => {
      init();
      start();
      window.addEventListener('resize', onResize, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
    };

    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    let idleId = 0, timeoutId = 0;
    const schedule = () => {
      if (ric) idleId = ric(kick, { timeout: 2000 });
      else timeoutId = window.setTimeout(kick, 500);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      running = false;
      stop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (idleId) (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.55,
        zIndex: 1,
      }}
    />
  );
}
