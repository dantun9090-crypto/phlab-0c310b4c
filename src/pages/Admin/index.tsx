import { useState, useEffect, useRef, Component, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { auth, db, doc, getDoc, onAuthStateChanged, logoutUser } from '@/lib/firebase';
import { checkAdminIpAllowed } from '@/lib/admin-ip-gate.functions';
import { logSecurityEvent } from '@/lib/security-events';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Loader2, Menu, WifiOff, RefreshCw, Clock, Command as CmdIcon, ExternalLink, LogOut, Cloud } from 'lucide-react';
import AdminSidebar from './components/AdminSidebar';
import CommandPalette, { type CommandItem } from './components/CommandPalette';
import DevModeBanner from './components/DevModeBanner';
import DashboardTab from './tabs/DashboardTab';
import InventoryTab from './tabs/InventoryTab';
import OrdersTab from './tabs/OrdersTab';
import CustomersTab from './tabs/CustomersTab';
import MarketingTab from './tabs/MarketingTab';
import DatabaseTab from './tabs/DatabaseTab';
import InvoicesTab from './tabs/InvoicesTab';
import BannerTab from './tabs/BannerTab';
import SiteSettingsTab from './tabs/SiteSettingsTab';
import ToolsTab from './tabs/ToolsTab';
import ThemesTab from './tabs/ThemesTab';
import BackupTab from './tabs/BackupTab';
import AdvertsTab from './tabs/AdvertsTab';
import PoliciesTab from './tabs/PoliciesTab';
import LandingPageTab from './tabs/LandingPageTab';
import ComplianceTab from './tabs/ComplianceTab';
import AuditLogTab from './tabs/AuditLogTab';
import EmailMarketingTab from './tabs/EmailMarketingTab';
import EmailPreviewTab from './tabs/EmailPreviewTab';
import IpWhitelistTab from './tabs/IpWhitelistTab';
import SEOTab from './tabs/SEOTab';
import { FeaturedProductsTab } from './tabs/FeaturedProductsTab';
import QCDashboardTab from './tabs/QCDashboardTab';
import SitemapTab from './tabs/SitemapTab';
import SitemapAuditTab from './tabs/SitemapAuditTab';
import PromoCodesTab from './tabs/PromoCodesTab';
import FreeGiftTab from './tabs/FreeGiftTab';
import DiagnosticsTab from './tabs/DiagnosticsTab';
import PrerenderStatusTab from './tabs/PrerenderStatusTab';
import GSCMonitorTab from './tabs/GSCMonitorTab';
import MarketingCoverageTab from './tabs/MarketingCoverageTab';
import MerchantFeedTab from './tabs/MerchantFeedTab';
import BingFeedTab from './tabs/BingFeedTab';
import IndexNowTab from './tabs/IndexNowTab';
import AuthEventsTab from './tabs/AuthEventsTab';
import VisitorsTab from './tabs/VisitorsTab';
import PrivacyRequestsTab from './tabs/PrivacyRequestsTab';
import CartEventsTab from './tabs/CartEventsTab';
import MailHealthTab from './tabs/MailHealthTab';
import SecurityAuditTab from './tabs/SecurityAuditTab';
import EdgeMonitorTab from './tabs/EdgeMonitorTab';
import SecurityEventsTab from './tabs/SecurityEventsTab';
import FenaTab from './tabs/FenaTab';
import PaymentsTab from './tabs/PaymentsTab';
import AIAssistantTab from './tabs/AIAssistantTab';
import ShopifyTab from './tabs/ShopifyTab';
import SemrushTab from './tabs/SemrushTab';
import SEOOpportunitiesTab from './tabs/SEOOpportunitiesTab';
import BacklinkOutreachTab from './tabs/BacklinkOutreachTab';
import CacheRecacheTab from './tabs/CacheRecacheTab';
import UrlMonitorTab from './tabs/UrlMonitorTab';
import RoyalMailTab from './tabs/RoyalMailTab';
import WebhookTestTab from './tabs/WebhookTestTab';
import WallidPreviewTab from './tabs/WallidPreviewTab';
import WallidBadgesTab from './tabs/WallidBadgesTab';
import WallidBanksTab from './tabs/WallidBanksTab';
import WatchdogTab from './tabs/WatchdogTab';
import HealthMonitorTab from './tabs/HealthMonitorTab';
import ResearchIncidentsTab from './tabs/ResearchIncidentsTab';
import LiveActivityTab from './tabs/LiveActivityTab';
import ToastAuditTab from './tabs/ToastAuditTab';

