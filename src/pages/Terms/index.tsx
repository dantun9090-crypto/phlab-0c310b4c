import { FileText, AlertTriangle, User, Package, Thermometer, Truck, RefreshCw, Shield, BookOpen, Gavel, Mail, Lock, Eye, FlaskConical, Ban, CreditCard } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { Link } from 'react-router-dom';

export default function Terms() {
  useSEO('terms-conditions', {
    title: 'Terms & Conditions | PH Labs UK',
    metaDescription: 'Terms & Conditions — PH Labs Ltd UK. Research-use only peptides, MHRA compliant. Ordering, payment, returns & shipping. Governed by English law.',
    canonical: 'https://www.prohealthpeptides.co.uk/terms-and-conditions',
    ogImage: 'https://cdn.wegic.ai/assets/onepage/agent/images/1779306071785_0.jpg',
  });

  const sections = [
    {
      id: 'agreement',
      icon: FileText,
      iconColor: '#3b82f6',
      title: 'Agreement to Terms',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            By accessing or using PH Labs Ltd's website ("we," "us," "our"), you agree to be bound by these Terms and Conditions ("Terms"). If you do not agree to all of these Terms, do not access or use the Website.
          </p>
          <div className="p-4 rounded-lg border" style={{ background: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.15)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#3b82f6' }}>
              <span className="font-semibold">Effective Date:</span> 28 March 2026. These Terms apply to all users, visitors, and customers of the Website.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'disclaimer',
      icon: AlertTriangle,
      iconColor: '#ef4444',
      title: 'Research Use Only — Mandatory Disclaimer',
      content: (
        <>
          <div className="p-4 rounded-lg border mb-4" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: '#ef4444' }}>CRITICAL NOTICE</p>
                <p className="text-xs leading-relaxed" style={{ color: '#ef4444' }}>
                  All products sold by PH Labs are strictly for laboratory research use only. NOT for human consumption, veterinary use, or clinical trials. NOT intended to diagnose, treat, cure, or prevent any disease. Products have not been evaluated or approved by the MHRA or FDA.
                </p>
              </div>
            </div>
          </div>
          <ul className="space-y-3">
            {[
              'You must be 18 years or older to purchase',
              'You confirm you are a qualified researcher or acting on behalf of a qualified research institution',
              'Products are for in-vitro research only',
              'Misuse may result in legal consequences under UK law',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ef4444' }} />
                {item}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: 'eligibility',
      icon: User,
      iconColor: '#10B981',
      title: 'Eligibility',
      content: (
        <ul className="space-y-3">
          {[
            'You must be at least 18 years old',
            'You possess the legal capacity to enter into binding contracts',
            'You are a qualified researcher or purchasing on behalf of a licensed institution',
            'You will use products solely for legitimate in-vitro laboratory research',
            'You will comply with all applicable UK, EU, and international laws',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#10B981' }} />
              {item}
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'ordering',
      icon: Package,
      iconColor: '#f59e0b',
      title: 'Ordering & Acceptance',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            When you place an order, you are making an offer to purchase. We reserve the right to accept or reject your order for any reason, including but not limited to:
          </p>
          <ul className="space-y-3 mb-4">
            {[
              'Product availability or stock levels',
              'Errors in product information or pricing',
              'Suspicion of fraudulent activity',
              'Failure to meet eligibility requirements',
              'Non-compliance with research-use restrictions',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                {item}
              </li>
            ))}
          </ul>
          <div className="p-3 rounded-lg border" style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.15)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#f59e0b' }}>
              <span className="font-semibold">Order Confirmation:</span> A contract is formed only when we dispatch your order confirmation email.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'payment',
      icon: CreditCard,
      iconColor: '#8b5cf6',
      title: 'Payment & Pricing',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            We accept Open Banking / Pay by Bank only. All prices are in GBP (£) and include VAT where applicable.
          </p>
          <ul className="space-y-3">
            {[
              'Prices are subject to change without notice',
              'Payment must be received before dispatch',
              'We reserve the right to cancel orders if payment fails',
              'Bank transfer references must match your order number',
              'Orders unpaid after 72 hours will be automatically cancelled',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#8b5cf6' }} />
                {item}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: 'shipping',
      icon: Truck,
      iconColor: '#06b6d4',
      title: 'Shipping & Delivery',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            We ship to UK addresses only. Delivery times are estimates and not guaranteed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {[
              { label: 'Standard Delivery', value: '3–5 working days', price: '£4.99' },
              { label: 'Express Delivery', value: 'Next working day', price: '£9.99' },
            ].map(({ label, value, price }) => (
              <div key={label} className="p-3 rounded-lg border" style={{ background: '#0b1a30', borderColor: 'rgba(6,182,212,0.15)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#06b6d4' }}>{label}</p>
                <p className="text-[10px] mb-0.5" style={{ color: '#9cb8d9' }}>{value}</p>
                <p className="text-xs font-bold" style={{ color: '#f0f6ff' }}>{price}</p>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-lg border" style={{ background: 'rgba(6,182,212,0.05)', borderColor: 'rgba(6,182,212,0.15)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#06b6d4' }}>
              <span className="font-semibold">Free Shipping:</span> Orders over £50 qualify for free standard delivery.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'storage',
      icon: Thermometer,
      iconColor: '#ec4899',
      title: 'Product Storage & Handling',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            Research peptides require proper storage to maintain stability and integrity:
          </p>
          <div className="space-y-3">
            {[
              { condition: 'Lyophilised (powder)', temp: '2–8°C (refrigerator)', duration: 'Up to 2 years' },
              { condition: 'Reconstituted (liquid)', temp: '2–8°C (refrigerator)', duration: 'Up to 30 days' },
              { condition: 'Long-term storage', temp: '−20°C or below', duration: 'Extended stability' },
            ].map(({ condition, temp, duration }) => (
              <div key={condition} className="p-3 rounded-lg border" style={{ background: '#0b1a30', borderColor: 'rgba(236,72,153,0.15)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#ec4899' }}>{condition}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px]" style={{ color: '#9cb8d9' }}>{temp}</span>
                  <span className="text-[10px] font-bold" style={{ color: '#f0f6ff' }}>{duration}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs mt-4 leading-relaxed" style={{ color: '#3a5a82' }}>
            See our <Link to="/storage-guide" className="font-semibold underline underline-offset-2" style={{ color: '#ec4899' }}>Storage Guide</Link> for detailed handling instructions.
          </p>
        </>
      ),
    },
    {
      id: 'returns',
      icon: RefreshCw,
      iconColor: '#f97316',
      title: 'Returns & Refunds',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            Due to the sensitive nature of research compounds, we operate a strict returns policy:
          </p>
          <ul className="space-y-3 mb-4">
            {[
              'Returns accepted within 14 days of delivery (unopened only)',
              'Product must be in original sealed condition',
              'Temperature-sensitive items must have been stored correctly',
              'Refunds processed within 5–10 business days',
              'Shipping costs are non-refundable unless the item is faulty',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#f97316' }} />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed" style={{ color: '#3a5a82' }}>
            Full details in our <Link to="/refund-policy" className="font-semibold underline underline-offset-2" style={{ color: '#f97316' }}>Refund Policy</Link>.
          </p>
        </>
      ),
    },
    {
      id: 'liability',
      icon: Shield,
      iconColor: '#6366f1',
      title: 'Limitation of Liability',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            To the fullest extent permitted by UK law:
          </p>
          <ul className="space-y-3">
            {[
              'Products are sold "as is" for research purposes only',
              'We make no warranties regarding results, efficacy, or suitability',
              'We are not liable for misuse, improper storage, or non-compliance with regulations',
              'Maximum liability is limited to the value of the product purchased',
              'We are not responsible for indirect, consequential, or punitive damages',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#6366f1' }} />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-4 p-4 rounded-lg border" style={{ background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.15)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#6366f1' }}>
              <span className="font-semibold">Important:</span> This does not affect your statutory rights as a consumer under UK law.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'prohibited',
      icon: Ban,
      iconColor: '#dc2626',
      title: 'Prohibited Uses',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            You expressly agree NOT to use any products for:
          </p>
          <ul className="space-y-3">
            {[
              'Human consumption or administration',
              'Veterinary use or animal consumption',
              'Clinical trials or medical treatment',
              'Performance enhancement in sports',
              'Any use that violates UK, EU, or international law',
              'Resale to unqualified individuals or entities',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#dc2626' }} />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-4 p-4 rounded-lg border" style={{ background: 'rgba(220,38,38,0.1)', borderColor: 'rgba(220,38,38,0.25)' }}>
            <p className="text-xs font-bold mb-1" style={{ color: '#dc2626' }}>Legal Consequences</p>
            <p className="text-xs leading-relaxed" style={{ color: '#dc2626' }}>
              Misuse of research compounds may result in criminal prosecution under the Medicines Act 1968, Food Supplements Directive, and other UK legislation. You assume all legal responsibility for use.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'privacy',
      icon: Lock,
      iconColor: '#14b8a6',
      title: 'Privacy & Data Protection',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            We are committed to protecting your personal data in accordance with UK GDPR and the Data Protection Act 2018.
          </p>
          <ul className="space-y-3">
            {[
              'We collect only data necessary to process your order',
              'Your data is stored securely on EU/UK servers',
              'We never sell or share your data with third parties for marketing',
              'You have the right to access, rectify, or delete your data',
              'Cookie usage is governed by our Cookie Policy',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#14b8a6' }} />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-xs mt-4 leading-relaxed" style={{ color: '#3a5a82' }}>
            Full details in our <Link to="/privacy-policy" className="font-semibold underline underline-offset-2" style={{ color: '#14b8a6' }}>Privacy Policy</Link>.
          </p>
        </>
      ),
    },
    {
      id: 'intellectual',
      icon: BookOpen,
      iconColor: '#a855f7',
      title: 'Intellectual Property',
      content: (
        <ul className="space-y-3">
          {[
            'All content, trademarks, and logos are owned by PH Labs Ltd',
            'You may not reproduce, distribute, or modify any content without written permission',
            'Product names, descriptions, and images are protected by copyright',
            'Unauthorised use may result in legal action',
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 leading-relaxed text-sm" style={{ color: '#9cb8d9' }}>
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#a855f7' }} />
              {item}
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'law',
      icon: Gavel,
      iconColor: '#0ea5e9',
      title: 'Governing Law & Jurisdiction',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            These Terms are governed by the laws of England and Wales. Any disputes arising from these Terms or your use of the Website shall be subject to the exclusive jurisdiction of the courts of England and Wales.
          </p>
          <div className="p-4 rounded-lg border" style={{ background: 'rgba(14,165,233,0.05)', borderColor: 'rgba(14,165,233,0.15)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#0ea5e9' }}>
              <span className="font-semibold">Company Details:</span> PH Labs Ltd, registered in England & Wales. All products are dispatched from our UK facility in compliance with MHRA guidelines.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'changes',
      icon: Eye,
      iconColor: '#f43f5e',
      title: 'Changes to Terms',
      content: (
        <>
          <p className="leading-relaxed text-sm mb-4" style={{ color: '#9cb8d9' }}>
            We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting to the Website. Your continued use of the Website after any changes constitutes acceptance of the new Terms.
          </p>
          <div className="p-4 rounded-lg border" style={{ background: 'rgba(244,63,94,0.05)', borderColor: 'rgba(244,63,94,0.15)' }}>
            <p className="text-xs leading-relaxed" style={{ color: '#f43f5e' }}>
              <span className="font-semibold">Last Updated:</span> 28 March 2026. Check this page regularly for updates.
            </p>
          </div>
        </>
      ),
    },
  ];

  return (
    <div className="min-h-screen pt-20 pb-24" style={{ background: '#060f1e' }}>
      
      {/* Hero */}
      <section id="hero" className="pt-12 pb-8 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.15) 100%)', border: '1px solid rgba(59,130,246,0.25)' }}>
            <FileText className="w-8 h-8" style={{ color: '#3b82f6' }} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#f0f6ff' }}>
            Terms & Conditions
          </h1>
          <p className="text-base leading-relaxed max-w-2xl mx-auto" style={{ color: '#9cb8d9' }}>
            Please read these Terms and Conditions carefully before using our Website or purchasing any products. By placing an order, you agree to be bound by these Terms.
          </p>
        </div>
      </section>

      {/* MHRA Disclaimer Banner */}
      <section className="px-4 mb-8">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl p-6 border" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' }}>
            <div className="flex items-start gap-4">
              <FlaskConical className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
              <div>
                <p className="text-sm font-bold mb-2" style={{ color: '#ef4444' }}>RESEARCH USE ONLY</p>
                <p className="text-xs leading-relaxed" style={{ color: '#ef4444' }}>
                  All products sold by PH Labs are strictly for laboratory research use only. Not for human or veterinary consumption. Not intended to diagnose, treat, cure or prevent any disease. Not evaluated by MHRA or FDA. Must be 18+ to purchase.
                </p>
              </div>
            </div>
          </div>
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
          <div className="rounded-2xl p-6 border" style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
                <Mail className="w-6 h-6" style={{ color: '#10B981' }} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm mb-1" style={{ color: '#f0f6ff' }}>Questions About These Terms?</p>
                <p className="text-xs leading-relaxed" style={{ color: '#9cb8d9' }}>
                  For any questions relating to these Terms and Conditions, contact us at{' '}
                  <a
                    href="mailto:info@prohealthpeptides.co.uk"
                    className="font-semibold underline underline-offset-2 transition-colors hover:opacity-80"
                    style={{ color: '#10B981' }}
                  >
                    info@prohealthpeptides.co.uk
                  </a>{' '}
                  or via our <Link to="/contact" className="font-semibold underline underline-offset-2" style={{ color: '#10B981' }}>Contact page</Link>.
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
                { label: 'Cookie Policy', to: '/cookies' },
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
            <p className="text-xs font-semibold mb-3" style={{ color: '#9cb8d9' }}>Research Peptides — For Qualified Researchers Only</p>
            <p className="text-xs mb-3 leading-relaxed" style={{ color: '#3a5a82' }}>
              By agreeing to these Terms, you confirm all products purchased from our <Link to="/products" className="underline hover:opacity-80 transition-opacity" style={{ color: '#9cb8d9' }}>research peptide catalogue</Link> are for in-vitro laboratory use only. Not for human or veterinary consumption.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'View All Peptides', to: '/products' },
                { label: 'Tissue Repair', to: '/products?category=tissue-repair' },
                { label: 'GLP-1 / Metabolic', to: '/products?category=metabolic-signaling' },
                { label: 'Longevity', to: '/products?category=cellular-aging' },
                { label: 'Lab Reports', to: '/lab-reports' },
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

        {/* Final notice */}
        <div className="max-w-4xl mx-auto mt-8">
          <div className="rounded-2xl p-6 border" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.15)' }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-2 text-center" style={{ color: '#ef4444' }}>Final Notice</p>
            <p className="text-xs leading-relaxed text-center" style={{ color: '#ef4444' }}>
              By using this Website and placing any order, you acknowledge that you have read, understood, and irrevocably agree to be bound by these Terms. You confirm that you are a qualified researcher aged 18 or over and that all products will be used solely for legitimate in-vitro laboratory research in compliance with all applicable laws.
            </p>
          </div>
        </div>

      </section>

    </div>
  );
}
