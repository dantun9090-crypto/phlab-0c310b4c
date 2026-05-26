import { useEffect, useState } from 'react';
import { Logo } from './Logo';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(target: Date): TimeLeft {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours:   Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

interface Props {
  targetDate?: string; // ISO string, e.g. "2025-05-01T00:00:00"
}

export function UnderConstruction({ targetDate }: Props) {
  const [visible, setVisible] = useState(false);

  // Default: 7 days from now if no date set
  const target = targetDate ? new Date(targetDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(getTimeLeft(target));

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft(target)), 1000);
    return () => clearInterval(interval);
  }, [target.getTime()]);

  const units: { label: string; value: number }[] = [
    { label: 'Days',    value: timeLeft.days },
    { label: 'Hours',   value: timeLeft.hours },
    { label: 'Minutes', value: timeLeft.minutes },
    { label: 'Seconds', value: timeLeft.seconds },
  ];

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease',
        background: 'radial-gradient(ellipse at 50% 35%, #041630 0%, #020a18 55%, #010610 100%)',
      }}
    >
      {/* Ambient orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-15%] left-[-10%] w-[700px] h-[700px] rounded-full animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)', animationDuration: '6s' }}
        />
        <div
          className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(6,214,240,0.07) 0%, transparent 70%)', animationDuration: '8s', animationDelay: '1s' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.04) 0%, transparent 60%)' }}
        />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, #4a90d9 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
          }}
        />
      </div>

      <Particles />

      {/* Content */}
      <div
        className="relative z-10 flex flex-col items-center text-center px-6 w-full max-w-2xl"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        <div className="h-px w-48 bg-gradient-to-r from-transparent via-blue-500/60 to-transparent mb-10" />

        <Logo size="lg" />

        <p className="text-white font-bold text-lg tracking-tight mt-4 mb-8">
          PRO HEALTH PEPTIDES
        </p>

        <h1
          className="text-4xl sm:text-5xl md:text-6xl font-bold mb-5 leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          <span
            style={{
              background: 'linear-gradient(135deg, #06d6f0 0%, #60a5fa 40%, #a78bfa 80%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 24px rgba(6,214,240,0.25))',
            }}
          >
            We'll Be Back Soon
          </span>
        </h1>

        <p className="text-[#9cb8d9] text-base sm:text-lg max-w-md leading-relaxed mb-10">
          We're making some exciting improvements to our website.
          <br className="hidden sm:block" />
          Thank you for your patience.
        </p>

        {/* ── Countdown ── */}
        <div className="flex items-center gap-3 sm:gap-5 mb-10">
          {units.map(({ label, value }, i) => (
            <div key={label} className="flex items-center gap-3 sm:gap-5">
              <div className="flex flex-col items-center">
                <div
                  className="relative w-16 sm:w-20 h-16 sm:h-20 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(145deg, rgba(37,99,235,0.15), rgba(6,214,240,0.05))',
                    border: '1px solid rgba(96,165,250,0.2)',
                    boxShadow: '0 0 24px rgba(37,99,235,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}
                >
                  {/* Number */}
                  <span
                    className="text-2xl sm:text-3xl font-black tabular-nums"
                    style={{
                      background: 'linear-gradient(135deg, #e0f2ff 0%, #93c5fd 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      lineHeight: 1,
                    }}
                  >
                    {String(value).padStart(2, '0')}
                  </span>
                  {/* Subtle top shine */}
                  <div className="absolute top-0 left-0 right-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
                </div>
                <span className="text-[10px] sm:text-xs font-semibold text-[#3a5a82] uppercase tracking-widest mt-2">
                  {label}
                </span>
              </div>
              {/* Separator dots — not after last */}
              {i < 3 && (
                <div className="flex flex-col gap-1.5 pb-5">
                  <span className="w-1 h-1 rounded-full bg-[#2a4a7a]" />
                  <span className="w-1 h-1 rounded-full bg-[#2a4a7a]" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Contact line */}
        <p className="text-[#3a5a82] text-sm">
          Questions?{' '}
          <a
            href="mailto:info@prohealthpeptides.co.uk"
            className="text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
          >
            info@prohealthpeptides.co.uk
          </a>
        </p>

        <div className="h-px w-48 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent mt-10" />
      </div>

      <style>{`
        @keyframes uc-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function Particles() {
  const particles = Array.from({ length: 16 }, (_, i) => i);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(i => {
        const size = 2 + (i % 3);
        const left = (i * 6.25 + (i % 5) * 3) % 100;
        const delay = (i * 0.37) % 4;
        const dur = 8 + (i % 5) * 1.5;
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              left: `${left}%`,
              bottom: '-10px',
              background: i % 3 === 0 ? 'rgba(6,214,240,0.5)' : i % 3 === 1 ? 'rgba(96,165,250,0.5)' : 'rgba(167,139,250,0.4)',
              animation: `uc-float ${dur}s linear infinite`,
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes uc-float {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
