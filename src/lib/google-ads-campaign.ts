/**
 * PH Labs — Professional Google Ads Search Campaign (UK)
 * Safe for Google Ads policy: no molecule names, no medical claims.
 * Ready to import into Google Ads Editor or upload manually.
 */

export const CAMPAIGN = {
  name: "PH Labs — Research Compounds UK",
  status: "PAUSED" as const, // User enables after review
  network: "Search Network Only" as const,
  locations: ["United Kingdom"],
  languages: ["English"],
  bidStrategy: "Manual CPC" as const,
  dailyBudget: 37, // GBP — adjust before launch
  startDate: "", // Fill in: YYYY-MM-DD
  endDate: "",   // Optional
  landingPage: "https://phlabs.co.uk/compound",
  trackingTemplate: "{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}",
};

// ─── Ad Groups ───
export interface AdGroup {
  name: string;
  maxCpc: number; // GBP
  keywords: string[]; // Phrase match + Exact match variants
  headlines: string[]; // Up to 15, each ≤30 chars
  descriptions: string[]; // Up to 4, each ≤90 chars
}

export const AD_GROUPS: AdGroup[] = [
  // ── Ad Group 1: Core research compounds ──
  {
    name: "AG01 — Research Compounds",
    maxCpc: 0.65,
    keywords: [
      '"research compounds uk"',
      '"lab compounds uk"',
      '"analytical standards uk"',
      '"reference standards uk"',
      '"research compounds"',
      '"lab reagents uk"',
      '"laboratory reagents uk"',
      '"research materials uk"',
      '[research compounds uk]',
      '[analytical standards uk]',
    ],
    headlines: [
      "UK Research Compounds",
      "Lab-Grade Materials",
      "Batch Docs Supplied",
      "For Research Use Only",
      "Premium Lab Supply",
      "UK Laboratory Stock",
      "Controlled Conditions",
      "Scientific Research Only",
      "High-Purity Standards",
      "Professional Labs UK",
      "Analytical Grade Only",
      "Research Supply UK",
      "Verified Documentation",
      "Institution-Grade Supply",
      "UK-Based Preparation",
    ],
    descriptions: [
      "High-purity research compounds prepared under controlled UK laboratory conditions. Full batch documentation supplied with every order.",
      "Trusted by academic and commercial laboratories across the United Kingdom. For scientific and analytical research use only.",
      "Detailed certificates and batch records included. Professional-grade materials for qualified researchers and institutions.",
      "Dispatched from UK facilities with tracked delivery. Research-use-only compounds for laboratory analysis.",
    ],
  },

  // ── Ad Group 2: Laboratory supplies ──
  {
    name: "AG02 — Laboratory Supplies",
    maxCpc: 0.45,
    keywords: [
      '"laboratory supplies uk"',
      '"lab supplies uk"',
      '"scientific supplies uk"',
      '"research lab supplies"',
      '"lab equipment uk"',
      '"analytical supplies uk"',
      '[laboratory supplies uk]',
      '[lab supplies uk]',
    ],
    headlines: [
      "Lab Supplies UK",
      "Scientific Materials",
      "Research Lab Stock",
      "UK Laboratory Supply",
      "Analytical Supplies",
      "Professional Lab Gear",
      "Institution-Grade Stock",
      "Controlled UK Dispatch",
      "Lab-Ready Materials",
      "Research Supply Store",
      "Scientific Supply UK",
      "Batch Tracked Delivery",
      "UK-Based Stockist",
      "Laboratory Essentials",
      "Research Grade Only",
    ],
    descriptions: [
      "Comprehensive laboratory supplies for UK research institutions. Professional-grade materials with full documentation.",
      "From analytical standards to lab reagents — everything your research facility needs. UK stock, fast dispatch.",
      "Supplied to universities, private labs and commercial facilities across the UK. Research use only.",
    ],
  },

  // ── Ad Group 3: Reagents / standards ──
  {
    name: "AG03 — Reagents & Standards",
    maxCpc: 0.70,
    keywords: [
      '"lab reagents uk"',
      '"laboratory reagents uk"',
      '"analytical reagents uk"',
      '"research reagents uk"',
      '"chemical standards uk"',
      '"reference materials uk"',
      '[lab reagents uk]',
      '[chemical standards uk]',
    ],
    headlines: [
      "Analytical Reagents UK",
      "Reference Standards",
      "Lab Reagents Stocked",
      "Chemical Standards UK",
      "Research Reagents Only",
      "UK Lab Reagent Supply",
      "High-Purity Standards",
      "Batch Docs Included",
      "Professional Reagents",
      "Institution Supply UK",
      "Verified Reagent Batches",
      "Laboratory Standard Stock",
      "UK Research Reagents",
      "Controlled Preparation",
      "Scientific Grade Only",
    ],
    descriptions: [
      "Analytical-grade reagents and reference standards for UK laboratories. Every batch supplied with complete documentation.",
      "Prepared under controlled laboratory conditions. For qualified researchers, academic institutions and commercial labs.",
      "Full traceability and batch records. UK-based preparation and dispatch for research applications only.",
    ],
  },

  // ── Ad Group 4: Bacteriostatic water (safe, non-peptide) ──
  {
    name: "AG04 — Bacteriostatic Water",
    maxCpc: 0.35,
    keywords: [
      '"bacteriostatic water uk"',
      '"bacteriostatic water for lab"',
      '"lab water uk"',
      '"sterile water for research"',
      '"bacteriostatic water"',
      '[bacteriostatic water uk]',
    ],
    headlines: [
      "Bacteriostatic Water UK",
      "Lab-Grade Sterile Water",
      "Research Water Supply",
      "UK Laboratory Water",
      "Sterile Lab Water Stock",
      "For Research Use Only",
      "Laboratory Water UK",
      "Professional Lab Supply",
      "Controlled UK Dispatch",
      "Research-Grade Water",
      "Lab Essential Stocked",
      "UK-Based Preparation",
      "Institution Supply Only",
      "Batch Verified Water",
      "Scientific Grade Stock",
    ],
    descriptions: [
      "Laboratory-grade bacteriostatic water prepared under controlled UK conditions. For research and analytical use only.",
      "Sterile, batch-verified and supplied with documentation. Trusted by UK research facilities and institutions.",
      "Essential laboratory reagent. UK stock with fast tracked delivery. Professional and institutional supply.",
    ],
  },
];

