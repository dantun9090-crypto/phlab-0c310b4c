import {
  FlaskConical, FileCheck, Microscope, Mail, Home, Crown,
  ChevronDown, X, Shield,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { subscribeToProducts } from '@/lib/firebase';
import type { Product } from '@/lib/firebase';

interface DropdownItem {
  name: string;
  href: string;
  category?: string;
  color?: string;
}

interface NavLink {
  name: string;
  href: string;
  icon?: any;
  highlight?: boolean;
  dropdown?: DropdownItem[];
}

const CATEGORY_DISPLAY: Record<string, { label: string; badge: string; color: string }> = {
  'tissue-repair':       { label: 'Tissue Repair',    badge: 'Recovery',   color: '#10b981' },
  'metabolic-signaling': { label: 'GLP-1 / Metabolic', badge: 'Metabolic',  color: '#3b82f6' },
  'cellular-aging':      { label: 'Longevity',         badge: 'Anti-Aging', color: '#f59e0b' },
  'neurological':        { label: 'Nootropic',         badge: 'Cognitive',  color: '#a855f7' },
  'melanin':             { label: 'Melanocortin',      badge: 'Melanin',    color: '#ec4899' },
  'blends':              { label: 'Blends',            badge: 'Combo',      color: '#06b6d4' },
  'accessories':         { label: 'Accessories',       badge: 'Lab',        color: '#64748b' },
};

const BASE_NAV: Omit<NavLink, 'dropdown'>[] = [
  { name: 'Home',        href: '/',           icon: Home },
  { name: 'Peptides',    href: '/products',   icon: FlaskConical },
  { name: 'Lab Reports', href: '/lab-reports', icon: FileCheck },
  { name: 'Research',    href: '/research',   icon: Microscope },
  { name: 'Contact',     href: '/contact',    icon: Mail, highlight: true },
];

function useNavLinks(): NavLink[] {
  const [categories, setCategories] = useState<DropdownItem[]>([]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const load = () => {
      unsub = subscribeToProducts((prods: Product[]) => {
        const active = prods.filter(p => p.isActive !== false && p.stock > 0 && p.category);
        const seen = new Set<string>();
        const cats: DropdownItem[] = [{ name: 'All Products', href: '/products' }];
        active.forEach(p => {
          const slug = p.category!;
          if (seen.has(slug)) return;
          seen.add(slug);
          const cfg = CATEGORY_DISPLAY[slug];
          const label = cfg?.label ?? slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const badge = cfg?.badge;
          cats.push({ name: label, href: `/products/category/${slug}`, category: badge, color: cfg?.color });
        });
        setCategories(cats);
      });
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(load, { timeout: 3000 });
    } else {
      setTimeout(load, 800);
    }
    return () => unsub?.();
  }, []);

  return BASE_NAV.map(link =>
    link.name === 'Peptides' ? { ...link, dropdown: categories } : link
  );
}

