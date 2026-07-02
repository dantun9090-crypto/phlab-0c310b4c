/**
 * PH Labs — Professional Google Ads Search Campaigns (UK)
 *
 * Three production-ready campaigns, one per landing page:
 *   1. "PH Labs — Compound (Research Standards) UK"  → /compound
 *   2. "PH Labs — Editorial Lab Supply UK"           → /landing/phlabs
 *   3. "PH Labs — Research Standards UK"             → /research
 *
 * All are policy-safe: no molecule names, no medical claims, no dose words.
 * Generate Google Ads Editor CSVs via `buildAdsEditorCsvs()` below and import
 * directly into Google Ads Editor → File → Import.
 */

export interface AdGroup {
  name: string;
  maxCpc: number; // GBP
  keywords: string[]; // phrase + exact match
  headlines: string[]; // ≤30 chars each, up to 15
  descriptions: string[]; // ≤90 chars each, up to 4
}

export interface Sitelink {
  text: string;
  desc1: string;
  desc2: string;
  url: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'PAUSED' | 'ENABLED';
  network: 'Search Network Only';
  locations: string[];
  languages: string[];
  bidStrategy: 'Manual CPC';
  dailyBudget: number; // GBP
  landingPage: string;
  trackingTemplate: string;
  adGroups: AdGroup[];
  negativeKeywords: string[];
  sitelinks: Sitelink[];
  callouts: string[];
  structuredSnippets: { header: string; values: string[] };
}

const UTM_TEMPLATE =
  '{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}';

// ─── Shared negatives (apply to both campaigns) ───────────────────────────
export const NEGATIVE_KEYWORDS: string[] = [
  // pharma / medical
  'human consumption', 'human use', 'human', 'injectable', 'injection',
  'dosage', 'dose', 'dosing', 'cycle', 'stack',
  'how to use', 'how to inject', 'how to mix',
  'treatment', 'therapy', 'therapeutic', 'cure', 'cures',
  'medical', 'medicine', 'medicinal', 'prescription',
  'patient', 'clinical', 'diagnosis', 'diagnose',
  'weight loss', 'fat loss', 'diet', 'slimming',
  'anti aging', 'anti-aging', 'muscle growth', 'bodybuilding',
  'steroid', 'sarms', 'prohormone',
  'diabetes', 'cancer', 'disease',
  // recreational / abuse intent (Google "Dangerous Products" policy)
  'recreational', 'designer', 'designer drug', 'legal high', 'legal highs',
  'rc', 'research chemical', 'research chemicals',
  'psychoactive', 'nootropic high', 'party',
  // molecule names (Google flags these)
  'retatrutide', 'tirzepatide', 'semaglutide',
  'bpc-157', 'bpc 157', 'tb-500', 'tb 500',
  'ghk-cu', 'ghk cu', 'pt-141', 'pt 141',
  'melanotan', 'mt-2', 'mt ii', 'mots-c', 'kpv',
  'ipamorelin', 'cjc-1295', 'cjc 1295',
  'hgh', 'somatropin', 'igf-1', 'igf 1',
  'peptide', 'peptides',
  // non-buying intent
  'free', 'cheap', 'wholesale', 'bulk',
  'jobs', 'job', 'career', 'salary', 'cv',
  'pdf', 'download', 'book', 'course', 'university',
  'wiki', 'wikipedia', 'reddit', 'forum',
];

// ─── Shared callouts & structured snippets ────────────────────────────────
export const CALLOUTS: string[] = [
  'UK Laboratory Stocked',
  'Batch Documentation Supplied',
  'Research Use Only',
  'Tracked Royal Mail Delivery',
  'Institution-Grade Supply',
  'Controlled UK Preparation',
  'Fast Same-Day Dispatch',
  'Professional Lab Supply',
];

export const STRUCTURED_SNIPPETS = {
  header: 'Types',
  values: [
    'Analytical Standards',
    'Lab Reagents',
    'Reference Materials',
    'Research Materials',
    'Bacteriostatic Water',
  ],
};

