import { Shield, Database, UserCheck, Cookie, Mail, Lock, FileText, Eye, AlertCircle, Globe } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  useSEO('privacy', {
    title: 'Privacy Policy | Pro Health Peptides UK',
    metaDescription: 'Privacy Policy — Pro Health Peptides Ltd UK. UK GDPR & Data Protection Act 2018 compliant. How we collect and protect your data when you buy research peptides in the UK.',
    canonical: 'https://www.prohealthpeptides.co.uk/privacy-policy',
    ogImage: 'https://cdn.wegic.ai/assets/onepage/agent/images/1779306071783_0.jpg',
  });

  const sections = [
    {
      id: 'collect',
      icon: Database,
      iconColor: '#3b82f6',
      title: 'What Information We Collect',
      content: (
        <ul className="space-y-3 mt-1">
          {[
            'Name, email, shipping address, and payment details when you place an order',
            'IP address and browsing data for fraud prevention and site improvement',
            'Cookie preferences and site interaction data (see our Cookie Policy)',
            'Communication history when you contact our support team',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#3b82f6' }} />
              {item}
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'use',
      icon: UserCheck,
      iconColor: '#10B981',
      title: 'How We Use Your Data',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            We use your information only to process orders, deliver products, and provide customer support. We will never sell or share your personal data with third parties for marketing purposes.
          </p>
          <ul className="space-y-3">
            {[
              'Order fulfilment and shipping',
              'Payment processing (via secure Open Banking)',
              'Customer service and support',
              'Fraud prevention and security',
              'Legal compliance (MHRA, GDPR, UK law)',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#10B981' }} />
                {item}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: 'cookies',
      icon: Cookie,
      iconColor: '#f59e0b',
      title: 'Cookies & Tracking',
      content: (
        <p className="leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
          We use essential cookies to keep you signed in and remember your cart. Optional cookies track site performance through Google Analytics. You can manage your cookie preferences at any time. See our{' '}
          <Link to="/cookies" className="font-semibold underline underline-offset-2 transition-colors hover:text-[#f59e0b]" style={{ color: '#f59e0b' }}>
            Cookie Policy
          </Link>{' '}
          for full details.
        </p>
      ),
    },
    {
      id: 'security',
      icon: Shield,
      iconColor: '#8b5cf6',
      title: 'Data Security',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            Your data is stored securely using industry-standard encryption. Payment details are processed directly by our Open Banking provider and never stored on our servers.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'SSL Encryption', value: 'All pages' },
              { label: 'Data Storage', value: 'EU/UK servers' },
              { label: 'Payment Security', value: 'PSD2 compliant' },
              { label: 'Access Control', value: 'Role-based' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-lg border" style={{ background: 'rgba(139,92,246,0.05)', borderColor: 'rgba(139,92,246,0.15)' }}>
                <span className="text-xs font-semibold" style={{ color: '#8b5cf6' }}>{label}</span>
                <span className="text-xs" style={{ color: '#9cb8d9' }}>{value}</span>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      id: 'rights',
      icon: Eye,
      iconColor: '#06b6d4',
      title: 'Your Rights (UK GDPR)',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            Under UK GDPR and the Data Protection Act 2018, you have the following rights:
          </p>
          <ul className="space-y-3">
            {[
              'Right to access your personal data',
              'Right to rectification (correct inaccurate data)',
              'Right to erasure ("right to be forgotten")',
              'Right to restrict processing',
              'Right to data portability',
              'Right to object to processing',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#06b6d4' }} />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-4 p-3 rounded-lg border" style={{ background: 'rgba(6,182,212,0.05)', borderColor: 'rgba(6,182,212,0.15)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#06b6d4' }}>
              To exercise any of these rights, email{' '}
              <a href="mailto:info@prohealthpeptides.co.uk" className="font-semibold underline underline-offset-2">
                info@prohealthpeptides.co.uk
              </a>
              . We will respond within 30 days.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'retention',
      icon: FileText,
      iconColor: '#ec4899',
      title: 'Data Retention',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            We retain your data only as long as necessary for the purposes outlined in this policy:
          </p>
          <div className="space-y-3">
            {[
              { type: 'Order records', period: '7 years', reason: 'UK tax law requirement' },
              { type: 'Account data', period: 'Until deletion requested', reason: 'Service provision' },
              { type: 'Marketing consent', period: 'Until withdrawn', reason: 'Communication preference' },
              { type: 'Analytics data', period: '26 months', reason: 'Google Analytics default' },
            ].map(({ type, period, reason }) => (
              <div key={type} className="p-3 rounded-lg border" style={{ background: '#0b1a30', borderColor: 'rgba(236,72,153,0.15)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: '#ec4899' }}>{type}</span>
                  <span className="text-xs font-bold" style={{ color: '#f0f6ff' }}>{period}</span>
                </div>
                <p className="text-[10px]" style={{ color: '#9cb8d9' }}>{reason}</p>
              </div>
            ))}
          </div>
        </>
      ),
    },
    {
      id: 'thirdparty',
      icon: Globe,
      iconColor: '#f97316',
      title: 'Third-Party Services',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            We use the following trusted third-party services to operate our website:
          </p>
          <ul className="space-y-3">
            {[
              { service: 'Google Analytics', purpose: 'Site performance and visitor statistics', data: 'Anonymous usage data' },
              { service: 'Open Banking Provider', purpose: 'Secure payment processing', data: 'Payment authorisation only' },
              { service: 'Email Service', purpose: 'Order confirmations and support', data: 'Email address, order details' },
              { service: 'Shipping Carrier', purpose: 'UK delivery fulfilment', data: 'Name, address, phone' },
            ].map(({ service, purpose, data }) => (
              <li key={service} className="p-3 rounded-lg border" style={{ background: 'rgba(249,115,22,0.05)', borderColor: 'rgba(249,115,22,0.15)' }}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <span className="text-xs font-semibold" style={{ color: '#f97316' }}>{service}</span>
                </div>
                <p className="text-[10px] mb-1" style={{ color: '#9cb8d9' }}>{purpose}</p>
                <p className="text-[10px]" style={{ color: '#3a5a82' }}>
                  <span className="font-semibold">Data shared:</span> {data}
                </p>
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: 'changes',
      icon: AlertCircle,
      iconColor: '#ef4444',
      title: 'Policy Updates',
      content: (
        <div className="space-y-4">
          <p className="leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
            We may update this Privacy Policy to reflect changes in our practices or legal requirements. Any material changes will be notified via email to registered users.
          </p>
          <div className="p-4 rounded-lg border" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.15)' }}>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: '#ef4444' }}>Last updated: January 2026</p>
                <p className="text-xs leading-relaxed" style={{ color: '#9cb8d9' }}>
                  This policy is effective from 1st January 2026. Previous versions are available upon request.
                </p>
              </div>
            </div>
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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.15) 100%)', border: '1px solid rgba(59,130,246,0.25)' }}>
            <Lock className="w-8 h-8" style={{ color: '#3b82f6' }} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#f0f6ff' }}>
            Privacy Policy
          </h1>
          <p className="text-base leading-relaxed max-w-2xl mx-auto" style={{ color: '#9cb8d9' }}>
            Pro Health Peptides Ltd is committed to protecting your personal data. This policy explains how we collect, use, and safeguard your information in compliance with UK GDPR and the Data Protection Act 2018.
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
          <div className="rounded-2xl p-6 border" style={{ background: 'rgba(139,92,246,0.05)', borderColor: 'rgba(139,92,246,0.2)' }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                <Mail className="w-6 h-6" style={{ color: '#8b5cf6' }} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm mb-1" style={{ color: '#f0f6ff' }}>Questions About Your Data?</p>
                <p className="text-xs leading-relaxed" style={{ color: '#9cb8d9' }}>
                  Contact our data controller at{' '}
                  <a
                    href="mailto:info@prohealthpeptides.co.uk"
                    className="font-semibold underline underline-offset-2 transition-colors hover:opacity-80"
                    style={{ color: '#8b5cf6' }}
                  >
                    info@prohealthpeptides.co.uk
                  </a>
                  . We will respond within 30 days as required under UK GDPR.
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
                { label: 'Cookie Policy', to: '/cookies' },
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
              All orders are processed in accordance with this Privacy Policy. Your data is used solely to fulfil and manage your purchase of <Link to="/products" className="underline hover:opacity-80 transition-opacity" style={{ color: '#9cb8d9' }}>research peptides</Link> from Pro Health Peptides UK.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'View All Peptides', to: '/products' },
                { label: 'Tissue Repair', to: '/products?category=tissue-repair' },
                { label: 'GLP-1 / Metabolic', to: '/products?category=metabolic-signaling' },
                { label: 'Longevity', to: '/products?category=cellular-aging' },
              ].map(({ label, to }) => (
                <Link
                  key={to}
                  to={to}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)', color: '#3b82f6' }}
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