function MobileNavItem({
  link, index, isActive, onClose,
}: { link: NavLink; index: number; isActive: (href: string) => boolean; onClose: () => void; }) {
  const active = isActive(link.href);
  const [expanded, setExpanded] = useState(false);
  const hasDropdown = !!(link.dropdown?.length);
  const navigate = useNavigate();
  const itemStyle: React.CSSProperties = { animationDelay: `${index * 50}ms`, animationFillMode: 'both' };

  if (hasDropdown) {
    return (
      <div style={itemStyle}>
        <button
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-left font-semibold transition-all duration-200 min-h-[52px]"
          style={active
            ? { background: 'rgba(16,185,129,0.12)', color: '#4ade80', border: '1px solid rgba(16,185,129,0.2)' }
            : { background: 'rgba(255,255,255,0.04)', color: '#d8eeff', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-3">
            {link.icon && <link.icon className="w-5 h-5 opacity-60" />}
            <span className="text-[15px]">{link.name}</span>
          </div>
          <ChevronDown className="w-4 h-4 transition-transform duration-300 opacity-50"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
        </button>
        <div style={{
          maxHeight: expanded ? '360px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.32s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <div className="pt-1.5 pb-1 ml-3 space-y-1">
            {link.dropdown!.map((item, i) => (
              <button
                key={i}
                onClick={() => { onClose(); navigate(item.href); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left min-h-[48px]"
                style={{ color: '#7aadcc' }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: i === 0 ? '#10b981' : 'rgba(16,185,129,0.25)' }} />
                <span className="flex-1 font-medium text-[14px]">{item.name}</span>
                {item.category && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                    style={{ background: 'rgba(16,185,129,0.08)', color: '#34d399' }}>
                    {item.category}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={itemStyle}>
      <Link
        to={link.href}
        onClick={() => { onClose(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }}
        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold transition-all duration-200 min-h-[52px]"
        style={
          link.highlight
            ? { background: 'rgba(16,185,129,0.12)', color: '#4ade80', border: '1px solid rgba(16,185,129,0.2)' }
            : active
            ? { background: 'rgba(255,255,255,0.07)', color: '#e4f0ff', border: '1px solid rgba(255,255,255,0.1)' }
            : { background: 'rgba(255,255,255,0.03)', color: '#c4daf0', border: '1px solid rgba(255,255,255,0.06)' }
        }
      >
        {link.icon && <link.icon className="w-5 h-5 opacity-60" />}
        <span className="text-[15px]">{link.name}</span>
      </Link>
    </div>
  );
}

function DesktopNavItem({ link, isActive }: { link: NavLink; isActive: (href: string) => boolean; }) {
  const hasDrop = !!(link.dropdown?.length);
  const [isOpen, setIsOpen] = useState(false);
  const active = isActive(link.href);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDrop = () => { if (timerRef.current) clearTimeout(timerRef.current); setIsOpen(true); };
  const closeDrop = () => { timerRef.current = setTimeout(() => setIsOpen(false), 100); };
  const keepDrop = () => { if (timerRef.current) clearTimeout(timerRef.current); };

  return (
    <div className="relative"
      onMouseEnter={hasDrop ? openDrop : undefined}
      onMouseLeave={hasDrop ? closeDrop : undefined}>
      <Link to={link.href}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all duration-150"
        style={
          link.highlight
            ? { background: 'rgba(16,185,129,0.12)', color: '#4ade80', border: '1px solid rgba(16,185,129,0.2)' }
            : active
            ? { color: '#e4f0ff', background: 'rgba(255,255,255,0.06)' }
            : { color: '#8db4d8', background: 'transparent' }
        }>
        {link.icon && <link.icon className="w-3.5 h-3.5" />}
        <span>{link.name}</span>
        {hasDrop && (
          <ChevronDown className="w-3 h-3 opacity-50 transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
        )}
      </Link>

      {hasDrop && (
        <div onMouseEnter={keepDrop} onMouseLeave={closeDrop}
          className="absolute left-0 z-[999] pt-1.5"
          style={{
            top: '100%',
            opacity: isOpen ? 1 : 0,
            visibility: isOpen ? 'visible' : 'hidden',
            transition: 'opacity 0.16s ease, visibility 0.16s',
            pointerEvents: isOpen ? 'auto' : 'none',
          }}>
          <div className="py-2 rounded-2xl"
            style={{ minWidth: '230px', background: '#030914', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <div className="px-4 pb-2 mb-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#1a4a2a' }}>
                Browse by category
              </span>
            </div>
            {link.dropdown!.map((item, i) => (
              <Link key={i} to={item.href}
                className="flex items-center gap-3 px-4 py-2.5 text-[13px]"
                style={{ color: '#8db4d8' }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: item.color ?? (i === 0 ? '#10b981' : 'rgba(16,185,129,0.3)') }} />
                <span className="flex-1 font-medium">{item.name}</span>
                {item.category && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
                    style={{ background: `${item.color ?? '#10b981'}18`, color: item.color ?? '#34d399' }}>
                    {item.category}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Navigation({
  user, isMobileMenuOpen, onMobileMenuToggle,
}: { user: any; isMobileMenuOpen: boolean; onMobileMenuToggle: () => void; }) {
  const location = useLocation();
  const navLinks = useNavLinks();
  const isActive = (href: string) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (isMobileMenuOpen) onMobileMenuToggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) onMobileMenuToggle();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobileMenuOpen, onMobileMenuToggle]);

  return (
    <>
      {/* DESKTOP NAV */}
      <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
        {navLinks.map(link => (
          <DesktopNavItem key={link.name} link={link} isActive={isActive} />
        ))}
        {user && (
          <Link to="/admin"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold"
            style={{ color: '#60a5fa' }}>
            <Crown className="w-3.5 h-3.5" />
            Admin
          </Link>
        )}
      </nav>

      {/* MOBILE DRAWER */}
      <div className="fixed inset-0 z-[98] md:hidden transition-opacity duration-300"
        style={{
          background: 'rgba(0,4,12,0.86)',
          opacity: isMobileMenuOpen ? 1 : 0,
          pointerEvents: isMobileMenuOpen ? 'auto' : 'none',
        }}
        onClick={onMobileMenuToggle} aria-hidden="true" />

      <aside role="dialog" aria-modal="true" aria-label="Navigation menu"
        className="fixed inset-y-0 right-0 z-[99] md:hidden flex flex-col"
        style={{
          width: 'min(320px, 90vw)',
          top: 'calc(32px + var(--rg-banner-h, 0px))',
          background: '#040d1a',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '-24px 0 80px rgba(0,0,0,0.6)',
          transform: isMobileMenuOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
        }}>
        {/* Drawer header: MENU label + close X */}
        <div className="flex items-center justify-between px-5 shrink-0"
          style={{ height: '64px', paddingTop: 'env(safe-area-inset-top)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#10b981' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3a6a5a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Menu
            </span>
          </div>
          <button onClick={onMobileMenuToggle} aria-label="Close menu"
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#8db4d8' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto"
          style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {navLinks.map((link, i) => (
            <MobileNavItem key={`${link.name}-${isMobileMenuOpen}`}
              link={link} index={i} isActive={isActive} onClose={onMobileMenuToggle} />
          ))}

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />

          {user ? (
            <>
              <Link to="/account" onClick={onMobileMenuToggle}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold min-h-[52px]"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#d8eeff', border: '1px solid rgba(255,255,255,0.07)' }}>
                <Shield className="w-4 h-4 opacity-60" />
                <span className="text-[15px]">My Account</span>
              </Link>
              <Link to="/admin" onClick={onMobileMenuToggle}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold min-h-[52px]"
                style={{ background: 'rgba(59,130,246,0.08)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.15)' }}>
                <Crown className="w-4 h-4 opacity-60" />
                <span className="text-[15px]">Admin Panel</span>
              </Link>
            </>
          ) : (
            <Link to="/login" onClick={onMobileMenuToggle}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl font-semibold min-h-[52px]"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#d8eeff', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Shield className="w-4 h-4 opacity-60" />
              <span className="text-[15px]">Login / Register</span>
            </Link>
          )}
        </nav>

        {/* Bottom trust strip */}
        <div className="px-5 py-4 shrink-0 text-center"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <span style={{ fontSize: '0.68rem', color: '#1e3a2a', letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 700 }}>
            HPLC ≥99% · UK Dispatch · CoA Included
          </span>
        </div>
      </aside>
    </>
  );
}
