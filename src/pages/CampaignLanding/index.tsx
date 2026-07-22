import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type LandingDoc = {
  slug: string;
  headline: string;
  subheadline: string;
  bullets: string[];
  faq?: { q: string; a: string }[];
  ctaText: string;
  ctaUrl: string;
  metaTitle?: string;
  metaDescription?: string;
  published: boolean;
};

export default function CampaignLanding() {
  const { slug = '' } = useParams();
  const [page, setPage] = useState<LandingDoc | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const direct = await getDoc(doc(db, 'landingPages', slug));
        if (direct.exists()) { if (!cancelled) setPage(direct.data() as LandingDoc); return; }
        const snap = await getDocs(query(collection(db, 'landingPages'), where('slug', '==', slug)));
        if (!cancelled) setPage(snap.empty ? null : (snap.docs[0].data() as LandingDoc));
      } catch {
        if (!cancelled) setPage(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!page) return;
    if (page.metaTitle) document.title = page.metaTitle;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    if (page.metaDescription) meta.setAttribute('content', page.metaDescription);
    if (page.faq && page.faq.length) {
      const ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.id = 'lp-faq-jsonld';
      ld.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: page.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      });
      document.head.appendChild(ld);
      return () => { document.getElementById('lp-faq-jsonld')?.remove(); };
    }
  }, [page]);

  if (page === undefined) {
    return <div style={{ maxWidth: 720, margin: '80px auto', padding: 24, textAlign: 'center', color: '#64748b' }}>Loading…</div>;
  }
  if (page === null || !page.published) {
    return (
      <div style={{ maxWidth: 720, margin: '80px auto', padding: 24, textAlign: 'center' }}>
        <h1>Page not found</h1>
        <p style={{ color: '#64748b' }}>This page doesn't exist or isn't published yet.</p>
        <Link to="/" style={{ color: '#0f172a' }}>Back to homepage</Link>
      </div>
    );
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: '70vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '64px 24px' }}>
        <h1 style={{ fontSize: 40, lineHeight: 1.15, margin: '0 0 16px', color: '#0f172a' }}>{page.headline}</h1>
        {page.subheadline && <p style={{ fontSize: 18, color: '#475569', margin: '0 0 32px' }}>{page.subheadline}</p>}

        {(page.bullets?.length ?? 0) > 0 && (
          <ul style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '24px 24px 24px 44px', margin: '0 0 32px' }}>
            {(page.bullets || []).map((b, i) => (
              <li key={i} style={{ marginBottom: 10, color: '#334155', fontSize: 16 }}>{b}</li>
            ))}
          </ul>
        )}

        {page.ctaUrl && (
          <Link
            to={page.ctaUrl}
            style={{ display: 'inline-block', background: '#0f172a', color: '#fff', padding: '14px 28px', borderRadius: 999, textDecoration: 'none', fontWeight: 600 }}
          >
            {page.ctaText || 'Learn more'}
          </Link>
        )}

        {page.faq && page.faq.length > 0 && (
          <div style={{ marginTop: 56 }}>
            <h2 style={{ color: '#0f172a' }}>Frequently asked questions</h2>
            {page.faq.map((f, i) => (
              <details key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#0f172a' }}>{f.q}</summary>
                <p style={{ color: '#475569', marginBottom: 0 }}>{f.a}</p>
              </details>
            ))}
          </div>
        )}

        <p style={{ marginTop: 64, fontSize: 12, color: '#94a3b8' }}>
          All products are supplied strictly for laboratory research purposes only. Not for human consumption.
        </p>
      </div>
    </div>
  );
}
