import { createBrowserRouter, Outlet, Navigate, useLocation } from 'react-router-dom';
import React, { useEffect, useState, useCallback, Suspense, lazy } from 'react';
import { Layout } from '@/components/Layout';
import ScrollToTop from '@/components/ScrollToTop';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { auth, onAuthStateChanged } from '@/lib/firebase-auth';

// Lazy-load intro animation — keeps it out of the critical-path bundle
const MolecularIntro = lazy(() => import('@/components/MolecularIntro'));

// Route pages are loaded eagerly so every direct URL paints immediately.
import Home from '@/pages/Home';
import Products from '@/pages/Products';
import ProductDetail from '@/pages/ProductDetail';
import CategoryPage from '@/pages/CategoryPage';
import SearchPage from '@/pages/Search';
import StorageGuide from '@/pages/StorageGuide';
import Account from '@/pages/Account';
import Register from '@/pages/Register';
import Login from '@/pages/Login';
import Admin from '@/pages/Admin';
import Contact from '@/pages/Contact';
import About from '@/pages/About';
import LandingPage from '@/pages/LandingPage';
import VipStore from '@/pages/VipStore';
import QualityControl from '@/pages/QualityControl';
import LabReports from '@/pages/LabReports';
import Resources from '@/pages/Resources';
import ArticlePage from '@/pages/Resources/ArticlePage';
import Research from '@/pages/Research';
import RefundPolicy from '@/pages/RefundPolicy';
import ShippingPolicy from '@/pages/ShippingPolicy';
import Terms from '@/pages/Terms';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import CookiePolicy from '@/pages/CookiePolicy';
import Payment from '@/pages/Payment';
import Checkout from '@/pages/Checkout';
import NotFound from '@/pages/NotFound';
import Install from '@/pages/Install';

// Minimal spinner shown while lazy chunks load
function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );
}

// Auth guard — redirects anonymous users to /login
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'authed' | 'anon'>('loading');
  const location = useLocation();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setStatus(u && !u.isAnonymous ? 'authed' : 'anon');
    });
    return unsub;
  }, []);

  if (status === 'loading') return <PageLoader />;
  if (status === 'anon') {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  return <>{children}</>;
}

const INTRO_SEEN_KEY = 'php_intro_seen';

function AppLayout() {
  const isCrawler = (() => {
    try {
      const ua = navigator.userAgent;
      // Skip intro for bots, Lighthouse, PageSpeed, and automated testing tools
      return /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|rogerbot|linkedinbot|bot|crawl|spider|lighthouse|pagespeed|headlesschrome|puppeteer|playwright/i.test(ua);
    } catch { return false; }
  })();

  const [showIntro, setShowIntro] = useState(() => {
    if (isCrawler) return false;
    try {
      if (sessionStorage.getItem(INTRO_SEEN_KEY)) return false;
      const conn = (navigator as any).connection;
      if (conn && (conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g')) return false;
      return true;
    } catch { return true; }
  });

  const [pageReady, setPageReady] = useState(() => {
    if (isCrawler) return true;
    try { return !!sessionStorage.getItem(INTRO_SEEN_KEY); } catch { return false; }
  });

  const handleIntroDone = useCallback(() => {
    try { sessionStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* noop */ }
    setShowIntro(false);
    setPageReady(true);
  }, []);

  // Safety timeout: if intro doesn't self-complete in 650ms, force skip
  useEffect(() => {
    if (!showIntro) return;
    const t = setTimeout(() => {
      handleIntroDone();
    }, 650);
    return () => clearTimeout(t);
  }, [showIntro, handleIntroDone]);

  return (
    <>
      {showIntro && (
        <Suspense fallback={null}>
          <MolecularIntro onDone={handleIntroDone} />
        </Suspense>
      )}
      {/* Page content always in DOM — intro overlays on top.
          Only pointer-events are blocked during intro so LCP element paints immediately. */}
      <div
        style={showIntro ? { pointerEvents: 'none' } : undefined}
        className={pageReady && showIntro === false ? 'fade-in-page' : ''}
      >
        <ScrollToTop />
        <Layout>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </Layout>
      </div>
    </>
  );
}

export const router = createBrowserRouter([
  // ── Admin — rendered completely outside Layout (no nav, no animations, no overlays) ──
  {
    path: '/admin',
    element: (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <RequireAuth>
            <Admin />
          </RequireAuth>
        </Suspense>
      </ErrorBoundary>
    ),
  },
  // ── All public routes — wrapped in Layout ──
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true,               element: <Home /> },
      { path: 'products',                    element: <Products /> },
      { path: 'products/category/:slug',      element: <CategoryPage /> },
      { path: 'products/:id',                 element: <ProductDetail /> },
      { path: 'search',            element: <SearchPage /> },
      { path: 'terms',             element: <Navigate to="/terms-and-conditions" replace /> },
      { path: 'storage-guide',     element: <StorageGuide /> },
      { path: 'privacy',           element: <Navigate to="/privacy-policy" replace /> },
      { path: 'account',           element: <Account /> },
      { path: 'register',          element: <Register /> },
      { path: 'login',             element: <Login /> },
      { path: 'contact',           element: <Contact /> },
      { path: 'about',             element: <About /> },
      { path: 'refund-policy',     element: <RefundPolicy /> },
      { path: 'shipping-policy',   element: <ShippingPolicy /> },
      { path: 'terms-of-service',  element: <Navigate to="/terms-and-conditions" replace /> },
      { path: 'terms-and-conditions', element: <Terms /> },
      { path: 'privacy-policy',    element: <PrivacyPolicy /> },
      { path: 'cookies',           element: <CookiePolicy /> },
      { path: 'payment',           element: <Payment /> },
      { path: 'checkout',           element: <Checkout /> },
      { path: 'landing/peptides',  element: <Navigate to="/products" replace /> },
      { path: 'landing/:slug',     element: <LandingPage /> },
      { path: 'vip',               element: <VipStore /> },
      { path: 'quality-control',   element: <QualityControl /> },
      { path: 'lab-reports',       element: <LabReports /> },
      { path: 'resources',         element: <Resources /> },
      { path: 'resources/:slug',   element: <ArticlePage /> },
      { path: 'research',          element: <Research /> },
      { path: 'install',           element: <Install /> },
      { path: '*',                 element: <NotFound /> },
    ],
  },
]);
