import { FileText, AlertTriangle, FlaskConical, Shield, Scale, User, Gavel } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';

export default function TermsOfService() {
  useSEO('terms', {
    title: 'Terms of Service | PH Labs',
    metaDescription: 'Terms of Service for PH Labs Ltd. Research use only. Governed by the laws of England and Wales.',
    canonical: 'https://www.phlabs.co.uk/terms-of-service',
  });

  const sections = [
    {
      id: '1',
      icon: FlaskConical,
      iconColor: 'text-red-400',
      iconBg: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      title: '1. Research Use Only',
      content: (
        <>
          <p className="text-[#9cb8d9] leading-relaxed">
            All products sold by PH Labs Ltd are strictly{' '}
            <strong className="text-red-300 font-semibold">for laboratory research use only</strong>.
            They are not for human consumption, veterinary use, or any diagnostic, therapeutic, or
            recreational purpose. They are not intended to diagnose, treat, cure, or prevent any disease.
          </p>
        </>
      ),
    },
    {
      id: '2',
      icon: User,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      title: '2. Age and Qualification Restriction',
      content: (
        <p className="text-[#9cb8d9] leading-relaxed">
          You must be at least <strong className="text-[#c8daf0]">18 years old</strong> and a{' '}
          <strong className="text-[#c8daf0]">qualified researcher or institution</strong> to purchase.
          By placing an order you confirm you meet these requirements.
        </p>
      ),
    },
    {
      id: '3',
      icon: Shield,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      title: '3. No Warranties',
      content: (
        <p className="text-[#9cb8d9] leading-relaxed">
          Products are sold <strong className="text-[#c8daf0]">"as is"</strong>. We provide no
          warranties regarding fitness for any particular purpose beyond laboratory research.
        </p>
      ),
    },
    {
      id: '4',
      icon: Scale,
      iconColor: 'text-purple-400',
      iconBg: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
      title: '4. Limitation of Liability',
      content: (
        <p className="text-[#9cb8d9] leading-relaxed">
          PH Labs Ltd shall not be liable for any direct, indirect, incidental, or
          consequential damages arising from the use or misuse of our products.
        </p>
      ),
    },
    {
      id: '5',
      icon: Gavel,
      iconColor: 'text-teal-400',
      iconBg: 'bg-teal-500/10',
      borderColor: 'border-teal-500/20',
      title: '5. Governing Law',
      content: (
        <>
          <p className="text-[#9cb8d9] leading-relaxed">
            These terms are governed by the laws of <strong className="text-[#c8daf0]">England and Wales</strong>.
          </p>
          <p className="text-[#9cb8d9] leading-relaxed mt-3">
            Full company details: <strong className="text-[#c8daf0]">PH Labs Ltd</strong>,
            Registered in England &amp; Wales.
          </p>
        </>
      ),
    },
  ];

  return (
    <div
      className="min-h-screen pt-24 pb-20"
      style={{ backgroundColor: 'var(--theme-bg)' }}
    >
      <div className="container mx-auto px-6">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20 mb-6">
            <FileText className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#f0f6ff] mb-3">Terms of Service</h1>
          <p className="text-[#9cb8d9] text-sm">Last updated: April 2026</p>
          <p className="text-[#8caad4] mt-4 max-w-xl mx-auto text-sm leading-relaxed">
            Welcome to PH Labs Ltd. By accessing or using our website, you agree to these Terms of Service.
          </p>
        </div>

        {/* RUO Disclaimer Banner */}
        <div className="max-w-3xl mx-auto mb-10">
          <div className="border border-red-500/40 bg-red-500/[0.06] rounded-2xl p-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-300/80 text-sm leading-relaxed">
              <strong className="text-red-300 font-semibold">Research Use Only (RUO).</strong>{' '}
              These products are not approved for human or veterinary use. Intended solely for qualified
              in-vitro laboratory research by trained professionals.
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="max-w-3xl mx-auto space-y-5">
          {sections.map(({ id, icon: Icon, iconColor, iconBg, borderColor, title, content }) => (
            <section
              key={id}
              className={`rounded-2xl border ${borderColor} p-6 transition-all`}
              style={{ backgroundColor: 'var(--theme-surface)' }}
            >
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[#f0f6ff] font-bold text-lg mb-3">{title}</h2>
                  {content}
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Footer note */}
        <div className="max-w-3xl mx-auto mt-12 text-center">
          <div className="bg-red-500/[0.06] border border-red-500/20 rounded-2xl p-6">
            <p className="text-red-300/80 text-sm font-semibold uppercase tracking-wide mb-2">
              Important Notice
            </p>
            <p className="text-red-100/90 text-sm leading-relaxed">
              By using this website and placing any order, you acknowledge that you have read,
              understood, and agree to be bound by these Terms of Service. You confirm that you are a
              qualified researcher aged 18 or over and that all products will be used solely for
              legitimate in-vitro laboratory research.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
