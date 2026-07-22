import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, PRODUCTS_COL } from '@/lib/firebase';
import type { Product } from '@/lib/firebase';
import { Globe, FileText, ShieldCheck, Plus, Trash2, Save, Eye, EyeOff, RefreshCw } from 'lucide-react';

// ---------- shared (dark admin theme) ----------

const DEFAULT_DOMAINS = ['phlabs.co.uk', 'www.phlabs.co.uk'];

function useDomains() {
  const [domains, setDomains] = useState<string[]>(DEFAULT_DOMAINS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getDoc(doc(db, 'settings', 'adsDomains'))
      .then((s) => {
        if (s.exists() && Array.isArray(s.data().domains) && s.data().domains.length) {
          setDomains(s.data().domains);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  return { domains, setDomains, loaded };
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(59,130,246,0.18)',
  borderRadius: 16,
  padding: 20,
  marginBottom: 20,
};
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
  color: '#fff', border: '1px solid rgba(96,165,250,0.35)',
  borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  ...btn,
  background: 'rgba(255,255,255,0.05)',
  color: '#c8dff5',
  border: '1px solid rgba(255,255,255,0.12)',
  fontWeight: 500,
};
const input: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10, fontSize: 13, color: '#e4f0ff',
  outline: 'none',
};
const h3Style: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 0, color: '#e4f0ff', fontSize: 16 };
const descStyle: React.CSSProperties = { color: '#9cb8d9', fontSize: 13, lineHeight: 1.6 };
const thStyle: React.CSSProperties = { padding: 8, color: '#7a98b8', fontSize: 12, fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: 8, color: '#c8dff5' };
const codeStyle: React.CSSProperties = { color: '#93c5fd', background: 'rgba(37,99,235,0.12)', padding: '1px 6px', borderRadius: 6, fontSize: 12 };

// ---------- Module 1: per-domain product visibility ----------

function VisibilityModule() {
  const { domains, setDomains } = useDomains();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    getDocs(collection(db, PRODUCTS_COL))
      .then((snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const saveDomains = async (next: string[]) => {
    setDomains(next);
    await setDoc(doc(db, 'settings', 'adsDomains'), { domains: next, updatedAt: serverTimestamp() }, { merge: true });
    setMsg('Domains saved.');
    setTimeout(() => setMsg(''), 2000);
  };

  const visibleOn = (p: Product): string[] => {
    const v = (p as Product & { domainVisibility?: string[] }).domainVisibility;
    return Array.isArray(v) && v.length ? v : domains;
  };

  const toggle = async (p: Product, domain: string) => {
    const cur = visibleOn(p);
    const next = cur.includes(domain) ? cur.filter((d) => d !== domain) : [...cur, domain];
    const finalNext = next.length === domains.length ? [] : next; // empty = visible everywhere
    setSaving(p.id);
    try {
      await updateDoc(doc(db, PRODUCTS_COL, p.id), { domainVisibility: finalNext });
      setProducts((ps) => ps.map((x) => (x.id === p.id ? ({ ...x, domainVisibility: finalNext } as Product) : x)));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={card}>
      <h3 style={h3Style}><Globe size={18} color="#60a5fa" /> Per-domain product visibility</h3>
      <p style={descStyle}>
        Choose which domains each product is visible on. Products hidden on a domain disappear from the shop and home page there
        (useful for compliant ad domains). No selection = visible everywhere.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {domains.map((d) => (
          <span key={d} style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#c8dff5', borderRadius: 999, padding: '5px 12px', fontSize: 12, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {d}
            <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#f87171', display: 'inline-flex', padding: 0 }} onClick={() => saveDomains(domains.filter((x) => x !== d))} title="Remove domain">
              <Trash2 size={12} />
            </button>
          </span>
        ))}
        <input style={{ ...input, width: 220 }} placeholder="add domain e.g. ads.phlabs.co.uk" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
        <button style={btnGhost} onClick={() => { const d = newDomain.trim().toLowerCase(); if (d && !domains.includes(d)) saveDomains([...domains, d]); setNewDomain(''); }}>
          <Plus size={14} /> Add
        </button>
      </div>
      {msg && <p style={{ color: '#34d399', fontSize: 12 }}>{msg}</p>}

      {loading ? (
        <p style={{ color: '#7a98b8' }}>Loading products…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(59,130,246,0.25)' }}>
              <th style={thStyle}>Product</th>
              {domains.map((d) => <th key={d} style={thStyle}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const vis = visibleOn(p);
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={tdStyle}>{p.name || p.id}</td>
                  {domains.map((d) => {
                    const on = vis.includes(d);
                    return (
                      <td key={d} style={tdStyle}>
                        <button
                          style={{ ...btnGhost, opacity: saving === p.id ? 0.5 : 1, color: on ? '#34d399' : '#5a7a9a', padding: '6px 12px' }}
                          disabled={saving === p.id}
                          onClick={() => toggle(p, d)}
                          title={on ? 'Visible — click to hide' : 'Hidden — click to show'}
                        >
                          {on ? <Eye size={14} /> : <EyeOff size={14} />} {on ? 'on' : 'off'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- Module 2: compliant landing pages ----------

type LandingDoc = {
  id?: string;
  slug: string;
  headline: string;
  subheadline: string;
  bullets: string[];
  faq: { q: string; a: string }[];
  ctaText: string;
  ctaUrl: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
};

const emptyLanding: LandingDoc = {
  slug: '', headline: '', subheadline: '', bullets: [], faq: [], ctaText: 'Contact us', ctaUrl: '/contact',
  metaTitle: '', metaDescription: '', published: false,
};

function LandingModule() {
  const [pages, setPages] = useState<LandingDoc[]>([]);
  const [edit, setEdit] = useState<LandingDoc | null>(null);
  const [bulletsText, setBulletsText] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    getDocs(collection(db, 'landingPages'))
      .then((snap) => setPages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LandingDoc, 'id'>) }))))
      .catch(() => setPages([]));
  };
  useEffect(load, []);

  const startEdit = (l: LandingDoc) => { setEdit(l); setBulletsText((l.bullets || []).join('\n')); };

  const save = async () => {
    if (!edit) return;
    const slug = edit.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (!slug) { setMsg('Slug is required.'); return; }
    const payload = { ...edit, slug, bullets: bulletsText.split('\n').map((b) => b.trim()).filter(Boolean) };
    delete (payload as Partial<LandingDoc>).id;
    if (edit.id) {
      await setDoc(doc(db, 'landingPages', edit.id), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      await addDoc(collection(db, 'landingPages'), { ...payload, createdAt: serverTimestamp() });
    }
    setEdit(null);
    setMsg('Saved.');
    setTimeout(() => setMsg(''), 2000);
    load();
  };

  const remove = async (id?: string) => {
    if (!id) return;
    await deleteDoc(doc(db, 'landingPages', id));
    load();
  };

  const labelStyle: React.CSSProperties = { color: '#9cb8d9', fontSize: 12, fontWeight: 600, display: 'grid', gap: 5 };

  return (
    <div style={card}>
      <h3 style={h3Style}><FileText size={18} color="#60a5fa" /> Compliant campaign landing pages</h3>
      <p style={descStyle}>
        Pages published here are served at <code style={codeStyle}>/lp/&lt;slug&gt;</code> — clean, policy-safe destinations for ad campaigns
        (no product names or claims). Keep content informational only.
      </p>

      {!edit ? (
        <>
          <button style={btn} onClick={() => startEdit({ ...emptyLanding })}><Plus size={14} /> New landing page</button>
          {msg && <span style={{ color: '#34d399', fontSize: 12, marginLeft: 10 }}>{msg}</span>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(59,130,246,0.25)' }}>
                <th style={thStyle}>Slug</th><th style={thStyle}>Headline</th><th style={thStyle}>Status</th><th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={tdStyle}><code style={codeStyle}>/lp/{p.slug}</code></td>
                  <td style={tdStyle}>{p.headline}</td>
                  <td style={tdStyle}>{p.published ? '🟢 live' : '⚪ draft'}</td>
                  <td style={{ ...tdStyle, display: 'flex', gap: 6 }}>
                    <button style={btnGhost} onClick={() => startEdit(p)}>Edit</button>
                    <button style={{ ...btnGhost, color: '#f87171' }} onClick={() => remove(p.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {!pages.length && <tr><td colSpan={4} style={{ padding: 12, color: '#5a7a9a' }}>No landing pages yet.</td></tr>}
            </tbody>
          </table>
        </>
      ) : (
        <div style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
          <label style={labelStyle}>Slug<input style={input} value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} placeholder="quality-assurance" /></label>
          <label style={labelStyle}>Headline<input style={input} value={edit.headline} onChange={(e) => setEdit({ ...edit, headline: e.target.value })} /></label>
          <label style={labelStyle}>Subheadline<input style={input} value={edit.subheadline} onChange={(e) => setEdit({ ...edit, subheadline: e.target.value })} /></label>
          <label style={labelStyle}>Bullet points (one per line)<textarea style={{ ...input, minHeight: 90 }} value={bulletsText} onChange={(e) => setBulletsText(e.target.value)} /></label>
          <label style={labelStyle}>CTA text<input style={input} value={edit.ctaText} onChange={(e) => setEdit({ ...edit, ctaText: e.target.value })} /></label>
          <label style={labelStyle}>CTA URL<input style={input} value={edit.ctaUrl} onChange={(e) => setEdit({ ...edit, ctaUrl: e.target.value })} /></label>
          <label style={labelStyle}>Meta title<input style={input} value={edit.metaTitle} onChange={(e) => setEdit({ ...edit, metaTitle: e.target.value })} /></label>
          <label style={labelStyle}>Meta description<textarea style={{ ...input, minHeight: 60 }} value={edit.metaDescription} onChange={(e) => setEdit({ ...edit, metaDescription: e.target.value })} /></label>
          <label style={{ ...labelStyle, display: 'flex', gap: 8, alignItems: 'center', color: '#c8dff5' }}>
            <input type="checkbox" checked={edit.published} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} /> Published (live at /lp/{edit.slug || '…'})
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn} onClick={save}><Save size={14} /> Save</button>
            <button style={btnGhost} onClick={() => setEdit(null)}>Cancel</button>
            {msg && <span style={{ color: '#f87171', fontSize: 12, alignSelf: 'center' }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Module 3: ads compliance scanner ----------

const DEFAULT_BANNED = [
  'cure', 'treats', 'heals', 'medicine for', 'drug for', 'for human use', 'human consumption',
  'weight loss', 'fat burner', 'build muscle', 'anti-aging', 'therapeutic', 'dosage for humans',
];

const CLAIM_PHRASES = ['guaranteed results', 'clinically proven to treat', 'safe for humans', 'no side effects'];

function ComplianceModule() {
  const [banned, setBanned] = useState<string[]>(DEFAULT_BANNED);
  const [bannedText, setBannedText] = useState(DEFAULT_BANNED.join('\n'));
  const [results, setResults] = useState<{ p: Product; hits: string[] }[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const { domains } = useDomains();

  useEffect(() => {
    getDoc(doc(db, 'settings', 'adsCompliance')).then((s) => {
      if (s.exists() && Array.isArray(s.data().bannedPhrases)) {
        setBanned(s.data().bannedPhrases);
        setBannedText(s.data().bannedPhrases.join('\n'));
      }
    }).catch(() => undefined);
  }, []);

  const saveBanned = async () => {
    const list = bannedText.split('\n').map((b) => b.trim().toLowerCase()).filter(Boolean);
    setBanned(list);
    await setDoc(doc(db, 'settings', 'adsCompliance'), { bannedPhrases: list, updatedAt: serverTimestamp() }, { merge: true });
  };

  const scan = async () => {
    setScanning(true);
    setResults(null);
    try {
      const snap = await getDocs(collection(db, PRODUCTS_COL));
      const out: { p: Product; hits: string[] }[] = [];
      snap.docs.forEach((d) => {
        const p = { id: d.id, ...d.data() } as Product & { coaPdfUrl?: string; description?: string; longDescription?: string };
        const hay = `${p.name || ''} ${p.description || ''} ${p.longDescription || ''}`.toLowerCase();
        const hits: string[] = [];
        banned.forEach((b) => { if (b && hay.includes(b)) hits.push(`banned phrase: "${b}"`); });
        CLAIM_PHRASES.forEach((c) => { if (hay.includes(c)) hits.push(`risky claim: "${c}"`); });
        if (!p.coaPdfUrl) hits.push('missing COA PDF link');
        if (hits.length) out.push({ p, hits });
      });
      setResults(out);
    } finally {
      setScanning(false);
    }
  };

  const hideEverywhere = async (p: Product) => {
    await updateDoc(doc(db, PRODUCTS_COL, p.id), { domainVisibility: ['__hidden__'] });
    setResults((rs) => rs ? rs.filter((r) => r.p.id !== p.id) : rs);
  };

  return (
    <div style={card}>
      <h3 style={h3Style}><ShieldCheck size={18} color="#60a5fa" /> Ads compliance scanner</h3>
      <p style={descStyle}>
        Scans product names and descriptions for phrases likely to violate Google Ads / MHRA rules, and flags products missing a COA.
        Fix issues before pointing ads at <code style={codeStyle}>{domains[0] || 'your domain'}</code>.
      </p>

      <label style={{ color: '#9cb8d9', fontSize: 12, fontWeight: 600 }}>Banned phrases (one per line)</label>
      <textarea style={{ ...input, minHeight: 120, margin: '6px 0' }} value={bannedText} onChange={(e) => setBannedText(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button style={btnGhost} onClick={saveBanned}><Save size={14} /> Save phrases</button>
        <button style={btn} onClick={scan} disabled={scanning}><RefreshCw size={14} /> {scanning ? 'Scanning…' : 'Scan products'}</button>
      </div>

      {results && (
        results.length === 0 ? (
          <p style={{ color: '#34d399' }}>✅ No issues found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(59,130,246,0.25)' }}>
                <th style={thStyle}>Product</th><th style={thStyle}>Issues</th><th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ p, hits }) => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={tdStyle}>{p.name || p.id}</td>
                  <td style={tdStyle}>{hits.map((h) => <div key={h} style={{ color: '#fbbf24' }}>⚠ {h}</div>)}</td>
                  <td style={tdStyle}>
                    <button style={btnGhost} onClick={() => hideEverywhere(p)} title="Hide from all domains until fixed">
                      <EyeOff size={14} /> Hide everywhere
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ---------- Tab ----------

export default function AdsDomainsTab() {
  return (
    <div>
      <h2 style={{ marginTop: 0, color: '#e4f0ff' }}>Ads & Domains</h2>
      <VisibilityModule />
      <LandingModule />
      <ComplianceModule />
    </div>
  );
}