// ─── Campaign 1 — /compound ───────────────────────────────────────────────
export const CAMPAIGN_COMPOUND: Campaign = {
  id: 'phlabs-compound-uk',
  name: 'PH Labs — Compound (Research Standards) UK',
  status: 'PAUSED',
  network: 'Search Network Only',
  locations: ['United Kingdom'],
  languages: ['English'],
  bidStrategy: 'Manual CPC',
  dailyBudget: 37,
  landingPage: 'https://phlabs.co.uk/compound',
  trackingTemplate: UTM_TEMPLATE,
  negativeKeywords: NEGATIVE_KEYWORDS,
  callouts: CALLOUTS,
  structuredSnippets: STRUCTURED_SNIPPETS,
  sitelinks: [
    { text: 'Quality Control', desc1: 'Batch verification & docs', desc2: 'Full traceability per order', url: 'https://phlabs.co.uk/compound#qc' },
    { text: 'About PH Labs', desc1: 'UK-based lab supply', desc2: 'Trusted by institutions', url: 'https://phlabs.co.uk/about' },
    { text: 'Shipping Info', desc1: 'Tracked UK delivery', desc2: 'Fast dispatch from UK', url: 'https://phlabs.co.uk/shipping' },
    { text: 'Contact', desc1: 'Speak to our team', desc2: 'Institution & bulk enquiries', url: 'https://phlabs.co.uk/contact' },
  ],
  adGroups: [
    {
      name: 'AG01 — Reference Standards UK',
      maxCpc: 0.75,
      keywords: [
        '"reference standards uk"', '"laboratory reagents uk"',
        '"lab reagents uk"', '"analytical reagents uk"',
        '"analytical standards uk"', '"reference materials uk"',
        '"certified reference materials uk"', '"reagent supplier uk"',
        '[reference standards uk]', '[laboratory reagents uk]',
        '[lab reagents uk]',
      ],
      headlines: [
        'Reference Standards UK', 'Laboratory Reagents UK', 'Lab-Grade Materials',
        'Batch Docs Supplied', 'For Research Use Only', 'UK Laboratory Stock',
        'Analytical Grade Only', 'Reagent Supplier UK', 'High-Purity Standards',
        'Professional Labs UK', 'Institution-Grade Supply', 'Reference Materials UK',
        'Verified Documentation', 'Controlled UK Preparation', 'Research Supply UK',
      ],
      descriptions: [
        'Analytical reference standards and laboratory reagents prepared under controlled UK conditions. Full batch documentation supplied.',
        'Trusted by academic and commercial laboratories across the UK. For scientific and analytical research use only.',
        'Detailed certificates and batch records included. Professional-grade reference materials for qualified researchers.',
        'Dispatched from UK facilities with tracked delivery. Reference standards and reagents for laboratory analysis.',
      ],
    },
    {
      name: 'AG02 — Laboratory Supplies',
      maxCpc: 0.45,
      keywords: [
        '"laboratory supplies uk"', '"lab supplies uk"',
        '"scientific supplies uk"', '"analytical supplies uk"',
        '"lab equipment uk"', '"research lab supplies"',
        '[laboratory supplies uk]', '[lab supplies uk]',
      ],
      headlines: [
        'Lab Supplies UK', 'Scientific Materials', 'Research Lab Stock',
        'UK Laboratory Supply', 'Analytical Supplies', 'Professional Lab Gear',
        'Institution-Grade Stock', 'Controlled UK Dispatch', 'Lab-Ready Materials',
        'Reference Standards UK', 'Scientific Supply UK', 'Batch Tracked Delivery',
        'UK-Based Stockist', 'Laboratory Essentials', 'Research Grade Only',
      ],
      descriptions: [
        'Comprehensive laboratory supplies for UK research institutions. Professional-grade with full documentation.',
        'From analytical standards to lab reagents — everything your research facility needs. UK stock, fast dispatch.',
        'Supplied to universities, private labs and commercial facilities across the UK. Research use only.',
      ],
    },
    {
      name: 'AG03 — Reagents & Standards',
      maxCpc: 0.70,
      keywords: [
        '"lab reagents uk"', '"laboratory reagents uk"',
        '"analytical reagents uk"', '"research reagents uk"',
        '"reference materials uk"', '"reagent standards uk"',
        '[lab reagents uk]', '[reference materials uk]',
      ],
      headlines: [
        'Analytical Reagents UK', 'Reference Standards', 'Lab Reagents Stocked',
        'Reference Materials UK', 'Research Reagents Only', 'UK Lab Reagent Supply',
        'High-Purity Standards', 'Batch Docs Included', 'Professional Reagents',
        'Institution Supply UK', 'Verified Reagent Batches', 'Laboratory Standard Stock',
        'UK Research Reagents', 'Controlled Preparation', 'Scientific Grade Only',
      ],
      descriptions: [
        'Analytical-grade reagents and reference standards for UK laboratories. Every batch with documentation.',
        'Prepared under controlled laboratory conditions. For qualified researchers, academic and commercial labs.',
        'Full traceability and batch records. UK-based preparation and dispatch for research applications only.',
      ],
    },
    {
      name: 'AG04 — Bacteriostatic Water',
      maxCpc: 0.35,
      keywords: [
        '"bacteriostatic water uk"', '"bacteriostatic water for lab"',
        '"lab water uk"', '"sterile water for research"',
        '"bacteriostatic water"', '[bacteriostatic water uk]',
      ],
      headlines: [
        'Bacteriostatic Water UK', 'Lab-Grade Sterile Water', 'Research Water Supply',
        'UK Laboratory Water', 'Sterile Lab Water Stock', 'For Research Use Only',
        'Laboratory Water UK', 'Professional Lab Supply', 'Controlled UK Dispatch',
        'Research-Grade Water', 'Lab Essential Stocked', 'UK-Based Preparation',
        'Institution Supply Only', 'Batch Verified Water', 'Scientific Grade Stock',
      ],
      descriptions: [
        'Laboratory-grade bacteriostatic water prepared under controlled UK conditions. For research and analytical use only.',
        'Sterile, batch-verified and supplied with documentation. Trusted by UK research facilities.',
        'Essential laboratory reagent. UK stock with fast tracked delivery. Professional and institutional supply.',
      ],
    },
  ],
};

