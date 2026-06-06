import {
  LayoutDashboard, Package, ShoppingCart, Users, LogOut,
  Database, FileText, Image, Settings,
  Zap, Palette, Megaphone, HardDrive, Radio, FlaskConical,
  Scale, Rocket, Shield, PanelLeftClose, PanelLeft, Mail, Lock, Star, Eye, Search, ShieldCheck, Map, X, ChevronDown, Tag, Activity, ShoppingBag, CreditCard, Sparkles, TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, signOut } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

const navGroups = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'ai', label: 'AI Assistant', icon: Sparkles },
    ],
  },
  {
    label: 'Store',
    items: [
      { id: 'inventory', label: 'Inventory', icon: Package },
      { id: 'featured', label: 'Featured', icon: Star },
      { id: 'qc', label: 'QC Dashboard', icon: ShieldCheck },
      { id: 'orders', label: 'Orders', icon: ShoppingCart },
      { id: 'customers', label: 'Customers', icon: Users },
      { id: 'compliance', label: 'Compliance', icon: Shield },
      { id: 'auditlog', label: 'Audit Log', icon: Shield },
      { id: 'authevents', label: 'Auth Events', icon: Activity },
      { id: 'invoices', label: 'Invoices', icon: FileText },
      { id: 'payments', label: 'Payment Gateways', icon: CreditCard },
      { id: 'fena', label: 'Fena Payments', icon: CreditCard },
      { id: 'shopify', label: 'Shopify', icon: ShoppingBag },



    ],
  },
  {
    label: 'Content',
    items: [
      { id: 'banner', label: 'Promo Banner', icon: Image },
      { id: 'adverts', label: 'Adverts', icon: Radio },
      { id: 'landing', label: 'Landing Pages', icon: Rocket },
      { id: 'policies', label: 'Policies', icon: Scale },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { id: 'marketing', label: 'Marketing', icon: Megaphone },
      { id: 'promocodes', label: 'Promo Codes', icon: Tag },
      { id: 'emailmarketing', label: 'Email Campaigns', icon: Mail },
      { id: 'emailpreview', label: 'Email Preview', icon: Eye },
    ],
  },
  {
    label: 'SEO',
    items: [
      { id: 'seo', label: 'SEO Settings', icon: Search },
      { id: 'sitemap', label: 'Sitemap Manager', icon: Map },
      { id: 'sitemapaudit', label: 'Sitemap Audit', icon: Map },
      { id: 'prerenderstatus', label: 'Prerender Status', icon: Activity },
      { id: 'gscmonitor', label: 'GSC Monitor', icon: Search },
      { id: 'semrush', label: 'Semrush', icon: TrendingUp },
      { id: 'merchantfeed', label: 'Merchant Feed', icon: ShoppingBag },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'settings', label: 'Site Settings', icon: Settings },
      { id: 'tools', label: 'Tools', icon: Zap },
      { id: 'themes', label: 'Themes', icon: Palette },
      { id: 'database', label: 'Database', icon: Database },
      { id: 'backup', label: 'Backup', icon: HardDrive },
      { id: 'ipwhitelist', label: 'IP Whitelist', icon: Lock },
      { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
      { id: 'mailhealth', label: 'Mail Health', icon: Mail },
      { id: 'securityaudit', label: 'Security Audit', icon: ShieldCheck },
      { id: 'securityevents', label: 'Security Events', icon: Activity },
    ],
  },
];

