import { createBrowserRouter, createMemoryRouter, Outlet, Navigate, useLocation } from 'react-router-dom';
import React, { useEffect, useState, Suspense } from 'react';
import { Layout } from '@/components/Layout';
import { PremiumLanding } from '@/components/PremiumLanding';
import ScrollToTop from '@/components/ScrollToTop';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazyWithRetry';


// Home stays eager — it is the LCP path served from `/`. Every other public
// route is code-split so a homepage visit does NOT pay for Products,
// ProductDetail, Contact, About, policy pages, etc. This is the single
// biggest win for mobile main-bundle size (~810 KB unused JS reported by
// PSI). NotFound is kept eager because it is a tiny stub and used as the
// catch-all fallback.
// Home is code-split — it's 600+ lines and pulls ~3-4 MB (Firebase, 30+ lucide
// icons, animations, popups, SEO index) into the entry chunk. The SSR shell in
// LegacyApp already paints LCP text before this chunk loads, so the Suspense
// fallback is only shown on client-side navigation back to /.
// `vitePrefetch: true` asks the browser to prefetch the chunk after the main
// bundle finishes so the tab-back navigation is instant.
const Home = lazyWithRetry(() => import(/* vitePrefetch: true */ '@/pages/Home'));
import NotFound from '@/pages/NotFound';

// Code-split: admin, checkout, payment, auth, account, VIP — not needed for
// first paint of the public store. Saves ~250–300 KB from the main bundle.
// lazyWithRetry retries a failed dynamic import once (handles the common
// post-deploy race where an in-flight fetch hits a just-purged chunk).
const Admin = lazyWithRetry(() => import('@/pages/Admin'));
const Checkout = lazyWithRetry(() => import('@/pages/Checkout'));
const Payment = lazyWithRetry(() => import('@/pages/Payment'));
const Account = lazyWithRetry(() => import('@/pages/Account'));
const Login = lazyWithRetry(() => import('@/pages/Login'));
const Register = lazyWithRetry(() => import('@/pages/Register'));
const VipStore = lazyWithRetry(() => import('@/pages/VipStore'));
// Code-split: previously eager public routes. Home visitors on mobile no
// longer download JS for these until they navigate.
const Products = lazyWithRetry(() => import('@/pages/Products'));
const ProductDetail = lazyWithRetry(() => import('@/pages/ProductDetail'));
const Contact = lazyWithRetry(() => import('@/pages/Contact'));
const About = lazyWithRetry(() => import('@/pages/About'));
const QualityControl = lazyWithRetry(() => import('@/pages/QualityControl'));
const Resources = lazyWithRetry(() => import('@/pages/Resources'));
const RefundPolicy = lazyWithRetry(() => import('@/pages/RefundPolicy'));
const ShippingPolicy = lazyWithRetry(() => import('@/pages/ShippingPolicy'));
const Terms = lazyWithRetry(() => import('@/pages/Terms'));
const PrivacyPolicy = lazyWithRetry(() => import('@/pages/PrivacyPolicy'));
const CookiePolicy = lazyWithRetry(() => import('@/pages/CookiePolicy'));
// Code-split: low-traffic content routes. SearchPage and ArticlePage both
// pull the full ~212 KB articles bundle — keep them out of every page load.
const SearchPage = lazyWithRetry(() => import('@/pages/Search'));
const ArticlePage = lazyWithRetry(() => import('@/pages/Resources/ArticlePage'));
const LandingPage = lazyWithRetry(() => import('@/pages/LandingPage'));
const StorageGuide = lazyWithRetry(() => import('@/pages/StorageGuide'));
const LabReports = lazyWithRetry(() => import('@/pages/LabReports'));
const Research = lazyWithRetry(() => import('@/pages/Research'));
const Install = lazyWithRetry(() => import('@/pages/Install'));
const RequestCatalog = lazyWithRetry(() => import('@/pages/RequestCatalog'));
const CategoryPage = lazyWithRetry(() => import('@/pages/CategoryPage'));
const PrivacyRequests = lazyWithRetry(() => import('@/pages/PrivacyRequests'));


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
    let unsub: (() => void) | undefined;
    let cancelled = false;
    // Dynamic import keeps Firebase Auth (~170 KB) out of the main bundle
    // — RequireAuth only wraps /admin and /account, which are already
    // lazy-loaded routes, so the auth SDK now loads on demand instead of
    // on every homepage visit.
    void import('@/lib/firebase-auth').then(({ auth, onAuthStateChanged }) => {
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (u) => {
        setStatus(u && !u.isAnonymous ? 'authed' : 'anon');
      });
    });
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);


  if (status === 'loading') return <PageLoader />;
  if (status === 'anon') {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  return <>{children}</>;
}



function AppLayout() {
  return (
    <>
      <ScrollToTop />
      <Layout>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </>
  );
}

const routes = [
  // ── Admin — rendered completely outside Layout (no nav, no animations, no overlays) ──
  {
    path: '/admin',
    element: (
      <ErrorBoundary>
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <Admin />
          </Suspense>
        </RequireAuth>
      </ErrorBoundary>
    ),
  },
  // /compound is a dedicated marketing route. Keep it outside the legacy
  // shop Layout during emergency CSR boot so it never falls through to 404
  // or renders a duplicate storefront header.
  { path: '/compound', element: <PremiumLanding eyebrow="UK Laboratory Supply" /> },
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
      { path: 'privacy-requests',  element: <PrivacyRequests /> },
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
      { path: 'request-catalog',   element: <RequestCatalog /> },
      { path: '*',                 element: <NotFound /> },
    ],
  },
];

export function createLegacyRouter(initialPath = '/') {
  if (typeof document === 'undefined') {
    return createMemoryRouter(routes, { initialEntries: [initialPath || '/'] });
  }
  return createBrowserRouter(routes);
}
