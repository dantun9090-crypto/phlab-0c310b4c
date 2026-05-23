import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { X, Crown } from 'lucide-react';

const NAV_LINKS = [
  { name: 'Home',      href: '/' },
  { name: 'Shop',      href: '/products' },
  { name: 'Protocols', href: '/research' },
  { name: 'Contact',   href: '/contact' },
];

export function Navigation({
  user,
  isMobileMenuOpen,
  onMobileMenuToggle,
}: {
  user: any;
  isMobileMenuOpen: boolean;
  onMobileMenuToggle: () => void;
}) {
  const location = useLocation();
  const isActive = (href: string) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  // Close on route change
  useEffect(() => {
    if (isMobileMenuOpen) onMobileMenuToggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // ESC closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) onMobileMenuToggle();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobileMenuOpen, onMobileMenuToggle]);

  return (
    <>
      {/* Desktop nav (>=md) */}
      <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
        {NAV_LINKS.map(link => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.name}
              to={link.href}
              className="px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all duration-150"
              style={
                active
                  ? { color: '#e4f0ff', background: 'rgba(255,255,255,0.06)' }
                  : { color: '#8db4d8', background: 'transparent' }
              }
            >
              {link.name}
            </Link>
          );
        })}
        {user && (
          <Link
            to="/admin"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all duration-150"
            style={{ color: '#60a5fa' }}
          >
            <Crown className="w-3.5 h-3.5" />
            Admin
          </Link>
        )}
      </nav>

      {/* Mobile drawer (<md) */}
      <div
        className="fixed inset-0 z-[98] md:hidden transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          opacity: isMobileMenuOpen ? 1 : 0,
          pointerEvents: isMobileMenuOpen ? 'auto' : 'none',
        }}
        onClick={onMobileMenuToggle}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="fixed top-0 right-0 bottom-0 z-[99] md:hidden flex flex-col bg-slate-900"
        style={{
          width: 'min(320px, 85vw)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
          transform: isMobileMenuOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Close button */}
        <div className="flex justify-end p-3">
          <button
            onClick={onMobileMenuToggle}
            aria-label="Close menu"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-2">
          {NAV_LINKS.map(link => (
            <Link
              key={link.name}
              to={link.href}
              onClick={onMobileMenuToggle}
              className="block rounded-lg text-white font-medium hover:bg-white/5 transition-colors"
              style={{ fontSize: '18px', padding: '16px' }}
              aria-current={isActive(link.href) ? 'page' : undefined}
            >
              {link.name}
            </Link>
          ))}
          {user && (
            <Link
              to="/admin"
              onClick={onMobileMenuToggle}
              className="block rounded-lg text-white font-medium hover:bg-white/5 transition-colors"
              style={{ fontSize: '18px', padding: '16px' }}
            >
              Admin
            </Link>
          )}
        </nav>
      </aside>
    </>
  );
}