const ITEM_ACCENTS: Record<string, string> = {
  dashboard: 'from-blue-500 to-blue-600',
  inventory: 'from-cyan-500 to-cyan-600',
  orders: 'from-violet-500 to-violet-600',
  customers: 'from-indigo-500 to-indigo-600',
  compliance: 'from-emerald-500 to-emerald-600',
  invoices: 'from-sky-500 to-sky-600',
  banner: 'from-amber-500 to-amber-600',
  adverts: 'from-orange-500 to-orange-600',
  landing: 'from-rose-500 to-rose-600',
  marketing: 'from-pink-500 to-pink-600',
  emailmarketing: 'from-blue-400 to-indigo-500',
  emailpreview: 'from-indigo-400 to-blue-500',
  themes: 'from-purple-500 to-purple-600',
  policies: 'from-slate-400 to-slate-500',
  seo: 'from-green-500 to-emerald-600',
  sitemap: 'from-teal-400 to-green-500',
  settings: 'from-gray-400 to-gray-500',
  ipwhitelist: 'from-red-500 to-orange-500',
  tools: 'from-yellow-500 to-yellow-600',
  database: 'from-red-500 to-red-600',
  backup: 'from-teal-500 to-teal-600',
  featured: 'from-amber-400 to-yellow-500',
  qc: 'from-emerald-400 to-teal-500',
  promocodes: 'from-emerald-500 to-green-600',
};

