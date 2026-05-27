import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Clock, Send, CheckCircle2, Loader2, Building2, ArrowRight, MessageSquare } from 'lucide-react';
import { db, doc, getDoc, addDoc, collection, Timestamp } from '@/lib/firebase';
import { useSEO } from '@/hooks/useSEO';

import { buildContactFormEmail } from '@/templates/contactFormEmail';
import {
  WhatsAppIcon, FacebookIcon, InstagramIcon, TwitterXIcon, YoutubeIcon, LinkedInIcon
} from '@/components/SocialIcons';

interface SiteSettings {
  whatsappNumber?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
  youtubeUrl?: string;
  linkedinUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  contactHours?: string;
  contactHeading?: string;
  contactSubheading?: string;
  companyRegNumber?: string;
  companyAddress?: string;
}

/* ── Scroll fade ── */
function useScrollFade() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0, rootMargin: '0px 0px 120px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function FadeIn({ children, delay = 0, direction = 'up', className = '' }: {
  children: React.ReactNode; delay?: number; direction?: 'up' | 'left' | 'right' | 'none'; className?: string;
}) {
  const { ref, visible } = useScrollFade();
  const t = { up: 'translateY(20px)', left: 'translateX(-16px)', right: 'translateX(16px)', none: 'none' };
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'none' : t[direction],
      transition: `opacity 0.45s ease ${delay}ms, transform 0.45s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    }}>{children}</div>
  );
}

export default function Contact() {
  const [settings, setSettings] = useState<SiteSettings>({});
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useSEO('contact', {
    title: 'Contact Us | PH Labs UK',
    metaDescription: 'Contact PH Labs for HPLC-verified research peptides. UK-based support for laboratory research orders, bulk queries, and technical questions.',
    canonical: 'https://www.phlabs.co.uk/contact',
  });

  useEffect(() => {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'PH Labs',
      url: 'https://www.phlabs.co.uk',
      telephone: '+447826549934',
      email: 'info@phlabs.co.uk',
      address: { '@type': 'PostalAddress', addressCountry: 'GB', addressRegion: 'England' },
      areaServed: { '@type': 'Country', name: 'United Kingdom' },
      openingHoursSpecification: {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday'],
        opens: '09:00', closes: '17:00'
      }
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'contact-schema';
    el.textContent = JSON.stringify(schema);
    document.getElementById('contact-schema')?.remove();
    document.head.appendChild(el);
    return () => {
      document.getElementById('contact-schema')?.remove();
      document.title = 'PH Labs UK | HPLC-Tested Research Peptides';
      const d2 = document.querySelector('meta[name="description"]');
      if (d2) d2.setAttribute('content', 'Premium research compounds with HPLC-verified purity. For laboratory research use only. Fast UK shipping.');
      const c2 = document.querySelector('link[rel="canonical"]');
      if (c2) c2.setAttribute('href', 'https://www.phlabs.co.uk/');
    };
  }, []);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'siteSettings')).then(snap => {
      if (snap.exists()) setSettings(snap.data() as SiteSettings);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Trim + length/format validation to prevent oversized payloads and
    // abuse of the Firebase Trigger Email extension.
    const name = form.name.trim();
    const email = form.email.trim();
    const subject = form.subject.trim();
    const message = form.message.trim();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name || !email || !message) {
      setError('Please fill in all required fields.');
      return;
    }
    if (name.length > 100) { setError('Name must be 100 characters or fewer.'); return; }
    if (email.length > 254 || !emailRe.test(email)) { setError('Please enter a valid email address.'); return; }
    if (subject.length > 200) { setError('Subject must be 200 characters or fewer.'); return; }
    if (message.length > 4000) { setError('Message must be 4000 characters or fewer.'); return; }
    setSending(true);
    setError('');

    try {
      const emailHtml = buildContactFormEmail({
        senderName: form.name,
        senderEmail: form.email,
        subject: form.subject || 'Contact Form Enquiry',
        message: form.message,
      });
      const toAddress = settings.contactEmail || 'info@phlabs.co.uk';
      const subjectLine = `[PHP Contact] ${form.subject || 'New Enquiry'} — from ${form.name}`;

      // 1) Persist the enquiry to a contactMessages collection (durable record,
      //    independent of the Trigger Email extension).
      const enquiryPayload = {
        name: form.name,
        email: form.email,
        subject: form.subject || 'Contact Form Enquiry',
        message: form.message,
        createdAt: Timestamp.now(),
        status: 'new' as const,
      };
      let savedEnquiry = false;
      try {
        await addDoc(collection(db, 'contactMessages'), enquiryPayload);
        savedEnquiry = true;
      } catch (persistErr) {
        console.error('[Contact] contactMessages write failed:', persistErr);
      }

      // 2) Try to enqueue an email via the Firebase Trigger Email extension.
      let mailedOk = false;
      try {
        await addDoc(collection(db, 'mail'), {
          to: toAddress,
          replyTo: form.email,
          message: { subject: subjectLine, html: emailHtml },
          createdAt: Timestamp.now(),
        });
        mailedOk = true;
      } catch (mailErr) {
        console.error('[Contact] mail collection write failed:', mailErr);
      }

      if (mailedOk || savedEnquiry) {
        setSent(true);
      } else {
        setError(
          `We couldn't deliver your message right now. Please email us directly at ${toAddress}.`
        );
      }
    } catch (err) {
      console.error('[Contact] submit error:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Something went wrong: ${msg}. Please email us directly.`);
    } finally {
      setSending(false);
    }
  };

  const contactCards = [
    settings.contactEmail && {
      icon: <Mail className="w-5 h-5" />,
      label: 'Email Us',
      value: settings.contactEmail,
      href: `mailto:${settings.contactEmail}`,
      gradient: 'from-blue-600/20 to-blue-800/5',
      border: 'border-blue-500/25',
      iconBg: 'bg-blue-600/20',
      iconColor: 'text-blue-400',
      hoverGlow: 'hover:shadow-[0_8px_32px_rgba(37,99,235,0.2)]',
    },
    settings.contactPhone && {
      icon: <Phone className="w-5 h-5" />,
      label: 'Call Us',
      value: settings.contactPhone,
      href: `tel:${settings.contactPhone}`,
      gradient: 'from-violet-600/20 to-violet-800/5',
      border: 'border-violet-500/25',
      iconBg: 'bg-violet-600/20',
      iconColor: 'text-violet-400',
      hoverGlow: 'hover:shadow-[0_8px_32px_rgba(124,58,237,0.2)]',
    },
    settings.whatsappNumber && {
      icon: <WhatsAppIcon className="w-5 h-5" />,
      label: 'WhatsApp',
      value: `+${settings.whatsappNumber}`,
      href: `https://wa.me/${settings.whatsappNumber}`,
      gradient: 'from-green-600/20 to-green-800/5',
      border: 'border-green-500/25',
      iconBg: 'bg-green-600/20',
      iconColor: 'text-green-400',
      hoverGlow: 'hover:shadow-[0_8px_32px_rgba(34,197,94,0.2)]',
    },
    settings.contactAddress && {
      icon: <MapPin className="w-5 h-5" />,
      label: 'Location',
      value: settings.contactAddress,
      href: undefined,
      gradient: 'from-amber-600/20 to-amber-800/5',
      border: 'border-amber-500/25',
      iconBg: 'bg-amber-600/20',
      iconColor: 'text-amber-400',
      hoverGlow: 'hover:shadow-[0_8px_32px_rgba(245,158,11,0.2)]',
    },
    settings.contactHours && {
      icon: <Clock className="w-5 h-5" />,
      label: 'Hours',
      value: settings.contactHours,
      href: undefined,
      gradient: 'from-cyan-600/20 to-cyan-800/5',
      border: 'border-cyan-500/25',
      iconBg: 'bg-cyan-600/20',
      iconColor: 'text-cyan-400',
      hoverGlow: 'hover:shadow-[0_8px_32px_rgba(6,182,212,0.2)]',
    },
    (settings.companyRegNumber || settings.companyAddress) && {
      icon: <Building2 className="w-5 h-5" />,
      label: 'Registered Company',
      value: [settings.companyRegNumber ? `Reg. No. ${settings.companyRegNumber}` : '', settings.companyAddress || ''].filter(Boolean).join(' · '),
      href: undefined,
      gradient: 'from-slate-600/20 to-slate-800/5',
      border: 'border-slate-500/25',
      iconBg: 'bg-slate-600/20',
      iconColor: 'text-slate-400',
      hoverGlow: 'hover:shadow-[0_8px_32px_rgba(100,116,139,0.2)]',
    },
  ].filter(Boolean) as {
    icon: React.ReactNode; label: string; value: string;
    href?: string; gradient: string; border: string;
    iconBg: string; iconColor: string; hoverGlow: string;
  }[];

  const displayCards = contactCards.length === 0 ? [{
    icon: <Mail className="w-5 h-5" />, label: 'Email Us',
    value: 'info@phlabs.co.uk', href: 'mailto:info@phlabs.co.uk',
    gradient: 'from-blue-600/20 to-blue-800/5', border: 'border-blue-500/25',
    iconBg: 'bg-blue-600/20', iconColor: 'text-blue-400',
    hoverGlow: 'hover:shadow-[0_8px_32px_rgba(37,99,235,0.2)]',
  }] : contactCards;

  const socialLinks = [
    settings.facebookUrl    && { href: settings.facebookUrl,  icon: <FacebookIcon  className="w-4 h-4" />, label: 'Facebook',  color: 'bg-[#1877F2]/10 border-[#1877F2]/30 text-[#1877F2] hover:bg-[#1877F2]/20' },
    settings.instagramUrl   && { href: settings.instagramUrl, icon: <InstagramIcon className="w-4 h-4" />, label: 'Instagram', color: 'bg-pink-600/10 border-pink-500/30 text-pink-400 hover:bg-pink-600/20' },
    settings.twitterUrl     && { href: settings.twitterUrl,   icon: <TwitterXIcon  className="w-4 h-4" />, label: 'X / Twitter', color: 'bg-white/5 border-white/20 text-white hover:bg-white/10' },
    settings.youtubeUrl     && { href: settings.youtubeUrl,   icon: <YoutubeIcon   className="w-4 h-4" />, label: 'YouTube',   color: 'bg-red-600/10 border-red-500/30 text-red-400 hover:bg-red-600/20' },
    settings.linkedinUrl    && { href: settings.linkedinUrl,  icon: <LinkedInIcon  className="w-4 h-4" />, label: 'LinkedIn',  color: 'bg-[#0A66C2]/10 border-[#0A66C2]/30 text-[#0A66C2] hover:bg-[#0A66C2]/20' },
  ].filter(Boolean) as { href: string; icon: React.ReactNode; label: string; color: string }[];

  return (
    <div className="min-h-screen bg-[#060f1e] text-white overflow-x-hidden">

      {/* ── Ambient background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.08) 0%, transparent 70%)', opacity: 0 }} />
        <div className="absolute top-1/3 -left-40 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)', opacity: 0 }} />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)', opacity: 0 }} />
      </div>

      {/* ── HERO ── */}
      <div className="page-hero relative overflow-hidden hero-scanline" style={{ background: 'linear-gradient(180deg, #061020 0%, #060f1e 100%)' }}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(96,165,250,1) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="hero-top-shimmer pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-20 md:py-28 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="max-w-2xl"
          >
            {/* Eyebrow */}
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px w-10 bg-blue-400/60" />
              <span className="text-blue-400 text-xs font-bold uppercase tracking-[0.25em]">Get in Touch</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-5">
              <span className="text-[#f0f6ff]">Let's Talk</span>
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Research</span>
            </h1>

            <p className="text-[#8aabcf] text-lg leading-relaxed">
              {settings.contactSubheading || 'Questions about our laboratory reagents, an order, or technical specs for in-vitro research? Our UK team is happy to help.'}
            </p>
          </motion.div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-16 md:py-24 relative z-10">
        <div className="grid lg:grid-cols-5 gap-10 xl:gap-16">

          {/* LEFT COLUMN — contact info */}
          <div className="lg:col-span-2 space-y-5">

            <FadeIn direction="left">
              <div>
                <h2 className="text-xl font-bold text-[#f0f6ff] mb-1">Contact Information</h2>
                <p className="text-[#9cb8d9] text-sm">Find the best way to reach us below.</p>
              </div>
            </FadeIn>

            {/* Contact cards */}
            <div className="space-y-3">
              {displayCards.map((card, i) => (
                <FadeIn key={card.label} delay={i * 60} direction="left">
                  {card.href ? (
                    <a
                      href={card.href}
                      target={card.href.startsWith('http') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className={`group flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br ${card.gradient} border ${card.border} ${card.hoverGlow} hover:-translate-y-0.5 transition-all duration-300 cursor-pointer`}
                    >
                      <div className={`w-11 h-11 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0 ${card.iconColor}`}>
                        {card.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#9cb8d9] text-xs font-semibold uppercase tracking-wider mb-0.5">{card.label}</p>
                        <p className="text-[#f0f6ff] text-sm font-medium truncate group-hover:text-white transition-colors">{card.value}</p>
                      </div>
                      <ArrowRight className={`w-4 h-4 ${card.iconColor} opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200 shrink-0`} />
                    </a>
                  ) : (
                    <div className={`flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br ${card.gradient} border ${card.border}`}>
                      <div className={`w-11 h-11 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0 ${card.iconColor}`}>
                        {card.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#9cb8d9] text-xs font-semibold uppercase tracking-wider mb-0.5">{card.label}</p>
                        <p className="text-[#f0f6ff] text-sm font-medium">{card.value}</p>
                      </div>
                    </div>
                  )}
                </FadeIn>
              ))}
            </div>

            {/* Social links */}
            {socialLinks.length > 0 && (
              <FadeIn delay={360}>
                <div className="pt-2">
                  <p className="text-[#3a5a82] text-xs font-semibold uppercase tracking-widest mb-3">Follow Us</p>
                  <div className="flex flex-wrap gap-2">
                    {socialLinks.map(s => (
                      <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={s.label}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 hover:scale-105 ${s.color}`}
                      >
                        {s.icon}
                        <span>{s.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </FadeIn>
            )}
          </div>

          {/* RIGHT COLUMN — contact form */}
          <FadeIn direction="right" className="lg:col-span-3">
            <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#080f1e]"
              style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' }}>

              {/* Top gradient bar */}
              <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-600" />

              <div className="p-8 md:p-10">
                {sent ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center"
                  >
                    <div className="w-20 h-20 rounded-full bg-green-600/15 border border-green-500/30 flex items-center justify-center mb-5">
                      <CheckCircle2 className="w-10 h-10 text-green-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-[#f0f6ff] mb-2">Message Sent</h3>
                    <p className="text-[#9cb8d9] max-w-sm">
                      Thanks for reaching out. We'll get back to you as soon as possible — usually within one business day.
                    </p>
                    <button
                      onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }); }}
                      className="mt-8 px-6 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-[#e8f0fe] font-semibold rounded-xl transition-all"
                    >
                      Send Another Message
                    </button>
                  </motion.div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-[#f0f6ff]">Send a Message</h2>
                        <p className="text-[#9cb8d9] text-sm">We typically reply within one business day.</p>
                      </div>
                    </div>

                    {error && (
                      <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm">
                        {error}
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid sm:grid-cols-2 gap-5">
                        <div>
                          <label htmlFor="contact-name" className="block text-[#9cb8d9] text-xs font-semibold uppercase tracking-wider mb-2">
                            Full Name *
                          </label>
                          <input
                            id="contact-name"
                            type="text"
                            value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Your name"
                            required
                            className="w-full rounded-xl px-4 py-3 text-sm placeholder-[#5a7a9a] outline-none transition-all duration-200 focus:ring-2 focus:ring-emerald-500/50"
                            style={{ background: '#0d1f38', border: '1.5px solid rgba(255,255,255,0.25)', color: '#f0f6ff' }}
                          />
                        </div>
                        <div>
                          <label htmlFor="contact-email" className="block text-[#9cb8d9] text-xs font-semibold uppercase tracking-wider mb-2">
                            Email Address *
                          </label>
                          <input
                            id="contact-email"
                            type="email"
                            value={form.email}
                            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                            placeholder="your@email.com"
                            required
                            className="w-full rounded-xl px-4 py-3 text-sm placeholder-[#5a7a9a] outline-none transition-all duration-200 focus:ring-2 focus:ring-emerald-500/50"
                            style={{ background: '#0d1f38', border: '1.5px solid rgba(255,255,255,0.25)', color: '#f0f6ff' }}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="contact-subject" className="block text-[#9cb8d9] text-xs font-semibold uppercase tracking-wider mb-2">
                          Subject
                        </label>
                        <input
                          id="contact-subject"
                          type="text"
                          value={form.subject}
                          onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                          placeholder="What can we help you with?"
                          className="w-full rounded-xl px-4 py-3 text-sm placeholder-[#5a7a9a] outline-none transition-all duration-200 focus:ring-2 focus:ring-emerald-500/50"
                          style={{ background: '#0d1f38', border: '1.5px solid rgba(255,255,255,0.25)', color: '#f0f6ff' }}
                        />
                      </div>

                      <div>
                        <label htmlFor="contact-message" className="block text-[#9cb8d9] text-xs font-semibold uppercase tracking-wider mb-2">
                          Message *
                        </label>
                        <textarea
                          id="contact-message"
                          rows={6}
                          value={form.message}
                          onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                          placeholder="Tell us how we can help..."
                          required
                          className="w-full rounded-xl px-4 py-3 text-sm placeholder-[#5a7a9a] outline-none transition-all duration-200 resize-none focus:ring-2 focus:ring-emerald-500/50"
                          style={{ background: '#0d1f38', border: '1.5px solid rgba(255,255,255,0.25)', color: '#f0f6ff' }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={sending}
                        className="w-full group flex items-center justify-center gap-2.5 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-300 shadow-[0_4px_20px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_28px_rgba(16,185,129,0.5)] hover:-translate-y-0.5 active:translate-y-0"
                      >
                        {sending ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                        ) : (
                          <><Send className="w-4 h-4" /> Send Message <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                        )}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </FadeIn>

        </div>
      </div>

    </div>
  );
}
