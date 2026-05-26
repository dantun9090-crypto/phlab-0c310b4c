import { useEffect, useRef, useState } from 'react';

// ─── Timing (ms) ──────────────────────────────────────────────────────────────
const T_FADE_IN  = 80;
const T_BUILD    = 220;
const T_HOLD     = 120;
const T_OUT      = 150;
// Total ≈ 570ms

const FPS_INTRO    = 15;
const FRAME_MS_INTRO = 1000 / FPS_INTRO;

const LOGO_URL =
  'https://cdn.wegic.ai/assets/onepage/agent/images/1775896855290_edited.png?imageMogr2/format/webp';

// ─── Particle ─────────────────────────────────────────────────────────────────
interface Particle {
  angle: number;
  orbitRadius: number;
  size: number;
  speed: number;
  alpha: number;
  colorIdx: number;
  layer: number; // 0=outer 1=mid 2=inner
  pulsePhase: number;
}

const PALETTE: [number,number,number][] = [
  [56,  182, 255],  // electric blue
  [34,  211, 238],  // cyan
  [99,  179, 255],  // sky
  [129, 140, 248],  // indigo
  [16,  185, 129],  // emerald accent
];

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const layer = i < 8 ? 2 : i < 18 ? 1 : 0;
    const baseRadius = layer === 2 ? 60 : layer === 1 ? 120 : 195;
    return {
      angle:       (i / count) * Math.PI * 2,
      orbitRadius: baseRadius + Math.random() * 28 - 14,
      size:        Math.random() * 2.4 + 0.7,
      speed:       (Math.random() * 0.004 + 0.0015) * (Math.random() > 0.5 ? 1 : -1),
      alpha:       Math.random() * 0.55 + 0.3,
      colorIdx:    Math.floor(Math.random() * PALETTE.length),
      layer,
      pulsePhase:  Math.random() * Math.PI * 2,
    };
  });
}