export default function AdminSidebar({ activeTab, setActiveTab, collapsed, setCollapsed, isMobileOpen, onMobileClose }: SidebarProps) {
  const navigate = useNavigate();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    onMobileClose?.();
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 256 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col h-full overflow-hidden select-none"
      style={{
        background: 'linear-gradient(180deg, #040c19 0%, #050e1d 60%, #040c19 100%)',
        borderRight: '1px solid rgba(59,130,246,0.1)',
        boxShadow: '4px 0 32px rgba(0,0,0,0.6)',
      }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent pointer-events-none" />

      {/* ── Brand header ── */}
      <div
        className={`flex items-center gap-3 px-3 py-3.5 shrink-0 border-b ${collapsed ? 'justify-center' : ''}`}
        style={{ borderColor: 'rgba(59,130,246,0.08)', minHeight: 60 }}
      >
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center shadow-[0_0_16px_rgba(59,130,246,0.45)]">
            <FlaskConical style={{ width: 15, height: 15 }} className="text-white" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-[#040c19] shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.16 }}
              className="flex-1 min-w-0"
            >
              <p className="text-white font-bold text-[13px] leading-tight tracking-tight">PH Labs</p>
              <p className="text-blue-400/60 text-[9px] font-semibold tracking-widest uppercase mt-0.5">Admin Console</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Close button — mobile drawer */}
        {isMobileOpen && onMobileClose && (
          <button
            onClick={onMobileClose}
            aria-label="Close menu"
            className="lg:hidden ml-auto shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[#4a6a8a] hover:text-white hover:bg-white/[0.08] transition-all"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>

      {/* ── Nav scroll area ── */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden py-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {navGroups.map((group) => {
          const isGroupCollapsed = collapsedGroups.has(group.label);
          const hasActiveItem = group.items.some(i => i.id === activeTab);

          return (
            <div key={group.label} className="mb-0.5">
              {/* Group header */}
              <AnimatePresence>
                {!collapsed && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center justify-between px-3 pt-3 pb-1.5 group"
                  >
                    <span
                      className="text-[9px] font-bold uppercase tracking-[0.16em]"
                      style={{ color: hasActiveItem ? 'rgba(96,165,250,0.7)' : 'rgba(59,130,246,0.3)' }}
                    >
                      {group.label}
                    </span>
                    <ChevronDown
                      style={{ width: 10, height: 10 }}
                      className={`transition-transform duration-200 ${isGroupCollapsed ? '-rotate-90' : ''}`}
                      color="rgba(59,130,246,0.25)"
                    />
                  </motion.button>
                )}
              </AnimatePresence>
              {collapsed && (
                <div className="mx-3 my-2 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
              )}

              {/* Group items */}
              <AnimatePresence initial={false}>
                {(!isGroupCollapsed || collapsed) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className={`space-y-0.5 ${collapsed ? 'px-1.5' : 'px-2'}`}>
                      {group.items.map((item) => {
                        const isActive = activeTab === item.id;
                        const accent = ITEM_ACCENTS[item.id] || 'from-blue-500 to-blue-600';

                        return (
                          <button
                            key={item.id}
                            onClick={() => handleTabClick(item.id)}
                            title={collapsed ? item.label : undefined}
                            aria-label={item.label}
                            aria-current={isActive ? 'page' : undefined}
                            className={`w-full flex items-center transition-all duration-200 relative group rounded-xl touch-manipulation
                              ${collapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'}
                              ${isActive ? 'shadow-[0_2px_12px_rgba(37,99,235,0.18)]' : 'hover:bg-white/[0.04]'}
                            `}
                            style={isActive ? {
                              background: 'linear-gradient(135deg, rgba(37,99,235,0.16) 0%, rgba(59,130,246,0.08) 100%)',
                              border: '1px solid rgba(59,130,246,0.2)',
                            } : {
                              border: '1px solid transparent',
                            }}
                          >
                            {/* Active indicator */}
                            {isActive && !collapsed && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-gradient-to-b from-blue-400 to-blue-600" />
                            )}

                            {/* Icon */}
                            <div className={`shrink-0 flex items-center justify-center rounded-lg transition-all duration-200
                              ${isActive
                                ? `w-6 h-6 bg-gradient-to-br ${accent} shadow-[0_2px_8px_rgba(37,99,235,0.3)]`
                                : 'w-6 h-6 bg-white/[0.04] group-hover:bg-white/[0.08]'
                              }`}
                            >
                              <item.icon
                                style={{ width: 12, height: 12 }}
                                className={isActive ? 'text-white' : 'text-[#4a6a8a] group-hover:text-[#8caad4] transition-colors'}
                              />
                            </div>

                            {/* Label */}
                            <AnimatePresence>
                              {!collapsed && (
                                <motion.span
                                  initial={{ opacity: 0, x: -4 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: -4 }}
                                  transition={{ duration: 0.14 }}
                                  className={`text-[12px] font-medium whitespace-nowrap transition-colors leading-none flex-1 text-left
                                    ${isActive ? 'text-white' : 'text-[#5a7a9a] group-hover:text-[#9ab4cc]'}
                                  `}
                                >
                                  {item.label}
                                </motion.span>
                              )}
                            </AnimatePresence>

                            {/* Active dot when collapsed */}
                            {isActive && collapsed && (
                              <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-blue-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* ── Footer actions ── */}
      <div
        className="shrink-0 border-t py-2 space-y-0.5"
        style={{ borderColor: 'rgba(59,130,246,0.08)' }}
      >
        {/* View site */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-2"
            >
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[#3a5a82] hover:text-[#8caad4] hover:bg-white/[0.04] transition-all group border border-transparent"
              >
                <div className="w-6 h-6 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
                  <Eye style={{ width: 11, height: 11 }} />
                </div>
                <span className="text-[11px] font-medium whitespace-nowrap">View Site</span>
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sign out */}
        <div className={`px-2`}>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[#3a5a82] hover:text-red-400 hover:bg-red-500/[0.06] transition-all group border border-transparent touch-manipulation
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <div className="w-6 h-6 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
              <LogOut style={{ width: 11, height: 11 }} />
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  className="text-[12px] font-medium whitespace-nowrap"
                >
                  Sign Out
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Collapse toggle — desktop only */}
        <div className="px-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`hidden lg:flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-[#2a3a5a] hover:text-[#9cb8d9] hover:bg-white/[0.03] transition-all group border border-transparent
              ${collapsed ? 'justify-center' : ''}
            `}
          >
            <div className="w-6 h-6 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
              {collapsed
                ? <PanelLeft style={{ width: 11, height: 11 }} />
                : <PanelLeftClose style={{ width: 11, height: 11 }} />
              }
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  className="text-[10px] font-medium whitespace-nowrap"
                >
                  Collapse
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
