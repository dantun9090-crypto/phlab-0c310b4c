import { useEffect } from 'react';
import { AlertTriangle, Package, Mail, Clock, ShieldCheck, Scale, Truck } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { Link } from 'react-router-dom';

export default function RefundPolicy() {
  useSEO('refund-policy', {
    title: 'Return & Refund Policy | PH Labs UK',
    metaDescription: 'Return & refund policy for PH Labs Ltd UK. 14-day statutory right to cancel (CCR 2013) plus defective-item returns. UK research peptide supplier.',
    canonical: 'https://phlabs.co.uk/refund-policy',
  });

  // Inject MerchantReturnPolicy schema for Google Merchant Center
  useEffect(() => {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'MerchantReturnPolicy',
      '@id': 'https://phlabs.co.uk/refund-policy#return-policy',
      name: 'PH Labs Return Policy',
      url: 'https://phlabs.co.uk/refund-policy',
      applicableCountry: 'GB',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 14,
      returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: 'https://schema.org/FreeReturn',
      refundType: 'https://schema.org/FullRefund',
      inStoreReturnsOffered: false,
      description: 'We only accept returns for items that are defective or damaged upon arrival. Contact us within 14 days of delivery.',
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'merchant-return-schema';
    el.text = JSON.stringify(schema);
    document.head.appendChild(el);
    return () => {
      document.getElementById('merchant-return-schema')?.remove();
    };
  }, []);

  return (
    <div className="min-h-screen py-20 px-4" style={{ background: '#060f1e' }}>
      <div className="max-w-3xl mx-auto">

        {/* Breadcrumb */}
        <nav className="mb-8 flex items-center gap-2 text-xs text-[#3a5a82]" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-[#9cb8d9] transition-colors">Home</Link>
          <span>/</span>
          <span className="text-[#9cb8d9]">Return &amp; Refund Policy</span>
        </nav>

        {/* Header */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Google Merchant Center Compliant
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#f0f6ff] mb-3">Return &amp; Refund Policy</h1>
          <p className="text-[#9cb8d9] text-sm">Last updated: May 2026 &mdash; PH Labs Ltd</p>
          <p className="text-[#8caad4] mt-4 max-w-xl mx-auto text-sm leading-relaxed">
            Consumers have a 14-day statutory right to cancel under UK Consumer Contracts Regulations 2013, plus our quality guarantee on defective items.
          </p>
        </div>

        {/* RUO notice */}
        <div className="mb-10 rounded-2xl p-5 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-red-300/80 text-sm leading-relaxed">
            <strong className="text-red-300">Research Use Only.</strong>{' '}
            All products sold by PH Labs Ltd are strictly for in vitro laboratory research. Not intended for human or veterinary use. By purchasing you confirm you are a qualified researcher aged 18 or over.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-5">

          {/* Statutory Right to Cancel (CCR 2013) */}
          <section className="rounded-2xl p-6" style={{ background: '#0b1a30', border: '1px solid rgba(34,211,238,0.2)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.1)' }}>
                <Scale className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">Your Statutory Right to Cancel (UK Consumer Contracts Regulations 2013)</h2>
                <p className="text-[#9cb8d9] text-sm leading-relaxed mb-3">
                  If you are a consumer buying at a distance, UK law gives you a <strong className="text-[#c8daf0]">14-day cooling-off period</strong> to cancel your order without giving a reason. This right is separate from, and additional to, the defective-item return rights below.
                </p>
                <ul className="space-y-2 text-sm text-[#8caad4] mb-3">
                  <li className="flex gap-2"><span className="text-cyan-400">•</span>The 14-day period starts the day after you (or your nominated recipient) receive the goods.</li>
                  <li className="flex gap-2"><span className="text-cyan-400">•</span>To cancel, email <a href="mailto:info@phlabs.co.uk" className="underline text-cyan-300">info@phlabs.co.uk</a> stating your order number and intention to cancel.</li>
                  <li className="flex gap-2"><span className="text-cyan-400">•</span>Return the goods within 14 days of notifying us. You are responsible for the cost of return postage unless the goods are defective.</li>
                  <li className="flex gap-2"><span className="text-cyan-400">•</span>We will refund the full purchase price (including original standard delivery) within 14 days of receiving the goods back, or proof of return.</li>
                </ul>
                <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <p className="text-amber-300/90 leading-relaxed">
                    <strong>Statutory exceptions (CCR 2013 Reg. 28):</strong> the right to cancel does not apply to sealed research compounds that have been unsealed after delivery and are not suitable for return for health-protection or hygiene reasons, or to goods which by their nature become inseparably mixed with other items after delivery.
                  </p>
                </div>
              </div>
            </div>
          </section>


          {/* Our Commitment */}
          <section className="rounded-2xl p-6" style={{ background: '#0b1a30', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">Our Quality Commitment</h2>
                <p className="text-[#9cb8d9] text-sm leading-relaxed">
                  PH Labs Ltd supplies research compounds verified at ≥99% purity by HPLC. Every batch undergoes third-party laboratory testing before dispatch and certificates of analysis are available on request. If your order arrives defective, damaged, or incorrect, we will resolve it promptly and fairly under the terms of this policy.
                </p>
              </div>
            </div>
          </section>

          {/* Return Window */}
          <section className="rounded-2xl p-6" style={{ background: '#0b1a30', border: '1px solid rgba(59,130,246,0.15)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">Return Window</h2>
                <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-3" style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <Clock className="w-5 h-5 text-blue-400 shrink-0" />
                  <p className="text-[#c8daf0] font-semibold text-sm">14 days from the date of delivery</p>
                </div>
                <p className="text-[#9cb8d9] text-sm leading-relaxed">
                  Return requests must be submitted within 14 calendar days of receiving your order. Requests made after this window cannot be accepted.
                </p>
              </div>
            </div>
          </section>

          {/* Accepted Returns */}
          <section className="rounded-2xl p-6" style={{ background: '#0b1a30', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <Package className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">Accepted Returns — Defective Items Only</h2>
                <p className="text-[#9cb8d9] text-sm leading-relaxed mb-3">
                  Due to the nature of research-grade compounds, we <strong className="text-[#c8daf0]">only accept returns for items that are defective or damaged</strong>. Accepted reasons include:
                </p>
                <div className="space-y-2">
                  {[
                    'Item arrived visibly damaged in transit (broken vial, compromised packaging).',
                    'Product is materially defective or fails to meet its stated specification.',
                    'Incorrect item dispatched — wrong compound, concentration, or quantity.',
                    'Item is missing from the order.',
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(16,185,129,0.15)' }}>
                        <span className="text-emerald-400 text-xs font-bold">✓</span>
                      </span>
                      <p className="text-[#8caad4] text-sm">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Non-Returnable */}
          <section className="rounded-2xl p-6" style={{ background: '#0b1a30', border: '1px solid rgba(245,158,11,0.15)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)' }}>
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">Non-Returnable Items</h2>
                <p className="text-[#9cb8d9] text-sm leading-relaxed mb-3">
                  The following are <strong className="text-[#c8daf0]">not eligible for return</strong> under any circumstances:
                </p>
                <div className="space-y-2">
                  {[
                    'Opened, used, or otherwise non-defective products.',
                    'Items returned due to a change of mind or ordering error.',
                    'Products where customer-supplied storage conditions cannot be verified.',
                    'Items returned without prior written authorisation from PH Labs Ltd.',
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.1)' }}>
                        <span className="text-amber-400 text-xs font-bold">✕</span>
                      </span>
                      <p className="text-[#8caad4] text-sm">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* How to Request */}
          <section className="rounded-2xl p-6" style={{ background: '#0b1a30', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                <Mail className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">How to Request a Return</h2>
                <p className="text-[#9cb8d9] text-sm leading-relaxed mb-3">
                  Contact us at{' '}
                  <a href="mailto:info@phlabs.co.uk" className="text-blue-400 hover:text-blue-300 transition-colors">
                    info@phlabs.co.uk
                  </a>{' '}
                  within 14 days of delivery and include:
                </p>
                <div className="space-y-2">
                  {[
                    'Your order number.',
                    'A description of the defect or issue.',
                    'Clear photographic evidence of the damage or defect where applicable.',
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-violet-400 font-bold text-sm shrink-0">{i + 1}.</span>
                      <p className="text-[#8caad4] text-sm">{item}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[#9cb8d9] text-sm leading-relaxed mt-3">
                  We will respond within <strong className="text-[#c8daf0]">2 business days</strong>. Do not return any item without written authorisation — unauthorised returns will not be processed.
                </p>
              </div>
            </div>
          </section>

          {/* Return Shipping */}
          <section className="rounded-2xl p-6" style={{ background: '#0b1a30', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <Truck className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">Return Shipping</h2>
                <p className="text-[#9cb8d9] text-sm leading-relaxed">
                  For confirmed defective items, PH Labs Ltd will cover the cost of return shipping. We will provide a prepaid return label upon approval. Items must be returned in their original packaging where possible.
                </p>
              </div>
            </div>
          </section>

          {/* Refunds */}
          <section className="rounded-2xl p-6" style={{ background: '#0b1a30', border: '1px solid rgba(59,130,246,0.15)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                <ShieldCheck className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">Refunds</h2>
                <p className="text-[#9cb8d9] text-sm leading-relaxed mb-2">
                  Once a returned item is received and inspected, approved refunds will be processed within <strong className="text-[#c8daf0]">5–10 business days</strong> to the original payment method. You will receive a confirmation email when the refund is issued.
                </p>
                <p className="text-[#9cb8d9] text-sm leading-relaxed">
                  Where a replacement is preferred and stock is available, we will dispatch a replacement at no additional cost following return authorisation.
                </p>
              </div>
            </div>
          </section>

          {/* Governing Law */}
          <section className="rounded-2xl p-6" style={{ background: '#0b1a30', border: '1px solid rgba(107,143,186,0.15)' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(107,143,186,0.1)' }}>
                <Scale className="w-5 h-5 text-[#9cb8d9]" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">Governing Law</h2>
                <p className="text-[#9cb8d9] text-sm leading-relaxed">
                  This policy is governed by the laws of England and Wales. Nothing in this policy affects your statutory rights under the{' '}
                  <strong className="text-[#8caad4]">UK Consumer Rights Act 2015</strong> or the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013.
                </p>
              </div>
            </div>
          </section>

        </div>

        {/* Related policies */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/shipping-policy"
            className="flex items-center gap-3 rounded-2xl p-4 transition-all duration-200"
            style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
          >
            <Package className="w-5 h-5 text-blue-400/70 shrink-0" />
            <div>
              <p className="text-[#c8daf0] text-sm font-semibold">Shipping Policy</p>
              <p className="text-[#3a5a82] text-xs">Delivery times &amp; tracking</p>
            </div>
          </Link>
          <Link
            to="/contact"
            className="flex items-center gap-3 rounded-2xl p-4 transition-all duration-200"
            style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
          >
            <Mail className="w-5 h-5 text-blue-400/70 shrink-0" />
            <div>
              <p className="text-[#c8daf0] text-sm font-semibold">Contact Us</p>
              <p className="text-[#3a5a82] text-xs">Get help with your order</p>
            </div>
          </Link>
        </div>

        {/* Company footer */}
        <div className="mt-8 text-center">
          <p className="text-[#2a4a7a] text-xs">
            PH Labs Ltd &mdash; Registered in England &amp; Wales &mdash;{' '}
            <a href="mailto:info@phlabs.co.uk" className="hover:text-[#9cb8d9] transition-colors">
              info@phlabs.co.uk
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
