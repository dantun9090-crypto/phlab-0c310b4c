import { useEffect, useRef } from 'react';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  alpha: number;
  pulsePhase: number;
  pulseSpeed: number;
  type: 'node' | 'hex';
  hexAngle: number;
  hexSize: number;
  hexRotSpeed: number;
}

interface AnimatedBackgroundProps {
  variant?: 'blue' | 'green';
  className?: string;
}

const VARIANTS = {
  blue: {
    nodeFill:   [56, 130, 246]  as [number,number,number],
    nodeGlow:   [99, 179, 255]  as [number,number,number],
    lineFill:   [37, 99, 235]   as [number,number,number],
    hexStroke:  [56, 130, 246]  as [number,number,number],
    glow1:      'rgba(37,99,235,0.10)',
    glow2:      'rgba(99,102,241,0.07)',
    glow3:      'rgba(56,130,246,0.05)',
  },
  green: {
    nodeFill:   [16, 185, 129]  as [number,number,number],
    nodeGlow:   [52, 211, 153]  as [number,number,number],
    lineFill:   [5, 150, 105]   as [number,number,number],
    hexStroke:  [16, 185, 129]  as [number,number,number],
    glow1:      'rgba(16,185,129,0.10)',
    glow2:      'rgba(201,162,39,0.06)',
    glow3:      'rgba(5,150,105,0.05)',
  },
};

// Aggressive optimization for Core Web Vitals
const DIST     = 200;
const COUNT    = 8;    // fewer nodes = less O(n²) line drawing
const HEX_N    = 1;    // single hex
const FPS      = 7;    // 7fps — visually indistinguishable, saves main thread
const FRAME_MS = 1000 / FPS;

