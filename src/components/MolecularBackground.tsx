/**
 * MolecularBackground — subtle animated SVG molecular bonds + nodes.
 * Pure CSS animation, zero JS, GPU-composited via `will-change: transform`.
 * On mobile (<768px) renders only the top tier to reduce paint cost.
 */
export function MolecularBackground({ opacity = 1 }: { opacity?: number }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="molecular-bg" style={{ opacity }}>
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Bonds (lines) */}
        <g stroke="rgba(96,165,250,0.09)" strokeWidth="1" fill="none">
          {/* Top tier — always rendered */}
          <line x1="180" y1="120" x2="320" y2="200" />
          <line x1="320" y1="200" x2="480" y2="140" />
          <line x1="480" y1="140" x2="620" y2="260" />
          <line x1="620" y1="260" x2="780" y2="180" />
          <line x1="780" y1="180" x2="920" y2="300" />
          <line x1="920" y1="300" x2="1080" y2="200" />
          <line x1="1080" y1="200" x2="1220" y2="320" />
          <line x1="1220" y1="320" x2="1380" y2="220" />

          {/* Second tier — desktop only */}
          {!isMobile && (
            <>
              <line x1="240" y1="360" x2="400" y2="440" />
              <line x1="400" y1="440" x2="560" y2="360" />
              <line x1="560" y1="360" x2="700" y2="480" />
              <line x1="700" y1="480" x2="860" y2="400" />
              <line x1="860" y1="400" x2="1000" y2="520" />
              <line x1="1000" y1="520" x2="1160" y2="420" />
              <line x1="1160" y1="420" x2="1320" y2="540" />
              {/* verticals / cross bonds */}
              <line x1="320" y1="200" x2="400" y2="440" />
              <line x1="480" y1="140" x2="560" y2="360" />
              <line x1="620" y1="260" x2="700" y2="480" />
              <line x1="780" y1="180" x2="860" y2="400" />
              <line x1="920" y1="300" x2="1000" y2="520" />
              <line x1="1080" y1="200" x2="1160" y2="420" />
              {/* Lower tier */}
              <line x1="160" y1="620" x2="320" y2="700" />
              <line x1="320" y1="700" x2="500" y2="620" />
              <line x1="500" y1="620" x2="660" y2="740" />
              <line x1="660" y1="740" x2="820" y2="660" />
              <line x1="820" y1="660" x2="980" y2="780" />
              <line x1="980" y1="780" x2="1140" y2="680" />
              <line x1="1140" y1="680" x2="1300" y2="780" />
              {/* cross to lower */}
              <line x1="400" y1="440" x2="320" y2="700" />
              <line x1="560" y1="360" x2="500" y2="620" />
              <line x1="700" y1="480" x2="660" y2="740" />
              <line x1="860" y1="400" x2="820" y2="660" />
              <line x1="1000" y1="520" x2="980" y2="780" />
              <line x1="1160" y1="420" x2="1140" y2="680" />
            </>
          )}
        </g>

        {/* Nodes — top tier always rendered */}
        <g fill="rgba(96,165,250,0.12)">
          <circle cx="180" cy="120" r="3.5" />
          <circle cx="320" cy="200" r="4" />
          <circle cx="480" cy="140" r="3" />
          <circle cx="620" cy="260" r="4.5" />
          <circle cx="780" cy="180" r="3" />
          <circle cx="920" cy="300" r="4" />
          <circle cx="1080" cy="200" r="3.5" />
          <circle cx="1220" cy="320" r="3" />
          <circle cx="1380" cy="220" r="4" />

          {/* Second + lower tier nodes — desktop only */}
          {!isMobile && (
            <>
              <circle cx="240" cy="360" r="3" />
              <circle cx="400" cy="440" r="4.5" />
              <circle cx="560" cy="360" r="3" />
              <circle cx="700" cy="480" r="4" />
              <circle cx="860" cy="400" r="3.5" />
              <circle cx="1000" cy="520" r="4" />
              <circle cx="1160" cy="420" r="3" />
              <circle cx="1320" cy="540" r="4" />
              <circle cx="160" cy="620" r="3.5" />
              <circle cx="320" cy="700" r="4" />
              <circle cx="500" cy="620" r="3" />
              <circle cx="660" cy="740" r="4.5" />
              <circle cx="820" cy="660" r="3" />
              <circle cx="980" cy="780" r="4" />
              <circle cx="1140" cy="680" r="3.5" />
              <circle cx="1300" cy="780" r="3" />
            </>
          )}
        </g>

        {/* Larger accent nodes — desktop only */}
        {!isMobile && (
          <g fill="none" stroke="rgba(59,130,246,0.07)" strokeWidth="1.5">
            <circle cx="620" cy="260" r="10" />
            <circle cx="860" cy="400" r="8" />
            <circle cx="400" cy="440" r="9" />
            <circle cx="1000" cy="520" r="7" />
          </g>
        )}
      </svg>
    </div>
  );
}
