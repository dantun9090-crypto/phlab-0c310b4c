import { Shield, Lock, Database, FileText, Globe, Users, Clock, Server, Mail } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';

export default function Privacy() {
  useSEO('privacy', {
    title: 'Privacy Policy | PH Labs UK',
    metaDescription: 'Privacy and data protection policy for PH Labs Ltd. UK GDPR compliant. Learn how we collect, process and protect your personal data.',
    canonical: 'https://phlabs.co.uk/privacy',
  });

  return (
    <div className="min-h-screen bg-[#060f1e] pt-24 pb-20">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 mb-6">
            <Shield className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#f0f6ff] mb-4">Privacy & Data Protection Policy</h1>
          <p className="text-[#9cb8d9]">PH Labs | phlabs.co.uk</p>
          <p className="text-sm text-[#3a5a82] mt-2">Effective Date: March 11, 2026</p>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Section 1 */}
          <section className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#f0f6ff] mb-3">1. Introduction</h2>
                <p className="text-[#9cb8d9] leading-relaxed">
                  PH Labs ("we," "us," or "our") is committed to protecting the privacy and security of your personal data. This Privacy Policy describes how we collect, process, and store personal information in accordance with the <strong className="text-white">UK Data Protection Act 2018</strong> and the <strong className="text-white">UK GDPR</strong>.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Users className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#f0f6ff] mb-3">2. Data Controller</h2>
                <p className="text-[#9cb8d9] leading-relaxed mb-3">
                  PH Labs acts as the <strong className="text-white">Data Controller</strong> for the personal information collected through this website. For any inquiries regarding data protection, please contact our Data Protection Officer at:
                </p>
                <a href="/#contact" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors">
                  <Mail className="w-4 h-4" />
                  Contact Support Team
                </a>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Database className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#f0f6ff] mb-3">3. Categories of Data Collected</h2>
                <p className="text-[#9cb8d9] leading-relaxed mb-4">
                  We collect and process personal data strictly necessary for the fulfillment of research supply contracts:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Identity Data:</strong>
                      <span className="text-[#9cb8d9]"> Legal name, business/institutional affiliation, and professional titles.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Contact Data:</strong>
                      <span className="text-[#9cb8d9]"> Verified billing address, shipping address, electronic mail address, and telephone numbers.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Transaction Data:</strong>
                      <span className="text-[#9cb8d9]"> Details regarding products purchased, timestamps, and payment confirmation (excluding raw credit card data, which is handled by PCI-compliant processors).</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Technical Data:</strong>
                      <span className="text-[#9cb8d9]"> Internet Protocol (IP) address, browser fingerprints, and interaction logs for security and fraud prevention.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Lock className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#f0f6ff] mb-3">4. Legal Basis for Processing</h2>
                <p className="text-[#9cb8d9] leading-relaxed mb-4">
                  We process data under the following lawful bases:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Contractual Obligation:</strong>
                      <span className="text-[#9cb8d9]"> To process and dispatch orders for research chemicals.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Legal Compliance:</strong>
                      <span className="text-[#9cb8d9]"> To maintain financial records for HMRC and ensure compliance with chemical distribution regulations.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Legitimate Interests:</strong>
                      <span className="text-[#9cb8d9]"> To prevent fraudulent transactions and ensure the security of our digital infrastructure.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Shield className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#f0f6ff] mb-3">5. Research Use Attestation & Disclosure</h2>
                <p className="text-[#9cb8d9] leading-relaxed mb-4">
                  All products distributed via phlabs.co.uk are intended <strong className="text-white">strictly for in-vitro laboratory research and development</strong>. By providing your data, you acknowledge:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2"></div>
                    <p className="text-[#9cb8d9]">Information may be audited to ensure compliance with research-only distribution standards.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2"></div>
                    <p className="text-[#9cb8d9]">We reserve the right to cross-reference data to prevent the diversion of research materials for non-laboratory use.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Clock className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#f0f6ff] mb-3">6. Data Retention & Security</h2>
                <div className="space-y-4">
                  <div>
                    <strong className="text-white block mb-1">Retention:</strong>
                    <p className="text-[#9cb8d9] leading-relaxed">
                      We retain personal data only as long as necessary to fulfill the purposes for which it was collected, typically <strong className="text-white">seven years</strong> for tax and audit purposes.
                    </p>
                  </div>
                  <div>
                    <strong className="text-white block mb-1">Security:</strong>
                    <p className="text-[#9cb8d9] leading-relaxed">
                      We employ industry-standard <strong className="text-white">AES-256 encryption</strong> and <strong className="text-white">Secure Socket Layer (SSL)</strong> technology to protect data during transmission. Access to your data is restricted to authorized personnel only.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Globe className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#f0f6ff] mb-3">7. International Transfers</h2>
                <p className="text-[#9cb8d9] leading-relaxed">
                  Your data is stored on secure servers within the <strong className="text-white">UK/EEA</strong>. Should any third-party service providers (e.g., mail servers) operate outside this jurisdiction, we ensure <strong className="text-white">Standard Contractual Clauses (SCCs)</strong> are in place to maintain an equivalent level of protection.
                </p>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Users className="w-5 h-5 text-pink-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#f0f6ff] mb-3">8. Your Statutory Rights</h2>
                <p className="text-[#9cb8d9] leading-relaxed mb-4">
                  Under the UK GDPR, you possess the following rights:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Right of Access:</strong>
                      <span className="text-[#9cb8d9]"> Request a copy of the data we hold.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Right to Rectification:</strong>
                      <span className="text-[#9cb8d9]"> Correct inaccurate or incomplete data.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Right to Erasure:</strong>
                      <span className="text-[#9cb8d9]"> Request deletion of data where no legal override exists.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-2"></div>
                    <div>
                      <strong className="text-white">Right to Restrict Processing:</strong>
                      <span className="text-[#9cb8d9]"> Limit how we use your data during disputes.</span>
                    </div>
                  </div>
                </div>
                <p className="text-[#9cb8d9] mt-4">
                  To exercise these rights, please submit a formal request to our support team via our contact page.
                </p>
              </div>
            </div>
          </section>

          {/* Implementation Checklist */}
          <section className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                <Server className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#f0f6ff] mb-4">Implementation Checklist</h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-400 mt-2"></div>
                    <p className="text-[#9cb8d9]"><strong className="text-white">Hyperlink:</strong> This policy is linked in the website footer and at the checkout stage.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-400 mt-2"></div>
                    <p className="text-[#9cb8d9]"><strong className="text-white">DPO:</strong> Contact our support team for Data Protection Officer inquiries.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-400 mt-2"></div>
                    <p className="text-[#9cb8d9]"><strong className="text-white">Consent:</strong> We use active opt-in mechanisms for any marketing communications to remain compliant.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Contact CTA */}
        <div className="max-w-4xl mx-auto mt-12">
          <div className="bg-[#0b1a30]/70 border border-white/[0.07] rounded-2xl p-8 text-center">
            <p className="text-[#9cb8d9] mb-4">
              Questions about your data or privacy rights?
            </p>
            <a 
              href="/#contact" 
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-[#f0f6ff] px-6 py-3 rounded-xl font-medium transition-colors"
            >
              <Mail className="w-5 h-5" />
              Contact Data Protection Officer
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