function drawHex(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: [number,number,number], alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const px = Math.cos(a) * size;
    const py = Math.sin(a) * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const [r, g, b] = color;
  ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

export function AnimatedBackground({ variant = 'blue', className = '' }: AnimatedBackgroundProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const frameRef   = useRef<number>(0);
  const nodesRef   = useRef<Particle[]>([]);
  // Pre-split so we never allocate inside the draw loop
  const regularRef = useRef<Particle[]>([]);
  const hexRef     = useRef<Particle[]>([]);
  const lastRef    = useRef<number>(0);
  const pausedRef  = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let ro: ResizeObserver | null = null;
    const onVisChange = () => { pausedRef.current = document.hidden; };

    // Defer ALL canvas work until 2.5s after mount — keeps main thread free for LCP & FID
    const startTimer = setTimeout(() => {

      // Skip animation on mobile — saves ~40ms TBT on mobile
      if (window.matchMedia('(max-width: 900px)').matches) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const resize = () => {
        canvas.width  = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      };
      resize();
      ro = new ResizeObserver(resize);
      ro.observe(canvas);

      document.addEventListener('visibilitychange', onVisChange);

      const all = Array.from({ length: COUNT + HEX_N }, (_, i) => {
        const isHex = i >= COUNT;
        return {
          x:           Math.random() * (canvas.width  || window.innerWidth),
          y:           Math.random() * (canvas.height || window.innerHeight),
          vx:          (Math.random() - 0.5) * (isHex ? 0.12 : 0.28),
          vy:          (Math.random() - 0.5) * (isHex ? 0.12 : 0.28),
          r:           Math.random() * 1.8 + 1.0,
          alpha:       Math.random() * 0.5 + 0.3,
          pulsePhase:  Math.random() * Math.PI * 2,
          pulseSpeed:  Math.random() * 0.012 + 0.005,
          type:        isHex ? 'hex' : 'node',
          hexAngle:    Math.random() * Math.PI * 2,
          hexSize:     Math.random() * 18 + 12,
          hexRotSpeed: (Math.random() - 0.5) * 0.003,
        } as Particle;
      });

      nodesRef.current   = all;
      regularRef.current = all.filter(n => n.type === 'node');
      hexRef.current     = all.filter(n => n.type === 'hex');

      const draw = (ts: number) => {
        frameRef.current = requestAnimationFrame(draw);

        if (pausedRef.current) return;
        const elapsed = ts - lastRef.current;
        if (elapsed < FRAME_MS) return;
        lastRef.current = ts - (elapsed % FRAME_MS);

        const W = canvas.width, H = canvas.height;
        if (!W || !H) return;
        ctx.clearRect(0, 0, W, H);

        const regular = regularRef.current;
        const hexes   = hexRef.current;

        // Update positions
        for (const n of nodesRef.current) {
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0) { n.x = 0; n.vx *= -1; }
          if (n.x > W) { n.x = W; n.vx *= -1; }
          if (n.y < 0) { n.y = 0; n.vy *= -1; }
          if (n.y > H) { n.y = H; n.vy *= -1; }
          n.pulsePhase += n.pulseSpeed;
          if (n.type === 'hex') n.hexAngle += n.hexRotSpeed;
        }

        // Connection lines
        for (let i = 0; i < regular.length; i++) {
          for (let j = i + 1; j < regular.length; j++) {
            const dx = regular[i].x - regular[j].x;
            const dy = regular[i].y - regular[j].y;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (d > DIST) continue;
            const lineAlpha = (1 - d / DIST) * 0.11;
            const [r, g, b] = pal.lineFill;
            ctx.beginPath();
            ctx.moveTo(regular[i].x, regular[i].y);
            ctx.lineTo(regular[j].x, regular[j].y);
            ctx.strokeStyle = `rgba(${r},${g},${b},${lineAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Hex accents
        for (const n of hexes) {
          const pulse = 0.5 + 0.5 * Math.sin(n.pulsePhase);
          const alpha = 0.04 + 0.06 * pulse;
          drawHex(ctx, n.x, n.y, n.hexSize, n.hexAngle, pal.hexStroke, alpha);
          drawHex(ctx, n.x, n.y, n.hexSize * 0.6, n.hexAngle + Math.PI / 6, pal.hexStroke, alpha * 0.5);
        }

        // Nodes — skip expensive radial gradient, use flat fill for speed
        for (const n of regular) {
          const pulse = 0.5 + 0.5 * Math.sin(n.pulsePhase);
          const a = n.alpha * (0.65 + 0.35 * pulse);
          const r = n.r * (1 + 0.3 * pulse);
          const [nr, ng, nb] = pal.nodeFill;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${nr},${ng},${nb},${a})`;
          ctx.fill();
        }
      };

      frameRef.current = requestAnimationFrame(draw);
    }, 2500);

    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(frameRef.current);
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [variant]);

  const pal = VARIANTS[variant];

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ab-root ${className}`}
      aria-hidden="true"
      style={{ contain: 'strict' as any }}
    >
      {/* Multi-layer depth glows */}
      <div className="absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 80% 55% at 20% 30%, ${pal.glow1} 0%, transparent 60%),
          radial-gradient(ellipse 60% 45% at 80% 65%, ${pal.glow2} 0%, transparent 55%),
          radial-gradient(ellipse 40% 35% at 50% 90%, ${pal.glow3} 0%, transparent 50%)
        `,
      }} />

      {/* Fine molecular grid — desktop only (paint cost too high on mobile) */}
      <div className="absolute inset-0 ab-grid" style={{
        backgroundImage: `
          linear-gradient(rgba(${variant === 'blue' ? '37,99,235' : '16,185,129'},0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(${variant === 'blue' ? '37,99,235' : '16,185,129'},0.02) 1px, transparent 1px)
        `,
        backgroundSize: '56px 56px',
      }} />

      {/* Subtle dot grid — desktop only */}
      <div className="absolute inset-0 ab-grid" style={{
        backgroundImage: `radial-gradient(circle, rgba(${variant === 'blue' ? '99,179,255' : '52,211,153'},0.08) 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
      }} />

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.85 }}
      />

      {/* Edge vignette */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to bottom, #030812 0%, transparent 15%, transparent 85%, #030812 100%)',
      }} />

      {/* Horizontal scan-line shimmer — desktop only (animation repaints full layer = mobile jank) */}
      <div className="absolute inset-0 animate-bg-scan ab-scan" style={{
        background: `linear-gradient(to bottom, transparent 0%, rgba(${variant === 'blue' ? '56,130,246' : '16,185,129'},0.018) 50%, transparent 100%)`,
        backgroundSize: '100% 200px',
      }} />

      <style>{`
        @keyframes bg-scan {
          0%   { background-position: 0 -200px; }
          100% { background-position: 0 100vh; }
        }
        .animate-bg-scan {
          animation: bg-scan 12s linear infinite;
        }
        @media (max-width: 900px) {
          .ab-scan, .ab-grid { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-bg-scan { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