type Tab = 'dashboard' | 'ai' | 'inventory' | 'orders' | 'customers' | 'marketing' | 'database' | 'invoices' | 'banner' | 'settings' | 'tools' | 'themes' | 'backup' | 'adverts' | 'policies' | 'landing' | 'compliance' | 'auditlog' | 'authevents' | 'visitors' | 'liveactivity' | 'toastaudit' | 'privacyrequests' | 'cartevents' | 'mailhealth' | 'emailmarketing' | 'emailpreview' | 'ipwhitelist' | 'featured' | 'seo' | 'qc' | 'sitemap' | 'sitemapaudit' | 'promocodes' | 'freegift' | 'diagnostics' | 'prerenderstatus' | 'cacherecache' | 'gscmonitor' | 'marketingcoverage' | 'urlmonitor' | 'merchantfeed' | 'bingfeed' | 'indexnow' | 'securityaudit' | 'edgemonitor' | 'securityevents' | 'fena' | 'payments' | 'shopify' | 'semrush' | 'seoopportunities' | 'backlinkoutreach' | 'royalmail' | 'webhooktest' | 'wallidpreview' | 'wallidbadges' | 'wallidbanks' | 'watchdog' | 'healthmonitor' | 'researchincidents';


// IP whitelist enforcement now lives in src/lib/admin-ip-gate.functions.ts
// (a TanStack server function running in the Cloudflare Worker). The Worker
// reads cf-connecting-ip from the request — the client cannot forge it from
// JS, and the server fails closed if the whitelist is enabled but unreadable.