// ─── DNA strand helper ────────────────────────────────────────────────────────
function drawDnaRing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number,
  progress: number,
  time: number,
  alpha: number,
  color: [number,number,number]
) {
  const [r,g,b] = color;
  const segments = 36;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const tN = ((i + 1) / segments) * Math.PI * 2;
    const drawFrac = Math.min(Math.max((progress * segments - i), 0), 1);
    if (drawFrac <= 0) continue;

    // Slight sinusoidal wave on the ring
    const wave  = Math.sin(t * 3 + time * 0.8) * 6;
    const waveN = Math.sin(tN * 3 + time * 0.8) * 6;
    const x1 = cx + Math.cos(t) * (radius + wave);
    const y1 = cy + Math.sin(t) * (radius + wave);
    const x2 = cx + Math.cos(tN) * (radius + waveN);
    const y2 = cy + Math.sin(tN) * (radius + waveN);

    const segAlpha = alpha * drawFrac * (0.4 + 0.35 * Math.sin(t * 2 + time));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(${r},${g},${b},${segAlpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Node dots at intervals
    if (i % 4 === 0 && drawFrac >= 1) {
      const nodeAlpha = alpha * 0.7 * (0.5 + 0.5 * Math.sin(t + time * 1.2));
      ctx.beginPath();
      ctx.arc(x1, y1, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${nodeAlpha})`;
      ctx.fill();
    }
  }
}

export default function MolecularIntro({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);
  const startRef  = useRef<number>(0);
  const lastRef   = useRef<number>(0);
  const imgRef    = useRef<HTMLImageElement | null>(null);
  const particles = useRef<Particle[]>(makeParticles(25));

  const [logoVisible,  setLogoVisible]  = useState(false);
  const [scanVisible,  setScanVisible]  = useState(false);
  const [globalOpacity] = useState(1); // Always visible from start (no fade-in delay)
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  // Preload logo
  useEffect(() => {
    const img = new Image();
    img.src = LOGO_URL;
    img.onload = () => { imgRef.current = img; };
  }, []);

  // Phase orchestration
  useEffect(() => {
    const t2 = setTimeout(() => setLogoVisible(true), T_FADE_IN + T_BUILD * 0.55);
    const t3 = setTimeout(() => setScanVisible(true), T_FADE_IN + T_BUILD * 0.7);
    const t4 = setTimeout(() => setPhase('hold'),     T_FADE_IN + T_BUILD);
    const t5 = setTimeout(() => setPhase('out'),      T_FADE_IN + T_BUILD + T_HOLD);
    const t6 = setTimeout(() => onDone(),             T_FADE_IN + T_BUILD + T_HOLD + T_OUT);
    return () => { [t2,t3,t4,t5,t6].forEach(clearTimeout); };
  }, [onDone]);

  // Canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const totalDuration = T_FADE_IN + T_BUILD + T_HOLD + T_OUT;

    const draw = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      if (document.hidden) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }
      // 24fps cap — reduce main-thread blocking
      const delta = ts - lastRef.current;
      if (delta < FRAME_MS_INTRO) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }
      lastRef.current = ts - (delta % FRAME_MS_INTRO);

      const elapsed = ts - startRef.current;
      const timeSec = elapsed / 1000;

      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      ctx.clearRect(0, 0, W, H);

      const buildProgress = Math.min(Math.max((elapsed - T_FADE_IN) / T_BUILD, 0), 1);
      const eased = 1 - Math.pow(1 - buildProgress, 3);

      const outStart = T_FADE_IN + T_BUILD + T_HOLD;
      const dissolveProgress = elapsed > outStart
        ? Math.min((elapsed - outStart) / T_OUT, 1)
        : 0;
      const masterAlpha = 1 - dissolveProgress;

      // ── Background deep radial gradient ──
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
      bgGrad.addColorStop(0,   `rgba(4,16,48,${masterAlpha * 0.98})`);
      bgGrad.addColorStop(0.5, `rgba(2,10,28,${masterAlpha * 0.99})`);
      bgGrad.addColorStop(1,   `rgba(1,5,14,${masterAlpha})`);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      if (eased <= 0) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      // ── Grid ──
      ctx.save();
      ctx.globalAlpha = eased * 0.03 * masterAlpha;
      const gridSize = 56;
      ctx.strokeStyle = 'rgba(37,99,235,1)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();

      // ── DNA orbital rings ──
      const rings = [
        { r: 70,  color: [56, 182, 255] as [number,number,number], alpha: 0.55, speed: 0.6 },
        { r: 130, color: [34, 211, 238] as [number,number,number], alpha: 0.40, speed: -0.4 },
        { r: 200, color: [99, 179, 255] as [number,number,number], alpha: 0.28, speed: 0.3 },
        { r: 260, color: [129,140, 248] as [number,number,number], alpha: 0.15, speed: -0.2 },
      ];
      for (const ring of rings) {
        const ringProgress = Math.min(eased * 1.4, 1);
        drawDnaRing(ctx, cx, cy, ring.r, ringProgress, timeSec * ring.speed, ring.alpha * masterAlpha, ring.color);
      }

      // ── Cross-hair lines ──
      if (eased > 0.3) {
        const ch = Math.min((eased - 0.3) / 0.7, 1);
        ctx.save();
        ctx.globalAlpha = ch * 0.08 * masterAlpha;
        ctx.strokeStyle = 'rgba(56,182,255,1)';
        ctx.lineWidth = 0.5;
        // Horizontal
        ctx.beginPath(); ctx.moveTo(cx - 280, cy); ctx.lineTo(cx + 280, cy); ctx.stroke();
        // Vertical
        ctx.beginPath(); ctx.moveTo(cx, cy - 280); ctx.lineTo(cx, cy + 280); ctx.stroke();
        // Corner brackets
        const bLen = 22, gap = 280;
        ctx.globalAlpha = ch * 0.3 * masterAlpha;
        ctx.lineWidth = 1;
        const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
        for (const [sx, sy] of corners) {
          ctx.beginPath();
          ctx.moveTo(cx + sx*gap, cy + sy*gap);
          ctx.lineTo(cx + sx*(gap - bLen), cy + sy*gap);
          ctx.moveTo(cx + sx*gap, cy + sy*gap);
          ctx.lineTo(cx + sx*gap, cy + sy*(gap - bLen));
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── Orbiting particles ──
      for (const p of particles.current) {
        p.angle += p.speed;
        const px = cx + Math.cos(p.angle) * p.orbitRadius;
        const py = cy + Math.sin(p.angle) * p.orbitRadius;

        const layerBuildStart = p.layer === 2 ? 0.1 : p.layer === 1 ? 0.3 : 0.55;
        const layerProgress = Math.min(Math.max((eased - layerBuildStart) / (1 - layerBuildStart), 0), 1);
        if (layerProgress <= 0) continue;

        const pulse = 0.5 + 0.5 * Math.sin(p.pulsePhase + timeSec * 2);
        p.pulsePhase += 0.015;
        const finalAlpha = p.alpha * layerProgress * masterAlpha * (0.6 + 0.4 * pulse);

        const [r, g, b] = PALETTE[p.colorIdx];

        // Glow
        const grad = ctx.createRadialGradient(px, py, 0, px, py, p.size * 5);
        grad.addColorStop(0, `rgba(${r},${g},${b},${finalAlpha * 0.4})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(px, py, p.size * 5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(px, py, p.size * (1 + 0.3 * pulse), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${finalAlpha})`;
        ctx.fill();
      }

      // ── Scan line sweep ──
      if (eased > 0.5) {
        const scanProgress = (eased - 0.5) / 0.5;
        const scanY = cy - 260 + scanProgress * 520;
        const scanGrad = ctx.createLinearGradient(cx - 220, scanY - 3, cx + 220, scanY + 3);
        scanGrad.addColorStop(0,   'rgba(56,182,255,0)');
        scanGrad.addColorStop(0.3, `rgba(56,182,255,${0.25 * masterAlpha})`);
        scanGrad.addColorStop(0.7, `rgba(56,182,255,${0.25 * masterAlpha})`);
        scanGrad.addColorStop(1,   'rgba(56,182,255,0)');
        ctx.fillStyle = scanGrad;
        ctx.fillRect(cx - 220, scanY - 1, 440, 2);
      }

      if (elapsed < totalDuration + 100) {
        frameRef.current = requestAnimationFrame(draw);
      }
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#060f1e',
        opacity: globalOpacity,
        transition: `opacity ${phase === 'out' ? T_OUT : T_FADE_IN}ms cubic-bezier(0.4,0,0.2,1)`,
        pointerEvents: phase === 'out' || phase === 'hold' ? 'none' : 'auto',
      }}
      aria-hidden="true"
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* Centre content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
          opacity:   logoVisible ? 1 : 0,
          transform: logoVisible ? 'translateY(0) scale(1)' : 'translateY(22px) scale(0.94)',
          transition: `opacity 380ms cubic-bezier(0.22,1,0.36,1), transform 380ms cubic-bezier(0.22,1,0.36,1)`,
        }}
      >
        {/* Logo with rings */}
        <div style={{ position: 'relative', width: 104, height: 104 }}>
          {/* Outer pulse rings */}
          {[1,2,3].map(i => (
            <div key={i} style={{
              position: 'absolute',
              inset: -(i * 14),
              borderRadius: '50%',
              border: `1px solid rgba(56,130,246,${0.22 - i * 0.06})`,
              animation: `introPulseRing 2.2s ease-out ${i * 0.35}s infinite`,
            }} />
          ))}

          <img
            src={LOGO_URL}
            alt="PH Labs"
            style={{
              width: 104, height: 104,
              objectFit: 'contain',
              animation: 'introFloat 3.5s ease-in-out infinite',
              filter: 'drop-shadow(0 0 30px rgba(56,130,246,0.7)) drop-shadow(0 0 10px rgba(99,179,255,0.5))',
            }}
          />

          {/* Scan line overlay on logo */}
          {scanVisible && (
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 8,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}>
              <div style={{
                position: 'absolute',
                left: 0, right: 0,
                height: 2,
                background: 'linear-gradient(90deg, transparent, rgba(56,182,255,0.6), transparent)',
                animation: 'logoScan 1.8s ease-in-out infinite',
              }} />
            </div>
          )}
        </div>

        {/* Brand name */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.35em',
            color: 'rgba(56,182,255,0.65)',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            PH Labs
          </div>
          <div style={{
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: 'linear-gradient(135deg, #e0f0ff 0%, #60a5fa 45%, #818cf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Peptides
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          width: 110,
          height: 2,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.07)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(56,182,255,0.5), #3b82f6, #818cf8)',
            animation: logoVisible
              ? `introBarFill ${T_HOLD + 300}ms cubic-bezier(0.4,0,0.2,1) both`
              : 'none',
          }} />
        </div>

        {/* Tagline */}
        <p style={{
          fontSize: 10,
          letterSpacing: '0.22em',
          color: 'rgba(99,179,255,0.4)',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginTop: -12,
          opacity: scanVisible ? 1 : 0,
          transition: 'opacity 500ms ease 200ms',
        }}>
          Research Grade · UK
        </p>
      </div>

      <style>{`
        @keyframes introFloat {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          33%      { transform: translateY(-8px) rotate(0.5deg); }
          66%      { transform: translateY(-4px) rotate(-0.3deg); }
        }
        @keyframes introPulseRing {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @keyframes introBarFill {
          from { transform: scaleX(0); transform-origin: left; }
          to   { transform: scaleX(1); transform-origin: left; }
        }
        @keyframes logoScan {
          0%   { top: 0%; }
          100% { top: 100%; }
        }
      `}</style>
    </div>
  );
}
