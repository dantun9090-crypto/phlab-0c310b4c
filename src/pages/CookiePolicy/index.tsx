import { Cookie, BarChart2, Settings, Shield, Globe, Mail, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { Link } from 'react-router-dom';

export default function CookiePolicy() {
  useSEO('cookies', {
    title: 'Cookie Policy | PH Labs UK',
    metaDescription: 'Cookie Policy — PH Labs Ltd UK. Essential & analytics cookies on our UK research peptides store. GDPR compliant. Manage your cookie preferences easily.',
    canonical: 'https://www.prohealthpeptides.co.uk/cookies',
    ogImage: 'https://cdn.wegic.ai/assets/onepage/agent/images/1779306071784_0.jpg',
  });

  const sections = [
    {
      id: 'what',
      icon: Cookie,
      iconColor: '#f59e0b',
      title: 'What Are Cookies?',
      content: (
        <p className="leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
          Cookies are small text files placed on your device when you visit a website. They allow the site to recognise your device on subsequent visits and remember preferences or login status. Cookies cannot run programs or deliver viruses — they are simply data files unique to you and your device.
        </p>
      ),
    },
    {
      id: 'essential',
      icon: Shield,
      iconColor: '#10B981',
      title: 'Essential Cookies',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            These cookies are necessary for the website to function properly. They enable core features such as security, authentication, and shopping cart functionality. Essential cookies cannot be disabled.
          </p>
          <div className="space-y-3">
            {[
              { name: 'auth_token', purpose: 'Keeps you signed in', duration: '30 days' },
              { name: 'cart_session', purpose: 'Remembers items in your cart', duration: '7 days' },
              { name: 'csrf_token', purpose: 'Prevents security attacks', duration: 'Session' },
              { name: 'cookie_consent', purpose: 'Records your cookie preferences', duration: '1 year' },
            ].map(({ name, purpose, duration }) => (
              <div key={name} className="p-3 rounded-lg border" style={{ background: '#0b1a30', borderColor: 'rgba(16,185,129,0.15)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold font-mono" style={{ color: '#10B981' }}>{name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>{duration}</span>
                </div>
                <p className="text-[10px]" style={{ color: '#9cb8d9' }}>{purpose}</p>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      id: 'analytics',
      icon: BarChart2,
      iconColor: '#3b82f6',
      title: 'Analytics Cookies (Optional)',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            We use Google Analytics to understand how visitors use our site. These cookies collect anonymous data such as page views, time on site, and navigation patterns. You can opt out at any time via our cookie banner.
          </p>
          <div className="space-y-3">
            {[
              { name: '_ga', purpose: 'Distinguishes unique visitors', duration: '2 years', provider: 'Google Analytics' },
              { name: '_ga_*', purpose: 'Tracks session state', duration: '2 years', provider: 'Google Analytics' },
              { name: '_gid', purpose: 'Distinguishes users', duration: '24 hours', provider: 'Google Analytics' },
            ].map(({ name, purpose, duration, provider }) => (
              <div key={name} className="p-3 rounded-lg border" style={{ background: '#0b1a30', borderColor: 'rgba(59,130,246,0.15)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold font-mono" style={{ color: '#3b82f6' }}>{name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>{duration}</span>
                </div>
                <p className="text-[10px] mb-1" style={{ color: '#9cb8d9' }}>{purpose}</p>
                <p className="text-[10px]" style={{ color: '#3a5a82' }}>
                  <span className="font-semibold">Provider:</span> {provider}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg border" style={{ background: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.15)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#3b82f6' }}>
              <span className="font-semibold">Google Analytics 4 (GA4):</span> All data is anonymised and aggregated. No personally identifiable information is collected. Google's privacy policy applies to this data.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'manage',
      icon: Settings,
      iconColor: '#8b5cf6',
      title: 'Managing Your Cookie Preferences',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            You have full control over which cookies we use. You can change your preferences at any time using the methods below:
          </p>
          <div className="space-y-3">
            {[
              { method: 'Cookie Banner', description: 'Click "Cookie Settings" in the banner that appears on your first visit', icon: CheckCircle2 },
              { method: 'Browser Settings', description: 'Configure your browser to block or delete cookies (may affect site functionality)', icon: Globe },
              { method: 'Opt-Out Tools', description: 'Use Google Analytics opt-out browser add-on or similar privacy tools', icon: XCircle },
            ].map(({ method, description, icon: Icon }) => (
              <div key={method} className="flex items-start gap-3 p-3 rounded-lg border" style={{ background: '#0b1a30', borderColor: 'rgba(139,92,246,0.15)' }}>
                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                  <Icon className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                </div>
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#8b5cf6' }}>{method}</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: '#9cb8d9' }}>{description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 rounded-lg border" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.15)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#ef4444' }}>
              <span className="font-semibold">Important:</span> Disabling essential cookies will prevent you from using key features such as signing in, adding items to your cart, and completing purchases.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'thirdparty',
      icon: Globe,
      iconColor: '#06b6d4',
      title: 'Third-Party Cookies',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            Some pages may include embedded content from third-party services (e.g., YouTube videos, social media widgets). These services may set their own cookies, which we do not control.
          </p>
          <ul className="space-y-3">
            {[
              { service: 'Google Analytics', purpose: 'Site analytics', policy: 'https://policies.google.com/privacy' },
              { service: 'YouTube', purpose: 'Embedded videos (if applicable)', policy: 'https://policies.google.com/privacy' },
              { service: 'Social Media', purpose: 'Share buttons (if applicable)', policy: 'Varies by platform' },
            ].map(({ service, purpose, policy }) => {
              const isUrl = /^https?:\/\//i.test(policy);
              return (
                <li key={service} className="flex items-start gap-3 p-3 rounded-lg border" style={{ background: '#0b1a30', borderColor: 'rgba(6,182,212,0.15)' }}>
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#06b6d4' }} />
                  <div className="flex-1">
                    <p className="text-xs font-semibold mb-0.5" style={{ color: '#06b6d4' }}>{service}</p>
                    <p className="text-[10px] mb-1" style={{ color: '#9cb8d9' }}>{purpose}</p>
                    {isUrl ? (
                      <a href={policy} target="_blank" rel="noopener noreferrer nofollow" className="text-[10px] underline underline-offset-2 hover:opacity-80" style={{ color: '#06b6d4' }}>
                        Privacy Policy →
                      </a>
                    ) : (
                      <span className="text-[10px]" style={{ color: '#9cb8d9' }}>{policy}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ),
    },
    {
      id: 'updates',
      icon: FileText,
      iconColor: '#ec4899',
      title: 'Policy Updates',
      content: (
        <div className="space-y-4">
          <p className="leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
            We may update this Cookie Policy to reflect changes in our use of cookies or legal requirements. Any material changes will be communicated via our website and, where appropriate, by email.
          </p>
          <div className="p-4 rounded-lg border" style={{ background: 'rgba(236,72,153,0.05)', borderColor: 'rgba(236,72,153,0.15)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#ec4899' }}>Last updated: January 2026</p>
            <p className="text-xs leading-relaxed" style={{ color: '#9cb8d9' }}>
              This policy is effective from 1st January 2026. If you continue to use our site after any changes, you accept the updated policy.
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen pt-20 pb-24" style={{ background: '#060f1e' }}>
      
      {/* Hero */}
      <section id="hero" className="pt-12 pb-8 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.15) 100%)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <Cookie className="w-8 h-8" style={{ color: '#f59e0b' }} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#f0f6ff' }}>
            Cookie Policy
          </h1>
          <p className="text-base leading-relaxed max-w-2xl mx-auto" style={{ color: '#9cb8d9' }}>
            This policy explains how PH Labs Ltd uses cookies and similar technologies on our website. We are committed to transparency and giving you control over your data.
          </p>
        </div>
      </section>

      {/* Main content */}
      <section className="px-4 pb-12">
        <div className="max-w-4xl mx-auto space-y-6">
          {sections.map(({ id, icon: Icon, iconColor, title, content }) => (
            <div
              key={id}
              id={id}
              className="rounded-2xl p-6 md:p-8 border"
              style={{ background: '#0b1a30', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-start gap-4 mb-5">
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${iconColor}15`, border: `1px solid ${iconColor}30` }}
                >
                  <Icon className="w-5 h-5" style={{ color: iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold" style={{ color: '#f0f6ff' }}>{title}</h2>
                </div>
              </div>
              <div className="ml-14">
                {content}
              </div>
            </div>
          ))}
        </div>

        {/* Contact footer */}
        <div className="max-w-4xl mx-auto mt-8">
          <div className="rounded-2xl p-6 border" style={{ background: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.2)' }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                <Mail className="w-6 h-6" style={{ color: '#3b82f6' }} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm mb-1" style={{ color: '#f0f6ff' }}>Questions About Our Use of Cookies?</p>
                <p className="text-xs leading-relaxed" style={{ color: '#9cb8d9' }}>
                  If you have any questions about how we use cookies, please contact our data protection team at{' '}
                  <a
                    href="mailto:info@prohealthpeptides.co.uk"
                    className="font-semibold underline underline-offset-2 transition-colors hover:opacity-80"
                    style={{ color: '#3b82f6' }}
                  >
                    info@prohealthpeptides.co.uk
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Related links */}
        <div className="max-w-4xl mx-auto mt-6 space-y-4">
          <div className="rounded-xl p-5 border" style={{ background: '#04101f', borderColor: 'rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-semibold mb-3" style={{ color: '#9cb8d9' }}>Related Policies</p>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Privacy Policy', to: '/privacy-policy' },
                { label: 'Terms & Conditions', to: '/terms-and-conditions' },
                { label: 'Refund Policy', to: '/refund-policy' },
                { label: 'Shipping Policy', to: '/shipping-policy' },
              ].map(({ label, to }) => (
                <Link
                  key={to}
                  to={to}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10B981' }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-xl p-5 border" style={{ background: '#04101f', borderColor: 'rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-semibold mb-3" style={{ color: '#9cb8d9' }}>Explore Our Research Peptides</p>
            <p className="text-xs mb-3 leading-relaxed" style={{ color: '#3a5a82' }}>
              Cookies on this site help us provide a seamless experience when you browse our <Link to="/products" className="underline hover:opacity-80 transition-opacity" style={{ color: '#9cb8d9' }}>research peptide catalogue</Link>. Analytics cookies are never linked to personally identifiable information.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'View All Peptides', to: '/products' },
                { label: 'Tissue Repair', to: '/products?category=tissue-repair' },
                { label: 'GLP-1 / Metabolic', to: '/products?category=metabolic-signaling' },
                { label: 'Nootropic', to: '/products?category=neurological' },
              ].map(({ label, to }) => (
                <Link
                  key={to}
                  to={to}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)', color: '#f59e0b' }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

      </section>

    </div>
  );
}