// Per-tab error boundary — crashes one tab without killing the whole Admin
class TabErrorBoundary extends Component<{ children: ReactNode; }, { hasError: boolean; error?: Error }> {
  state = { hasError: false, error: undefined as Error | undefined };
  static getDerivedStateFromError(e: Error) { return { hasError: true, error: e }; }
  render() {
    if (this.state.hasError) return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center px-6">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <WifiOff className="w-7 h-7 text-red-400" />
        </div>
        <div>
          <p className="text-white font-semibold mb-1">This tab failed to load</p>
          <p className="text-[#3a5a82] text-xs font-mono break-all max-w-md">{this.state.error?.message}</p>
        </div>
        <button onClick={() => this.setState({ hasError: false })} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
    return this.props.children;
  }
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [firestoreError, setFirestoreError] = useState(false);
  const [ipChecked, setIpChecked] = useState(false);
  const [ipAllowed, setIpAllowed] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [idleWarningSec, setIdleWarningSec] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recachePending, setRecachePending] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ⌘K / Ctrl+K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Track recache-pending flag (set elsewhere via window event 'admin:save')
  useEffect(() => {
    const read = () => {
      try { setRecachePending(localStorage.getItem('php_recache_pending') === '1'); } catch { /* noop */ }
    };
    read();
    const onSave = () => { try { localStorage.setItem('php_recache_pending', '1'); } catch { /* noop */ } read(); };
    const onStorage = (e: StorageEvent) => { if (e.key === 'php_recache_pending') read(); };
    window.addEventListener('admin:save', onSave);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('admin:save', onSave);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const update = () => setIsLargeScreen(window.innerWidth >= 1024);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Noindex for SEO
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    meta.id = 'noindex-admin';
    document.head.appendChild(meta);
    return () => document.getElementById('noindex-admin')?.remove();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/login');
        return;
      }
      try {
        // Check 'customers' collection using isAdmin: true flag
        const customerDoc = await getDoc(doc(db, 'customers', user.uid));
        if (customerDoc.exists() && customerDoc.data()?.isAdmin === true) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (err: any) {
        // Firestore unreachable (permission-denied or network) — show error instead of silently denying
        const code = err?.code || '';
        if (code === 'permission-denied' || code === 'unavailable' || code.includes('network')) {
          setFirestoreError(true);
        } else {
          setIsAdmin(false);
        }
      }
      setAuthChecked(true);
    });
    return () => unsub();
  }, [navigate]);

  // Listen for quick-action navigation events from DashboardTab
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail as Tab;
      if (tab) {
        setActiveTab(tab);
        setIsMobileSidebarOpen(false); // Close sidebar on mobile after navigation
      }
    };
    window.addEventListener('admin:navigate', handler);
    return () => window.removeEventListener('admin:navigate', handler);
  }, []);

  // Mark recache as pending whenever any admin save fires
  useEffect(() => {
    const handler = () => localStorage.setItem('php_recache_pending', String(Date.now()));
    window.addEventListener('admin:save', handler);
    return () => window.removeEventListener('admin:save', handler);
  }, []);

  // Apply admin dark theme class to body — MUST be before any early returns
  useEffect(() => {
    document.body.classList.add('admin-dark');
    return () => {
      document.body.classList.remove('admin-dark');
    };
  }, []);

  // IP whitelist check — runs once after auth confirms admin. Enforcement
  // happens server-side (Worker reads cf-connecting-ip); the client only
  // renders the result. Fail closed on RPC errors.
  useEffect(() => {
    if (!authChecked || !isAdmin) return;
    checkAdminIpAllowed()
      .then((result) => {
        setIpAllowed(result.allowed);
        setIpChecked(true);
      })
      .catch(() => {
        setIpAllowed(false);
        setIpChecked(true);
      });
  }, [authChecked, isAdmin]);
  // D: Admin idle auto-logout — 15 min idle, with 60s warning modal.
  useEffect(() => {
    if (!authChecked || !isAdmin) return;
    const IDLE_MS = 15 * 60 * 1000;
    const WARN_MS = 60 * 1000;

    const clearAll = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };

    const doLogout = async () => {
      clearAll();
      logSecurityEvent({ type: 'admin_idle_logout', route: '/admin', message: 'idle-15m' });
      try { await logoutUser(); } catch { /* ignore */ }
      navigate('/login');
    };

    const startCountdown = () => {
      setIdleWarningSec(WARN_MS / 1000);
      countdownRef.current = setInterval(() => {
        setIdleWarningSec(s => {
          if (s <= 1) { return 0; }
          return s - 1;
        });
      }, 1000);
    };

    const reset = () => {
      clearAll();
      setIdleWarningSec(0);
      warningTimerRef.current = setTimeout(() => {
        startCountdown();
        idleTimerRef.current = setTimeout(doLogout, WARN_MS);
      }, IDLE_MS - WARN_MS);
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearAll();
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [authChecked, isAdmin, navigate]);


  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-[#9cb8d9] text-sm">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (firestoreError) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-8 bg-[#04101f] rounded-2xl border border-red-500/20 max-w-sm mx-4"
        >
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <WifiOff className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Database Unavailable</h2>
          <p className="text-[#9cb8d9] text-sm mb-2">
            Cannot connect to the database right now. This may be due to Firestore rules not being deployed or a temporary network issue.
          </p>
          <p className="text-[#3a5a82] text-xs mb-6">
            If this persists, deploy Firestore rules via Firebase Console → Firestore → Rules.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors mb-3"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Connection
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-xl text-sm font-medium transition-colors"
          >
            Return Home
          </button>
        </motion.div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-8 bg-[#04101f] rounded-2xl border border-red-500/20 max-w-sm mx-4"
        >
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-[#9cb8d9] text-sm mb-6">
            This area is restricted to admin accounts only.
            Your account role does not have the required permissions.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-xl text-sm font-medium transition-colors"
          >
            Return Home
          </button>
        </motion.div>
      </div>
    );
  }

  // Show spinner while IP check runs
  if (!ipChecked) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-[#9cb8d9] text-sm">Verifying connection...</p>
        </div>
      </div>
    );
  }

  if (!ipAllowed) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-8 bg-[#04101f] rounded-2xl border border-orange-500/20 max-w-sm mx-4"
        >
          <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-orange-400" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">IP Not Authorised</h2>
          <p className="text-[#9cb8d9] text-sm mb-2">
            Your current IP address is not on the admin access whitelist.
          </p>
          <p className="text-[#3a5a82] text-xs mb-6">
            If you need access, ask an admin to add your IP in Admin → IP Whitelist.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-xl text-sm font-medium transition-colors"
          >
            Return Home
          </button>
        </motion.div>
      </div>
    );
  }

  const renderTab = () => {
    const tab = (() => {
      switch (activeTab) {

        case 'dashboard': return <DashboardTab />;
        case 'ai': return <AIAssistantTab />;
        case 'inventory': return <InventoryTab />;
        case 'orders': return <OrdersTab />;
        case 'customers': return <CustomersTab />;
        case 'invoices': return <InvoicesTab />;
        case 'banner': return <BannerTab />;
        case 'settings': return <SiteSettingsTab />;
        case 'tools': return <ToolsTab />;
        case 'themes': return <ThemesTab />;
        case 'marketing': return <MarketingTab />;
        case 'database': return <DatabaseTab />;
        case 'backup': return <BackupTab />;
        case 'adverts': return <AdvertsTab />;
        case 'policies': return <PoliciesTab />;
        case 'landing': return <LandingPageTab />;
        case 'compliance': return <ComplianceTab />;
        case 'auditlog': return <AuditLogTab />;
        case 'authevents': return <AuthEventsTab />;
        case 'visitors': return <VisitorsTab />;
        case 'liveactivity': return <LiveActivityTab />;
        case 'toastaudit': return <ToastAuditTab />;
        case 'privacyrequests': return <PrivacyRequestsTab />;
        case 'cartevents': return <CartEventsTab />;
        case 'mailhealth': return <MailHealthTab />;
        case 'fena': return <FenaTab />;
        case 'payments': return <PaymentsTab />;
        case 'emailmarketing': return <EmailMarketingTab />;

        case 'emailpreview': return <EmailPreviewTab />;
        case 'ipwhitelist': return <IpWhitelistTab />;
        case 'featured': return <FeaturedProductsTab />;
        case 'seo': return <SEOTab />;
        case 'sitemap': return <SitemapTab />;
        case 'sitemapaudit': return <SitemapAuditTab />;
        case 'qc': return <QCDashboardTab />;
        case 'promocodes': return <PromoCodesTab />;
        case 'freegift': return <FreeGiftTab />;
        case 'diagnostics': return <DiagnosticsTab />;
        case 'prerenderstatus': return <PrerenderStatusTab />;
        case 'cacherecache': return <CacheRecacheTab />;
        case 'gscmonitor': return <GSCMonitorTab />;
        case 'marketingcoverage': return <MarketingCoverageTab />;
        case 'urlmonitor': return <UrlMonitorTab />;
        case 'merchantfeed': return <MerchantFeedTab />;
        case 'bingfeed': return <BingFeedTab />;
        case 'indexnow': return <IndexNowTab />;
        case 'securityaudit': return <SecurityAuditTab />;
        case 'edgemonitor': return <EdgeMonitorTab />;
        case 'securityevents': return <SecurityEventsTab />;
        case 'shopify': return <ShopifyTab />;
        case 'semrush': return <SemrushTab />;
        case 'seoopportunities': return <SEOOpportunitiesTab />;
        case 'backlinkoutreach': return <BacklinkOutreachTab />;
        case 'royalmail': return <RoyalMailTab />;
        case 'webhooktest': return <WebhookTestTab />;
        case 'wallidpreview': return <WallidPreviewTab />;
        case 'wallidbadges': return <WallidBadgesTab />;
       case 'wallidbanks': return <WallidBanksTab />;
        case 'watchdog': return <WatchdogTab />;
        case 'healthmonitor': return <HealthMonitorTab />;
        case 'researchincidents': return <ResearchIncidentsTab />;
        default: return <DashboardTab />;
      }
    })();
    return <TabErrorBoundary key={activeTab}>{tab}</TabErrorBoundary>;
  };

  const sidebarWidth = sidebarCollapsed ? 68 : 256;

  // Tab label lookup for header breadcrumb
  const TAB_LABELS: Record<string, string> = {
    dashboard: 'Dashboard', ai: 'AI Assistant', inventory: 'Inventory', featured: 'Featured',
    qc: 'QC Dashboard', orders: 'Orders', customers: 'Customers',
    compliance: 'Compliance', auditlog: 'Audit Log', authevents: 'Auth Events', visitors: 'Visitors', liveactivity: 'Live Activity', toastaudit: 'Toast Audit', cartevents: 'Cart Events', mailhealth: 'Mail Health', invoices: 'Invoices', banner: 'Promo Banner',
    adverts: 'Adverts', landing: 'Landing Pages', policies: 'Policies',
    marketing: 'Marketing', emailmarketing: 'Email Campaigns', emailpreview: 'Email Preview',
    seo: 'SEO Settings', sitemap: 'Sitemap Manager', settings: 'Site Settings',
    tools: 'Tools', themes: 'Themes', database: 'Database', backup: 'Backup',
    ipwhitelist: 'IP Whitelist', promocodes: 'Promo Codes', freegift: 'Free Gift Promo', diagnostics: 'Diagnostics',
    prerenderstatus: 'Prerender Status', cacherecache: 'Cache & Recache', gscmonitor: 'GSC Monitor', marketingcoverage: 'Marketing Coverage', urlmonitor: 'URL Monitor', merchantfeed: 'Merchant Feed', bingfeed: 'Bing Shopping', indexnow: 'IndexNow',
    securityaudit: 'Security Audit', fena: 'Fena Payments', payments: 'Payment Gateways', shopify: 'Shopify', semrush: 'Semrush', seoopportunities: 'SEO Opportunities',
    royalmail: 'Royal Mail Labels', webhooktest: 'Webhook Test', wallidpreview: 'Wallid Preview', wallidbadges: 'Wallid Badges', wallidbanks: 'Wallid Banks', watchdog: 'Watchdog', healthmonitor: 'Health Monitor', researchincidents: 'Research Incidents',
  };
  const activeLabel = TAB_LABELS[activeTab] ?? activeTab;

  // Command palette items: every tab + quick actions
  const paletteItems: CommandItem[] = [
    ...Object.entries(TAB_LABELS).map(([id, label]) => ({
      id: `tab:${id}`,
      label,
      group: 'Navigate',
      keywords: id,
      action: () => setActiveTab(id as Tab),
    })),
    {
      id: 'action:recache',
      label: 'Cache & Recache',
      group: 'Actions',
      icon: Cloud,
      keywords: 'purge cloudflare prerender',
      action: () => setActiveTab('cacherecache'),
    },
    {
      id: 'action:clear-pending',
      label: 'Clear pending-publish flag',
      group: 'Actions',
      icon: RefreshCw,
      keywords: 'amber dot pending',
      action: () => { try { localStorage.removeItem('php_recache_pending'); } catch { /* noop */ } setRecachePending(false); },
    },
    {
      id: 'action:open-site',
      label: 'Open phlabs.co.uk in new tab',
      group: 'Actions',
      icon: ExternalLink,
      action: () => window.open('https://phlabs.co.uk', '_blank', 'noreferrer'),
    },
    {
      id: 'action:logout',
      label: 'Log out',
      group: 'Actions',
      icon: LogOut,
      action: () => { logoutUser().finally(() => navigate('/login')); },
    },
  ];

  return (
    <div
      id="admin-panel"
      className="min-h-screen flex overflow-x-hidden"
      style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(12,28,52,0.9) 0%, #040d1a 55%, #030b17 100%)' }}
    >
      {/* ── Desktop sidebar (fixed) ── */}
      <div
        className="hidden lg:flex flex-col fixed top-0 left-0 h-screen z-40"
        style={{ width: sidebarWidth, transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)' }}
      >
        <AdminSidebar
          activeTab={activeTab}
          setActiveTab={(tab) => setActiveTab(tab as Tab)}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />
      </div>

      {/* ── Mobile: backdrop ── */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="lg:hidden fixed inset-0 z-40 bg-black/75"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile: slide-in drawer ── */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className="lg:hidden fixed top-0 left-0 h-screen z-50 w-64 flex flex-col"
            style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}
          >
            <AdminSidebar
              activeTab={activeTab}
              setActiveTab={(tab) => setActiveTab(tab as Tab)}
              collapsed={false}
              setCollapsed={() => {}}
              isMobileOpen={isMobileSidebarOpen}
              onMobileClose={() => setIsMobileSidebarOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content area ── */}
      <div
        className="flex-1 flex flex-col min-h-screen min-w-0"
        style={{ marginLeft: isLargeScreen ? sidebarWidth : 0, transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)' }}
      >
        {/* ── Mobile top bar ── */}
        <header
          className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 border-b shrink-0"
          style={{
            background: 'rgba(4,12,24,0.97)',
            borderColor: 'rgba(59,130,246,0.1)',
          }}
        >
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open admin menu"
            aria-expanded={isMobileSidebarOpen}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all touch-manipulation shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center shadow-[0_0_12px_rgba(59,130,246,0.4)] shrink-0">
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-[13px] font-bold leading-none">{activeLabel}</p>
              <p className="text-blue-400/50 text-[9px] font-semibold tracking-widest uppercase mt-0.5">Admin Console</p>
            </div>
          </div>

          {/* Recache pending dot — only when a save has set the flag */}
          {recachePending && (
            <div className="shrink-0 w-2 h-2 rounded-full bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.6)]" title="Changes pending publish" />
          )}
        </header>

        {/* ── Desktop header bar ── */}
        <header
          className="hidden lg:flex items-center justify-between px-6 h-12 shrink-0 border-b"
          style={{
            background: 'rgba(4,12,24,0.7)',
            borderColor: 'rgba(59,130,246,0.07)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(59,130,246,0.4)' }}>
              Admin Console
            </span>
            <span style={{ color: 'rgba(59,130,246,0.2)' }}>/</span>
            <span className="text-[13px] font-semibold text-white/80">{activeLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] text-[#9cb8d9] hover:text-white transition-colors border border-white/10 hover:border-blue-400/40 bg-white/[0.02]"
              title="Open command palette"
            >
              <CmdIcon className="w-3 h-3" />
              <span>Quick jump</span>
              <kbd className="font-mono text-[10px] text-[#3a5a82] border border-white/10 rounded px-1">⌘K</kbd>
            </button>
            {recachePending && (
              <span className="flex items-center gap-1.5 text-[10px] text-amber-300/90" title="Changes pending publish">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                pending
              </span>
            )}
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-[#3a5a82] hover:text-[#9cb8d9] transition-colors"
            >
              <Shield className="w-3 h-3" />
              <span>phlabs.co.uk</span>
            </a>
          </div>
        </header>

        {/* ── Cloudflare Dev Mode warning (3h auto-expiry → blank page risk) ── */}
        <DevModeBanner />

        {/* ── Tab content ── */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden" style={{ isolation: 'auto' }}>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            className="min-h-full p-4 sm:p-6"
          >
            {renderTab()}
          </motion.div>
        </main>
      </div>
      {/* D: Idle warning modal */}
      {idleWarningSec > 0 && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center px-4">
          <div className="max-w-sm w-full bg-[#04101f] border border-amber-500/40 rounded-2xl p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-amber-400" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Still there?</h3>
            <p className="text-[#9cb8d9] text-sm mb-1">
              You'll be signed out for inactivity in
            </p>
            <p className="text-amber-300 text-3xl font-bold tabular-nums mb-5">{idleWarningSec}s</p>
            <button
              onClick={() => {
                // Any click resets the timer (event listener handles it)
                setIdleWarningSec(0);
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Stay signed in
            </button>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />
    </div>
  );
}
