import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { db, collection, query, where, getDocsFromServer, limit } from '@/lib/firebase';

const STORAGE_KEY = 'php_research_confirmed';
const EXPIRY_DAYS = 30;
const BANNER_H = 34;

// Pages where the modal should never block interaction
const MODAL_EXEMPT_PATHS = ['/login', '/register', '/admin', '/account', '/landing'];

function isConfirmed(): boolean {
  if (typeof window === 'undefined') return true;
  const ua = navigator.userAgent.toLowerCase();
  if (
    ua.includes('googlebot') || ua.includes('bingbot') || ua.includes('slurp') ||
    ua.includes('duckduckbot') || ua.includes('prerender') || ua.includes('headlesschrome')
  ) return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const { ts } = JSON.parse(raw);
    return Date.now() - ts < EXPIRY_DAYS * 864e5;
  } catch { return false; }
}

function saveConfirmation() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() })); } catch { /* storage unavailable */ }
}

function notifyGateCleared() {
  try { window.dispatchEvent(new CustomEvent('php:research-gate-cleared')); } catch { /* noop */ }
}

// Fetch whether a product requires the research gate by slug
async function fetchProductRequiresGate(slug: string): Promise<boolean | null> {
  try {
    const snap = await getDocsFromServer(query(collection(db, 'product_stock'), where('slug', '==', slug), limit(1)));
    if (!snap.empty) return snap.docs[0].data().requiresResearchGate === true;
    // Fallback: try matching by name-derived slug
    const allSnap = await getDocsFromServer(collection(db, 'product_stock'));
    for (const d of allSnap.docs) {
      const name: string = d.data().name || '';
      const derived = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (derived === slug) return d.data().requiresResearchGate === true;
    }
    const legacySnap = await getDocsFromServer(query(collection(db, 'products'), where('slug', '==', slug), limit(1)));
    if (!legacySnap.empty) return legacySnap.docs[0].data().requiresResearchGate === true;
    return null;
  } catch { return null; }
}