// ─── Campaign 2 — /landing/phlabs (editorial / brand) ─────────────────────
export const CAMPAIGN_EDITORIAL: Campaign = {
  id: 'phlabs-editorial-uk',
  name: 'PH Labs — Editorial Lab Supply UK',
  status: 'PAUSED',
  network: 'Search Network Only',
  locations: ['United Kingdom'],
  languages: ['English'],
  bidStrategy: 'Manual CPC',
  dailyBudget: 28,
  landingPage: 'https://phlabs.co.uk/landing/phlabs',
  trackingTemplate: UTM_TEMPLATE,
  negativeKeywords: NEGATIVE_KEYWORDS,
  callouts: CALLOUTS,
  structuredSnippets: STRUCTURED_SNIPPETS,
  sitelinks: [
    { text: 'Quality Control', desc1: 'Batch documentation', desc2: 'Verified per order', url: 'https://phlabs.co.uk/landing/phlabs#qc' },
    { text: 'About PH Labs', desc1: 'UK laboratory team', desc2: 'Institution trusted', url: 'https://phlabs.co.uk/about' },
    { text: 'Research Catalogue', desc1: 'Browse standards', desc2: 'Reference standards', url: 'https://phlabs.co.uk/products' },
    { text: 'Contact', desc1: 'Lab sourcing', desc2: 'Bulk enquiries welcome', url: 'https://phlabs.co.uk/contact' },
  ],
  adGroups: [
    {
      name: 'AG01 — UK Lab Supplier Brand',
      maxCpc: 0.55,
      keywords: [
        '"uk lab supplier"', '"british research supplier"',
        '"uk laboratory supplier"', '"lab supplier uk"',
        '"uk based lab supply"', '"laboratory stockist uk"',
        '[uk lab supplier]', '[laboratory stockist uk]',
      ],
      headlines: [
        'UK Lab Supplier', 'British Research Stock', 'Institution Trusted',
        'PH Labs UK', 'Research Use Only', 'Lab-Grade Standards',
        'UK Dispatch Daily', 'Editorial Lab Supply', 'Documented Batches',
        'Royal Mail Tracked', 'For Qualified Labs', 'Premium UK Stock',
        'Lab Sourcing UK', 'Verified UK Supplier', 'Research Grade Only',
      ],
      descriptions: [
        'Editorial laboratory supply from a UK-based research stockist. Full documentation on every batch.',
        'PH Labs supplies UK research institutions, universities and private labs. Research use only.',
        'Premium-grade reference standards and reagents. UK preparation, UK dispatch, tracked delivery.',
        'Trusted laboratory supplier — institution accounts and bulk orders welcome.',
      ],
    },
    {
      name: 'AG02 — Reference Standards UK',
      maxCpc: 0.65,
      keywords: [
        '"reference standards uk"', '"analytical reference standards"',
        '"certified reference materials uk"', '"crm supplier uk"',
        '"reference material uk"', '[reference standards uk]',
      ],
      headlines: [
        'Reference Standards UK', 'Analytical Standards', 'Certified Materials',
        'CRM Supplier UK', 'Documented Standards', 'UK Reference Stock',
        'High-Purity CRMs', 'Lab Standards UK', 'Institution Grade',
        'Verified Reference Lots', 'Research Use Only', 'UK Lab Supply',
        'Tracked UK Delivery', 'Batch Records Inc.', 'Scientific Grade Only',
      ],
      descriptions: [
        'Certified reference materials and analytical standards prepared under controlled UK conditions.',
        'Every reference lot supplied with full batch documentation and traceability records.',
        'For UK research laboratories and institutions. Research and analytical use only.',
      ],
    },
    {
      name: 'AG03 — Research Catalogue',
      maxCpc: 0.50,
      keywords: [
        '"research catalogue uk"', '"laboratory catalogue uk"',
        '"research materials catalogue"', '"lab supply catalogue uk"',
        '[research catalogue uk]',
      ],
      headlines: [
        'Research Catalogue UK', 'Browse Lab Stock', 'Full UK Catalogue',
        'Lab Supply Range', 'PH Labs Catalogue', 'Research Grade Only',
        'Institution Stock', 'Documented Standards', 'UK Dispatch Same Day',
        'Editorial Lab Range', 'Verified Inventory', 'Research Use Only',
        'Trusted UK Supplier', 'High-Purity Range', 'Lab-Grade Materials',
      ],
      descriptions: [
        'Browse the full PH Labs research catalogue — reference standards, reagents and laboratory water.',
        'UK research stockist with documented batches and tracked Royal Mail delivery on every order.',
        'Catalogue curated for academic, commercial and institutional UK research laboratories.',
      ],
    },
  ],
};

