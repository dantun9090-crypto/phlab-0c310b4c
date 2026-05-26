import { Truck, Clock, Package, AlertTriangle, MapPin, RefreshCw, Mail, ShieldCheck } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { Link } from 'react-router-dom';

export default function ShippingPolicy() {
  useSEO('shipping-policy', {
    title: 'Shipping Policy | Pro Health Peptides UK',
    metaDescription: 'Shipping information for Pro Health Peptides Ltd. UK delivery, dispatch times, packaging standards and research-use compliance.',
    canonical: 'https://www.prohealthpeptides.co.uk/shipping-policy',
  });

  const sections = [
    {
      icon: MapPin,
      iconColor: '#3b82f6',
      iconBg: 'rgba(59,130,246,0.1)',
      borderColor: 'rgba(59,130,246,0.15)',
      title: 'Delivery Regions',
      content: (
        <div className="space-y-3 text-[#9cb8d9] leading-relaxed text-sm">
          <p>We currently dispatch to <strong className="text-[#c8daf0]">mainland UK only</strong> (England, Scotland, Wales). We do not ship to Northern Ireland, the Channel Islands, Republic of Ireland, or any international destination at this time.</p>
          <p>All orders are dispatched from our UK fulfilment centre.</p>
        </div>
      ),
    },
    {
      icon: Clock,
      iconColor: '#10b981',
      iconBg: 'rgba(16,185,129,0.1)',
      borderColor: 'rgba(16,185,129,0.15)',
      title: 'Dispatch & Delivery Times',
      content: (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Standard Delivery', time: '3–5 working days', price: 'Free over £50', sub: '£3.99 under £50' },
              { label: 'Express Delivery', time: '1–2 working days', price: '£6.99', sub: 'Order before 1pm' },
            ].map((opt, i) => (
              <div key={i} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="font-bold text-[#e4f0ff] mb-1">{opt.label}</p>
                <p className="text-[#4ade80] font-semibold">{opt.time}</p>
                <p className="text-[#9cb8d9] mt-1">{opt.price}</p>
                <p className="text-[#3a5a82] text-xs mt-0.5">{opt.sub}</p>
              </div>
            ))}
          </div>
          <p className="text-[#9cb8d9] leading-relaxed">Orders placed Monday–Friday before 1pm are typically dispatched the same working day. Orders placed after 1pm, on weekends, or on UK bank holidays will be dispatched the next working day.</p>
        </div>
      ),
    },
    {
      icon: Package,
      iconColor: '#f59e0b',
      iconBg: 'rgba(245,158,11,0.1)',
      borderColor: 'rgba(245,158,11,0.15)',
      title: 'Packaging',
      content: (
        <div className="space-y-3 text-[#9cb8d9] leading-relaxed text-sm">
          <p>All orders are dispatched in <strong className="text-[#c8daf0]">plain, unmarked packaging</strong> with no external branding or product descriptions visible. This protects your privacy and ensures discreet delivery.</p>
          <p>Research compounds are packed in temperature-appropriate insulated packaging where required. Lyophilised peptides are stable at ambient temperature for transit but should be stored at 2–8°C or −20°C on receipt as indicated on the product label.</p>
        </div>
      ),
    },
    {
      icon: ShieldCheck,
      iconColor: '#a855f7',
      iconBg: 'rgba(168,85,247,0.1)',
      borderColor: 'rgba(168,85,247,0.15)',
      title: 'Free Shipping Threshold',
      content: (
        <div className="space-y-3 text-sm">
          <div className="rounded-2xl px-5 py-4 flex items-center gap-4" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <Truck className="w-8 h-8 text-emerald-400 shrink-0" />
            <div>
              <p className="text-emerald-300 font-bold text-base">Free Standard Delivery on orders over £50</p>
              <p className="text-[#9cb8d9] text-xs mt-0.5">Applied automatically at checkout. No code required.</p>
            </div>
          </div>
          <p className="text-[#9cb8d9] leading-relaxed">Orders below £50 are subject to a £3.99 standard delivery charge. Express delivery is £6.99 regardless of order value.</p>
        </div>
      ),
    },
    {
      icon: RefreshCw,
      iconColor: '#06b6d4',
      iconBg: 'rgba(6,182,212,0.1)',
      borderColor: 'rgba(6,182,212,0.15)',
      title: 'Tracking',
      content: (
        <div className="space-y-3 text-[#9cb8d9] leading-relaxed text-sm">
          <p>A dispatch confirmation email with tracking information will be sent once your order has been collected by our carrier. Please allow up to 2 hours for tracking updates to appear on the carrier's system.</p>
          <p>If you have not received your order within the stated delivery window, please <Link to="/contact" className="text-blue-400 hover:text-blue-300 underline">contact us</Link> and we will investigate on your behalf.</p>
        </div>
      ),
    },
    {
      icon: AlertTriangle,
      iconColor: '#ef4444',
      iconBg: 'rgba(239,68,68,0.1)',
      borderColor: 'rgba(239,68,68,0.15)',
      title: 'Failed Delivery & Returns to Sender',
      content: (
        <div className="space-y-3 text-[#9cb8d9] leading-relaxed text-sm">
          <p>If a delivery fails due to an incorrect address provided at checkout, refusal of delivery, or failure to collect from a depot within the holding period, the parcel will be returned to us.</p>
          <p>In this case, we will contact you to arrange re-delivery. A re-delivery charge may apply. Refunds are not issued for failed deliveries where the error is attributable to the customer.</p>
          <p>Please see our <Link to="/refund-policy" className="text-blue-400 hover:text-blue-300 underline">Refund Policy</Link> for full details on returns and eligibility.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#060f1e] pt-24 pb-20">
      <div className="container mx-auto px-6 max-w-4xl">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <Truck className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#f0f6ff] mb-3">Shipping Policy</h1>
          <p className="text-[#9cb8d9] text-sm">Last updated: May 2026</p>
          <p className="text-[#8caad4] mt-4 max-w-xl mx-auto text-sm leading-relaxed">
            All orders are dispatched from the UK. Research compounds are shipped for laboratory use only in compliant, discreet packaging.
          </p>
        </div>

        {/* RUO notice */}
        <div className="mb-10 rounded-2xl p-5 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-red-300/80 text-sm leading-relaxed">
            <strong className="text-red-300">Research Use Only.</strong>{' '}
            All products are for laboratory research purposes only. Not for human or veterinary consumption. By placing an order you confirm you are a qualified researcher aged 18 or over.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-5">
          {sections.map(({ icon: Icon, iconColor, iconBg, borderColor, title, content }, i) => (
            <section key={i} className="rounded-2xl p-6" style={{ background: '#0b1a30', border: `1px solid ${borderColor}` }}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
                  <Icon className="w-5 h-5" style={{ color: iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">{title}</h2>
                  {content}
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Contact strip */}
        <div className="mt-12 rounded-2xl p-6 text-center" style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Mail className="w-6 h-6 text-blue-400 mx-auto mb-3" />
          <p className="text-[#f0f6ff] font-semibold mb-1">Questions about your order?</p>
          <p className="text-[#9cb8d9] text-sm mb-4">We typically respond within one working day.</p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{ background: 'rgba(59,130,246,0.12)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}
          >
            Contact Us
          </Link>
        </div>

      </div>
    </div>
  );
}