// ─── Negative Keywords (Campaign Level) ───
// Add these at campaign level to avoid wasted spend
export const NEGATIVE_KEYWORDS = [
  // Pharma / medical triggers
  "human consumption", "human use", "injectable", "injection",
  "dosage", "dose", "how to use", "how to inject",
  "treatment", "therapy", "therapeutic", "cure", "cures",
  "medical", "medicine", "medicinal", "prescription",
  "patient", "clinical", "diagnosis", "diagnose",
  "weight loss", "fat loss", "diet", "slimming",
  "anti aging", "anti-aging", "muscle growth", "bodybuilding",
  "steroid", "sarms", "prohormone",
  "diabetes", "cancer", "disease",

  // Peptide molecule names (Google flags these in ads)
  "retatrutide", "tirzepatide", "semaglutide",
  "bpc-157", "bpc 157", "tb-500", "tb 500",
  "ghk-cu", "ghk cu", "pt-141", "pt 141",
  "melanotan", "mt-2", "mt ii", "mots-c", "kpv",
  "ipamorelin", "cjc-1295", "cjc 1295",
  "hgh", "somatropin", "igf-1", "igf 1",

  // Non-buying intent
  "free", "cheap", "discount", "wholesale", "bulk",
  "jobs", "career", "salary", "cv", "job",
  "pdf", "download", "book", "course", "university",
  "wiki", "wikipedia", "reddit", "forum",

  // Competitor brands (add your known competitors)
  // "peptide sciences", "pure peptides", etc. — user can append
];

// ─── Sitelink Extensions ───
export const SITELINKS = [
  {
    text: "Quality Control",
    desc1: "Batch verification & documentation",
    desc2: "Full traceability on every order",
    url: "https://phlabs.co.uk/compound#qc",
  },
  {
    text: "About PH Labs",
    desc1: "UK-based laboratory supply",
    desc2: "Trusted by research institutions",
    url: "https://phlabs.co.uk/about",
  },
  {
    text: "Shipping Info",
    desc1: "Tracked UK delivery",
    desc2: "Fast dispatch from UK stock",
    url: "https://phlabs.co.uk/shipping",
  },
  {
    text: "Contact",
    desc1: "Speak to our team",
    desc2: "Institution & bulk enquiries",
    url: "https://phlabs.co.uk/contact",
  },
];

// ─── Callout Extensions ───
export const CALLOUTS = [
  "UK Laboratory Stocked",
  "Batch Documentation Supplied",
  "Research Use Only",
  "Tracked Delivery",
  "Institution-Grade",
  "Controlled Preparation",
  "Professional Supply",
  "Fast UK Dispatch",
];

// ─── Structured Snippets (Types) ───
export const STRUCTURED_SNIPPETS = {
  header: "Types",
  values: [
    "Analytical Standards",
    "Lab Reagents",
    "Reference Materials",
    "Research Compounds",
    "Bacteriostatic Water",
  ],
};