// ─── Campaign 3 — /research ────────────────────────────────────────────────
export const CAMPAIGN_RESEARCH: Campaign = {
  id: 'phlabs-research-uk',
  name: 'PH Labs — Research Standards UK',
  status: 'PAUSED',
  network: 'Search Network Only',
  locations: ['United Kingdom'],
  languages: ['English'],
  bidStrategy: 'Manual CPC',
  dailyBudget: 30,
  landingPage: 'https://phlabs.co.uk/research',
  trackingTemplate: UTM_TEMPLATE,
  negativeKeywords: NEGATIVE_KEYWORDS,
  callouts: CALLOUTS,
  structuredSnippets: STRUCTURED_SNIPPETS,
  sitelinks: [
    { text: 'Quality Control', desc1: 'Batch docs & verification', desc2: 'Full traceability per order', url: 'https://phlabs.co.uk/quality-control' },
    { text: 'Research Catalogue', desc1: 'Browse reference standards', desc2: 'Full UK lab range', url: 'https://phlabs.co.uk/products' },
    { text: 'About PH Labs', desc1: 'UK-based lab supply', desc2: 'Trusted by institutions', url: 'https://phlabs.co.uk/about' },
    { text: 'Contact', desc1: 'Speak to our team', desc2: 'Bulk & institution enquiries', url: 'https://phlabs.co.uk/contact' },
  ],
  adGroups: [
    {
      name: 'AG01 — Research Standards UK',
      maxCpc: 0.70,
      keywords: [
        '"research standards uk"', '"laboratory standards uk"',
        '"analytical research standards"', '"uk research standards"',
        '"scientific standards uk"', '"reference standards research"',
        '"lab standards uk"', '[research standards uk]',
        '[laboratory standards uk]',
      ],
      headlines: [
        'Research Standards UK', 'Laboratory Standards', 'UK Research Supply',
        'Analytical Standards', 'For Research Use Only', 'Scientific Grade UK',
        'Institution Trusted', 'Batch Docs Included', 'UK Lab Stock',
        'High-Purity Standards', 'Research Grade Only', 'Verified UK Supply',
        'Professional Labs UK', 'Controlled Preparation', 'Documented Standards',
      ],
      descriptions: [
        'Analytical standards prepared under UK lab conditions. Full batch documentation supplied.',
        'Trusted by UK academic and commercial labs. Scientific-grade materials for qualified researchers.',
        'Every standard has traceability records and certificates. UK preparation, tracked delivery.',
        'Professional lab standards for research use. Full docs, institution supply only.',
      ],
    },
    {
      name: 'AG02 — UK Lab Research Materials',
      maxCpc: 0.60,
      keywords: [
        '"lab research materials uk"', '"research materials uk"',
        '"laboratory research uk"', '"uk lab research supply"',
        '"scientific research materials"', '[lab research materials uk]',
        '[research materials uk]',
      ],
      headlines: [
        'Lab Research Materials', 'UK Research Supply', 'Scientific Materials',
        'Research Lab Stock UK', 'For Research Use Only', 'Institution-Grade Stock',
        'Professional Lab UK', 'Batch Verified Supply', 'UK Laboratory Stock',
        'Research Grade Only', 'Tracked UK Delivery', 'Controlled UK Dispatch',
        'Lab Sourcing UK', 'High-Purity Materials', 'Documented Batches',
      ],
      descriptions: [
        'Research materials for UK labs. Professional-grade with full documentation included.',
        'From analytical standards to lab reagents — everything UK labs need. Fast tracked dispatch.',
        'Supplied to universities and private labs. Scientific research use only.',
        'UK-based prep and stock. Every batch verified with docs for qualified teams.',
      ],
    },
    {
      name: 'AG03 — Analytical Research UK',
      maxCpc: 0.65,
      keywords: [
        '"analytical research uk"', '"analytical lab research"',
        '"research analytical uk"', '"uk analytical standards"',
        '"analytical research materials"', '[analytical research uk]',
      ],
      headlines: [
        'Analytical Research UK', 'UK Analytical Supply', 'Research Grade Only',
        'Lab Analysis Materials', 'For Research Use Only', 'Scientific Analysis UK',
        'Institution-Grade Stock', 'Batch Docs Included', 'UK Laboratory Supply',
        'High-Purity Research', 'Professional Labs UK', 'Controlled Preparation',
        'Analytical Standards', 'Verified UK Supply', 'Tracked UK Delivery',
      ],
      descriptions: [
        'Analytical-grade research materials for UK labs. Full docs and batch traceability.',
        'Prepared under controlled lab conditions for qualified academic and commercial use.',
        'Every lot supplied with certificates and traceability. UK prep, fast dispatch.',
        'Professional analytical standards for research use only. UK-based institution supply.',
      ],
    },
  ],
};