export default function ResearchGate() {
  const [showModal, setShowModal]         = useState(false);
  // H2: auto-hide the sticky banner once the user has acknowledged research-use
  // so mobile no longer carries a 34px + 32px banner stack on every page.
  const [bannerVisible, setBannerVisible] = useState(() => !isConfirmed());
  const [confirmed, setConfirmed]         = useState(false);
  const [btnHover, setBtnHover]           = useState(false);
  const [btnActive, setBtnActive]         = useState(false);
  const location = useLocation();
  // Route param is :id on /products/:id
  const params = useParams<{ id?: string }>();

  const isExempt = MODAL_EXEMPT_PATHS.some(p => location.pathname.startsWith(p));
  const hideGateCompletely = location.pathname.startsWith('/landing');
  // Detect product pages but exclude /products/category/:slug
  const isProductPage = location.pathname.startsWith('/products/') &&
    !location.pathname.startsWith('/products/category/') && !!params.id;

  useEffect(() => {
    if (hideGateCompletely) {
      document.documentElement.style.setProperty('--rg-banner-h', '0px');
      return;
    }
    const h = bannerVisible ? BANNER_H : 0;
    document.documentElement.style.setProperty('--rg-banner-h', `${h}px`);
    return () => {
      document.documentElement.style.setProperty('--rg-banner-h', '0px');
    };
  }, [bannerVisible, hideGateCompletely]);

  useEffect(() => {
    const already = isConfirmed();
    setConfirmed(already);
    if (already || isExempt) return;

    if (isProductPage && params.id) {
      // Per-product gate: only show modal if the product has requiresResearchGate = true
      fetchProductRequiresGate(params.id).then(requires => {
        if (requires === true) {
          const t = setTimeout(() => setShowModal(true), 400);
          return () => clearTimeout(t);
        }
        // null or false = don't block on this product page
      });
    } else {
      // Non-product pages: show modal on all non-exempt pages
      const t = setTimeout(() => setShowModal(true), 400);
      return () => clearTimeout(t);
    }
  }, [location.pathname]);

  if (hideGateCompletely) return null;

  const handleConfirm = () => {
    saveConfirmation();
    setConfirmed(true);
    setShowModal(false);
    notifyGateCleared();
  };

  return (
    <>
      <style>{`
        @keyframes rg-fade-up {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        .rg-modal-card {
          animation: rg-fade-up 0.36s cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
        .rg-cta:focus-visible {
          outline: 2px solid #10b981;
          outline-offset: 2px;
        }
        .rg-dismiss:focus-visible {
          outline: 2px solid rgba(16,185,129,0.4);
          outline-offset: 2px;
          border-radius: 4px;
        }
        @media (max-width: 480px) {
          .rg-modal-card { border-radius: 14px !important; }
          .rg-banner-text-full { display: none !important; text-align: center !important; }
          .rg-banner-text-short { display: block !important; }
        }
        @media (min-width: 481px) {
          .rg-banner-text-short { display: none !important; }
        }
      `}</style>

      {/* ── Sticky research banner ──────────────────────────────────────────── */}
      {bannerVisible && (
        <div
          id="research-gate-banner"
          role="note"
          aria-label="Research use notice"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0,
            zIndex: 9998,
            height: `${BANNER_H}px`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            gap: '10px',
            // Deep navy with a subtle green cast — matches the site's nav/card bg
            background: 'linear-gradient(90deg, #060e1c 0%, #081812 45%, #060e1c 100%)',
            borderBottom: '1px solid rgba(16,185,129,0.18)',
            boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
          }}
        >
          {/* Flask icon */}
          <svg
            aria-hidden="true"
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="rgba(52,211,153,0.7)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M9 3h6M9 3v7L4.5 17A2 2 0 006.4 20h11.2a2 2 0 001.9-3L15 10V3" />
          </svg>

          {/* Text — full on desktop, short on mobile */}
          <span
            className="rg-banner-text-full"
            style={{
              flex: 1, minWidth: 0,
              fontSize: '10.5px', fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'rgba(134,217,188,0.72)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            For Laboratory Research Use Only &nbsp;·&nbsp; Not for Human Consumption
          </span>
          <span
            className="rg-banner-text-short"
            style={{
              flex: 1, minWidth: 0,
              fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.05em', textTransform: 'uppercase',
              color: 'rgba(134,217,188,0.72)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            Research Use Only
          </span>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
            {!confirmed && (
              <button
                onClick={handleConfirm}
                aria-label="Confirm research use"
                style={{
                  padding: '3px 12px',
                  fontSize: '10px', fontWeight: 700,
                  letterSpacing: '0.07em', textTransform: 'uppercase',
                  color: '#34d399',
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background 0.18s, color 0.18s, border-color 0.18s',
                  lineHeight: '1.5',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(16,185,129,0.22)';
                  e.currentTarget.style.borderColor = 'rgba(16,185,129,0.45)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(16,185,129,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(16,185,129,0.25)';
                  e.currentTarget.style.color = '#34d399';
                }}
                onMouseDown={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.3)'; }}
                onMouseUp={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.22)'; }}
              >
                Confirm
              </button>
            )}
            <button
              onClick={() => setBannerVisible(false)}
              aria-label="Dismiss banner"
              style={{
                width: '22px', height: '22px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none',
                border: '1px solid transparent',
                borderRadius: '4px',
                color: 'rgba(90,130,175,0.55)',
                cursor: 'pointer',
                fontSize: '15px', lineHeight: 1,
                transition: 'color 0.18s, border-color 0.18s, background 0.18s',
                padding: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'rgba(160,190,224,0.8)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'rgba(90,130,175,0.55)';
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.background = 'none';
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {showModal && !isExempt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Research use confirmation"
          style={{
            position: 'fixed', inset: 0,
            zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
            overflowY: 'auto',
            // Overlay: deep navy, not pure black — feels on-brand
            background: 'rgba(3, 8, 18, 0.84)',
          }}
        >
          <div
            className="rg-modal-card"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '452px',
              maxHeight: 'calc(100svh - 24px)',
              overflowY: 'auto',
              // Card: matches site card bg (#0b1a30 area)
              background: 'linear-gradient(162deg, #0c1c32 0%, #070f1d 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '20px',
              padding: 'clamp(28px,5vw,42px) clamp(22px,5vw,38px) clamp(22px,4vw,32px)',
              boxShadow: [
                '0 40px 100px rgba(0,0,0,0.7)',
                '0 0 0 1px rgba(16,185,129,0.07) inset',
              ].join(', '),
            }}
          >
            {/* Top accent line */}
            <div style={{
              position: 'absolute', top: 0, left: '20%', right: '20%',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.55), transparent)',
              borderRadius: '0 0 1px 1px',
            }} />

            {/* Header: badge + lock */}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}>
              {/* Badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '4px 12px',
                background: 'rgba(16,185,129,0.09)',
                border: '1px solid rgba(16,185,129,0.22)',
                borderRadius: '30px',
                fontSize: '9.5px', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'rgba(52,211,153,0.85)',
              }}>
                <svg aria-hidden="true" width="9" height="9" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3h6M9 3v7L4.5 17A2 2 0 006.4 20h11.2a2 2 0 001.9-3L15 10V3" />
                </svg>
                Research Access
              </div>

              {/* Lock icon */}
              <div style={{
                width: '30px', height: '30px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '8px',
              }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(90,130,175,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2 style={{
              margin: '0 0 9px',
              fontSize: 'clamp(18px, 4.5vw, 22px)',
              fontWeight: 800,
              letterSpacing: '0.01em',
              color: '#e8f1ff',
              lineHeight: 1.2,
            }}>
              For Laboratory Research<br />Use Only
            </h2>

            {/* Subtext */}
            <p style={{
              margin: '0 0 20px',
              fontSize: '13.5px', lineHeight: 1.65,
              color: 'rgba(155,185,220,0.82)',
            }}>
              This store offers peptides exclusively for laboratory and scientific research purposes.
            </p>

            {/* Divider */}
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 0 18px' }} />

            {/* Checklist label */}
            <p style={{
              margin: '0 0 13px',
              fontSize: '10.5px', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'rgba(52,211,153,0.55)',
            }}>
              By continuing you confirm that:
            </p>

            {/* Checklist */}
            <ul style={{
              margin: '0 0 28px',
              padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
              {[
                'You are a researcher, student, or represent a laboratory / institution',
                'You understand these products are NOT for human or veterinary consumption',
                'You will use them strictly for research purposes only',
              ].map((text, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{
                    flexShrink: 0, marginTop: '2px',
                    width: '16px', height: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(16,185,129,0.1)',
                    border: '1px solid rgba(16,185,129,0.25)',
                    borderRadius: '50%',
                    fontSize: '8.5px', color: '#34d399', fontWeight: 900,
                  }}>✓</span>
                  <span style={{ fontSize: '13px', lineHeight: 1.55, color: 'rgba(155,185,220,0.82)' }}>
                    {text}
                  </span>
                </li>
              ))}
            </ul>

            {/* ── CTA button ── */}
            <button
              className="rg-cta"
              onClick={handleConfirm}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => { setBtnHover(false); setBtnActive(false); }}
              onMouseDown={() => setBtnActive(true)}
              onMouseUp={() => setBtnActive(false)}
              aria-label="Confirm research use and enter the store"
              style={{
                display: 'block', width: '100%',
                padding: '14px 24px',
                fontSize: '12.5px', fontWeight: 800,
                letterSpacing: '0.09em', textTransform: 'uppercase',
                color: '#ffffff',
                // Solid emerald — strong, readable, on-brand
                background: btnActive
                  ? '#0a9e66'
                  : btnHover
                    ? '#11c98a'
                    : '#0db876',
                border: '1px solid rgba(16,185,129,0.4)',
                borderRadius: '10px',
                cursor: 'pointer',
                boxShadow: btnHover
                  ? '0 6px 32px rgba(16,185,129,0.35), 0 2px 8px rgba(0,0,0,0.4)'
                  : '0 3px 20px rgba(16,185,129,0.2), 0 2px 6px rgba(0,0,0,0.35)',
                transform: btnActive ? 'translateY(0) scale(0.988)' : btnHover ? 'translateY(-1px)' : 'none',
                transition: 'background 0.16s ease, box-shadow 0.16s ease, transform 0.12s ease',
              }}
            >
              I Confirm — Enter the Store
            </button>

            {/* Dismiss link */}
            <button
              className="rg-dismiss"
              onClick={() => { setShowModal(false); notifyGateCleared(); }}
              aria-label="Not interested — close"
              style={{
                display: 'block', width: '100%',
                marginTop: '12px', padding: '7px',
                fontSize: '12px',
                color: 'rgba(80,115,160,0.55)',
                background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'center',
                transition: 'color 0.18s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(130,165,200,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(80,115,160,0.55)')}
            >
              I'm not interested
            </button>

            {/* Legal note */}
            <p style={{
              margin: '15px 0 0',
              paddingTop: '13px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              fontSize: '10.5px', lineHeight: 1.55,
              color: 'rgba(70,105,150,0.6)',
              textAlign: 'center',
            }}>
              All products are for in vitro research use only. Not intended to diagnose, treat, cure, or prevent any disease.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