// NOTE: /research is the site's research information hub — NOT a paid landing page.
// Do not add CAMPAIGN_RESEARCH here. Keep paid traffic on /compound and /landing/phlabs.
export const CAMPAIGNS: Campaign[] = [CAMPAIGN_COMPOUND, CAMPAIGN_EDITORIAL];

// ─── CSV builders for Google Ads Editor ───────────────────────────────────
// Format: Google Ads Editor accepts simple CSV with one row per entity.
// We produce three CSVs per campaign: campaign+adgroups, keywords, ads.

const csvEscape = (v: string | number): string => {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const toCsv = (rows: (string | number)[][]): string =>
  rows.map((r) => r.map(csvEscape).join(',')).join('\n');

export function buildStructureCsv(c: Campaign): string {
  const rows: (string | number)[][] = [
    ['Campaign', 'Ad Group', 'Budget', 'Bid Strategy Type', 'Networks', 'Languages', 'Locations', 'Status', 'Tracking Template', 'Max CPC'],
  ];
  for (const ag of c.adGroups) {
    rows.push([
      c.name, ag.name, c.dailyBudget, c.bidStrategy, c.network,
      c.languages.join(';'), c.locations.join(';'), c.status,
      c.trackingTemplate, ag.maxCpc,
    ]);
  }
  return toCsv(rows);
}

export function buildKeywordsCsv(c: Campaign): string {
  const rows: (string | number)[][] = [
    ['Campaign', 'Ad Group', 'Keyword', 'Match Type', 'Max CPC', 'Status'],
  ];
  for (const ag of c.adGroups) {
    for (const kw of ag.keywords) {
      let matchType = 'Broad';
      let clean = kw;
      if (kw.startsWith('"') && kw.endsWith('"')) { matchType = 'Phrase'; clean = kw.slice(1, -1); }
      else if (kw.startsWith('[') && kw.endsWith(']')) { matchType = 'Exact'; clean = kw.slice(1, -1); }
      rows.push([c.name, ag.name, clean, matchType, ag.maxCpc, 'Enabled']);
    }
  }
  // negatives at campaign level
  for (const neg of c.negativeKeywords) {
    rows.push([c.name, '', neg, 'Phrase', '', 'Negative']);
  }
  return toCsv(rows);
}

export function buildAdsCsv(c: Campaign): string {
  const rows: (string | number)[][] = [
    [
      'Campaign', 'Ad Group', 'Ad Type', 'Final URL',
      ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
      'Path 1', 'Path 2', 'Status',
    ],
  ];
  for (const ag of c.adGroups) {
    const headlines = [...ag.headlines, ...Array(15).fill('')].slice(0, 15);
    const descs = [...ag.descriptions, ...Array(4).fill('')].slice(0, 4);
    rows.push([
      c.name, ag.name, 'Responsive search ad', c.landingPage,
      ...headlines, ...descs,
      'research', 'uk', 'Enabled',
    ]);
  }
  return toCsv(rows);
}

export function buildExtensionsCsv(c: Campaign): string {
  const rows: (string | number)[][] = [
    ['Campaign', 'Extension Type', 'Text / Header', 'Description 1', 'Description 2', 'Final URL'],
  ];
  for (const sl of c.sitelinks) {
    rows.push([c.name, 'Sitelink', sl.text, sl.desc1, sl.desc2, sl.url]);
  }
  for (const co of c.callouts) {
    rows.push([c.name, 'Callout', co, '', '', '']);
  }
  rows.push([c.name, 'Structured Snippet', c.structuredSnippets.header,
    c.structuredSnippets.values.join('; '), '', '']);
  return toCsv(rows);
}

export function buildAdsEditorCsvs(c: Campaign): Record<string, string> {
  return {
    [`${c.id}__1_structure.csv`]: buildStructureCsv(c),
    [`${c.id}__2_keywords.csv`]: buildKeywordsCsv(c),
    [`${c.id}__3_ads.csv`]: buildAdsCsv(c),
    [`${c.id}__4_extensions.csv`]: buildExtensionsCsv(c),
  };
}

// ─── Banned-token guard (must match landing-banned-tokens-scan.ts) ────────
export const BANNED_AD_TOKENS = [
  'human', 'consumption', 'injectable', 'injection', 'dosage', 'dose',
  'treatment', 'therapy', 'therapeutic', 'cure', 'medicine', 'medicinal',
  'prescription', 'clinical', 'diagnosis', 'patient',
  'weight loss', 'fat loss', 'anti-aging', 'anti aging', 'muscle growth',
  'bodybuilding', 'steroid', 'sarms', 'diabetes', 'cancer',
  'retatrutide', 'tirzepatide', 'semaglutide', 'bpc-157', 'bpc 157',
  'tb-500', 'tb 500', 'ghk-cu', 'pt-141', 'melanotan', 'mt-2',
  'mots-c', 'kpv', 'ipamorelin', 'cjc-1295', 'hgh', 'somatropin', 'igf-1',
];

export interface ScanResult {
  campaign: string;
  ok: boolean;
  hits: { where: string; token: string; text: string }[];
}

export function scanCampaign(c: Campaign): ScanResult {
  const hits: ScanResult['hits'] = [];
  const check = (where: string, text: string) => {
    const lc = text.toLowerCase();
    for (const t of BANNED_AD_TOKENS) {
      if (lc.includes(t)) hits.push({ where, token: t, text });
    }
  };
  for (const ag of c.adGroups) {
    ag.headlines.forEach((h, i) => check(`${ag.name} / Headline ${i + 1}`, h));
    ag.descriptions.forEach((d, i) => check(`${ag.name} / Description ${i + 1}`, d));
  }
  c.sitelinks.forEach((sl) => {
    check(`Sitelink "${sl.text}"`, sl.text);
    check(`Sitelink "${sl.text}" desc1`, sl.desc1);
    check(`Sitelink "${sl.text}" desc2`, sl.desc2);
  });
  c.callouts.forEach((co, i) => check(`Callout ${i + 1}`, co));
  return { campaign: c.name, ok: hits.length === 0, hits };
}
