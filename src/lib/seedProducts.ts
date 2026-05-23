import { collection, addDoc, getDocs, deleteDoc, doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

const PRODUCTS_COL = 'product_stock';

const IMG_VIAL = 'https://cdn.wegic.ai/assets/onepage/agent/images/1773194743033.jpg?imageMogr2/format/webp';

/** Convert a product name to a URL-safe slug */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()[\]]/g, '')         // remove brackets
    .replace(/[^a-z0-9]+/g, '-')    // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '');       // trim leading/trailing hyphens
}

const INITIAL_PRODUCTS = [
  // ─── Retatrutide ───────────────────────────────────────────────
  {
    name: 'Retatrutide',
    slug: 'retatrutide',
    description: `Retatrutide is a novel triple agonist peptide targeting GLP-1, GIP, and glucagon receptors simultaneously, representing the latest generation of metabolic research compounds. Its triagonist mechanism provides a unique platform for studying simultaneous activation of multiple incretin signalling pathways. Laboratory investigations focus on comparative receptor binding kinetics, downstream cAMP and PKA signalling cascades, and the differential contribution of each receptor class to observed metabolic endpoints in cell culture models. Supplied as lyophilised powder. For laboratory research use only — not for human administration or therapeutic application.`,
    category: 'metabolic-signaling',
    sku: 'RET-001',
    price: 57.99,
    stock: 50,
    lowStockThreshold: 10,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 1,
    variants: [
      { id: 'v1', name: '10 mg', sku: 'RET-10MG', stock: 50, price: 57.99 },
      { id: 'v2', name: '20 mg', sku: 'RET-20MG', stock: 30, price: 94.99 },
    ],
    specs: {
      casNumber: '2381089-83-2',
      molecularWeight: 'N/A',
      formula: 'Peptide triple agonist',
      storage: '2-8 degrees C (refrigerated)',
      shelfLife: '24 months',
      solvent: 'Bacteriostatic water',
    },
    research: `Metabolic receptor research - GLP-1/GIP/glucagon triple agonist signalling studies. Laboratory use only.`,
  },

  // ─── Tirzepatide ───────────────────────────────────────────────
  {
    name: 'Tirzepatide',
    slug: 'tirzepatide',
    description: `Tirzepatide is a dual glucose-dependent insulinotropic polypeptide (GIP) and glucagon-like peptide-1 (GLP-1) receptor co-agonist peptide. This dual incretin mimetic is employed in laboratory research to study the comparative pharmacology of GIP and GLP-1 receptor co-activation, investigate downstream intracellular signalling cascades (cAMP/PKA, PI3K/Akt), and characterise metabolic endpoints in cellular and ex-vivo model systems. Researchers utilise tirzepatide to analyse receptor internalisation kinetics, beta-cell signalling responses, and adipocyte lipid metabolism modulation. Supplied as lyophilised powder. For in-vitro research use only — not intended for human administration or clinical application.`,
    category: 'metabolic-signaling',
    sku: 'TIR-001',
    price: 39.99,
    stock: 60,
    lowStockThreshold: 10,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 2,
    variants: [
      { id: 'v1', name: '10 mg', sku: 'TIR-10MG', stock: 60, price: 39.99 },
      { id: 'v2', name: '20 mg', sku: 'TIR-20MG', stock: 40, price: 69.99 },
      { id: 'v3', name: '30 mg', sku: 'TIR-30MG', stock: 30, price: 84.99 },
      { id: 'v4', name: '60 mg', sku: 'TIR-60MG', stock: 20, price: 119.99 },
    ],
    specs: {
      casNumber: '2023788-19-2',
      molecularWeight: '4813.5 g/mol',
      formula: 'C225H348N48O68',
      storage: '2-8 degrees C (refrigerated)',
      shelfLife: '24 months',
      solvent: 'Bacteriostatic water',
    },
    research: `Metabolic signalling research - dual GIP/GLP-1 receptor co-agonist studies. Laboratory use only.`,
  },

  // ─── KPV ───────────────────────────────────────────────────────
  {
    name: 'KPV Tripeptide',
    slug: 'kpv-tripeptide',
    description: `KPV (Lys-Pro-Val) is a C-terminal tripeptide fragment of alpha-melanocyte-stimulating hormone (alpha-MSH). As a melanocortin receptor partial agonist, KPV is used in laboratory research to investigate anti-inflammatory signalling cascades, specifically the NF-kB pathway modulation and downstream cytokine suppression in cell culture models. Studies employ this reagent to examine its interaction with MC1R and MC3R receptors and the resulting inhibition of pro-inflammatory mediators including IL-1beta, TNF-alpha, and IL-6. Supplied as lyophilised powder. For in-vitro research use only — not for human administration or therapeutic application.`,
    category: 'tissue-repair',
    sku: 'KPV-001',
    price: 19.99,
    stock: 70,
    lowStockThreshold: 10,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 3,
    variants: [
      { id: 'v1', name: '10 mg', sku: 'KPV-10MG', stock: 70, price: 19.99 },
    ],
    specs: {
      casNumber: '64577-64-6',
      molecularWeight: '326.40 g/mol',
      formula: 'C15H30N4O4',
      storage: '2-8 degrees C (refrigerated)',
      shelfLife: '24 months',
      solvent: 'Bacteriostatic water or sterile saline',
    },
    research: `Anti-inflammatory signalling research - NF-kB pathway and MC1R/MC3R modulation studies. Laboratory use only.`,
  },

  // ─── MOTS-C ────────────────────────────────────────────────────
  {
    name: 'MOTS-C',
    slug: 'mots-c',
    description: `MOTS-C (Mitochondrial Open Reading Frame of the 12S rRNA-c) is a mitochondria-derived peptide encoded within the mitochondrial 12S rRNA gene. This unique peptide is an important research probe for studying mitochondrial-nuclear communication and metabolic regulation. Laboratory investigations focus on its activation of AMPK pathways, regulation of the folate-methionine cycle, and modulation of cellular glucose uptake and lipid oxidation in skeletal muscle and adipose cell models. Researchers employ MOTS-C to study mitochondrial retrograde signalling and its downstream effects on insulin sensitivity markers and oxidative stress responses. Supplied as lyophilised powder. For in-vitro and preclinical research use only — not for human administration.`,
    category: 'cellular-aging',
    sku: 'MOT-001',
    price: 19.99,
    stock: 40,
    lowStockThreshold: 8,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 4,
    variants: [
      { id: 'v1', name: '10 mg', sku: 'MOT-10MG', stock: 40, price: 19.99 },
    ],
    specs: {
      casNumber: '1627580-64-6',
      molecularWeight: '2174.5 g/mol',
      formula: 'C95H173N33O25S',
      storage: '-20 degrees C (long-term); 2-8 degrees C (short-term)',
      shelfLife: '24 months',
      solvent: 'Bacteriostatic water or sterile saline',
    },
    research: `Mitochondrial-nuclear signalling research - AMPK activation and cellular metabolic regulation studies. Laboratory use only.`,
  },

  // ─── BPC-157 ───────────────────────────────────────────────────
  {
    name: 'BPC-157',
    slug: 'bpc-157',
    description: `BPC-157 (Body Protection Compound-157) is a pentadecapeptide composed of 15 amino acids, derived from a protective protein discovered in human gastric juice. This specific sequence (Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val) is extensively utilised in in-vitro and in-vivo molecular signalling research. The primary focus of current scientific investigation centres on its interaction with the nitric oxide (NO) signalling pathways and the regulation of vascular endothelial growth factor (VEGF) expression. In controlled laboratory environments, BPC-157 has demonstrated significant affinity for accelerating the transcription of growth factor genes involved in the organisation of the extracellular matrix. Researchers utilise this compound to analyse the modulation of fibroblast recruitment and the acceleration of collateralisation processes in ischaemic tissues. ProHealth Peptides provides this reagent at HPLC-tested purity. This compound is strictly for laboratory investigation into myofibroblast differentiation and epithelial cell migration. Not for human administration or therapeutic application.`,
    category: 'tissue-repair',
    sku: 'BPC-001',
    price: 19.99,
    stock: 60,
    lowStockThreshold: 10,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 5,
    variants: [
      { id: 'v1', name: '10 mg', sku: 'BPC-10MG', stock: 60, price: 19.99 },
    ],
    specs: {
      casNumber: '137525-51-0',
      molecularWeight: '1419.56 g/mol',
      formula: 'C62H98N16O22',
      storage: '-20 degrees C (long-term); 2-8 degrees C (short-term)',
      shelfLife: '24 months',
      solvent: 'Bacteriostatic water or sterile saline',
    },
    research: `Tissue repair ligand research - fibroblast recruitment and VEGF signalling studies. Laboratory use only.`,
  },

  // ─── TB-500 ────────────────────────────────────────────────────
  {
    name: 'TB-500 (Thymosin Beta-4)',
    slug: 'tb-500-thymosin-beta-4',
    description: `TB-500, derived from the naturally occurring protein Thymosin Beta-4 (TB4), is an actin-sequestering peptide with established roles in cytoskeletal organisation and cell motility research. TB-500 specifically refers to the 17-amino acid fragment (Ac-LKKTETQ) identified as the primary bioactive sequence responsible for TB4's observed effects on cellular migration and angiogenic signalling. Laboratory models employ TB-500 to study the molecular mechanisms of actin polymerisation regulation, integrin pathway modulation, and endothelial progenitor cell recruitment. The peptide also serves as a tool for investigating SRF (Serum Response Factor) and MRTF signalling cascades that govern smooth muscle and cardiac cell differentiation. ProHealth Peptides provides this compound at HPLC-tested purity, supplied as lyophilised powder. For in-vitro and preclinical research use only — not for human administration or veterinary use.`,
    category: 'tissue-repair',
    sku: 'TB5-001',
    price: 24.99,
    stock: 55,
    lowStockThreshold: 10,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 6,
    variants: [
      { id: 'v1', name: '10 mg', sku: 'TB5-10MG', stock: 55, price: 24.99 },
    ],
    specs: {
      casNumber: '77591-33-4',
      molecularWeight: '4963.5 g/mol',
      formula: 'C212H350N56O78S',
      storage: '-20 degrees C (long-term); 2-8 degrees C (short-term)',
      shelfLife: '24 months',
      solvent: 'Bacteriostatic water or sterile saline',
    },
    research: `Tissue repair research - actin cytoskeleton regulation and angiogenic signalling studies. Laboratory use only.`,
  },

  // ─── PT-141 ────────────────────────────────────────────────────
  {
    name: 'PT-141 (Bremelanotide)',
    slug: 'pt-141-bremelanotide',
    description: `PT-141 (Bremelanotide) is a cyclic heptapeptide analogue of alpha-melanocyte-stimulating hormone (alpha-MSH), engineered as a non-selective melanocortin receptor agonist with particular affinity for MC3R and MC4R subtypes in the central nervous system. This compound provides a valuable research tool for investigating melanocortin receptor-mediated neurochemical signalling, particularly in pathways associated with hypothalamic regulation of autonomic responses. Laboratory research utilises PT-141 to study MC4R agonist effects on dopaminergic neurotransmission, the role of central melanocortin pathways in energy homeostasis signalling, and receptor binding kinetics in neuronal cell models. ProHealth Peptides supplies this compound at HPLC-tested purity, lyophilised and nitrogen-sealed. For in-vitro research use only — not for human administration or therapeutic application.`,
    category: 'neurological',
    sku: 'PT141-001',
    price: 14.99,
    stock: 50,
    lowStockThreshold: 10,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 7,
    variants: [
      { id: 'v1', name: '10 mg', sku: 'PT141-10MG', stock: 50, price: 14.99 },
    ],
    specs: {
      casNumber: '189691-06-3',
      molecularWeight: '1025.2 g/mol',
      formula: 'C50H68N14O10',
      storage: '2-8 degrees C (refrigerated)',
      shelfLife: '24 months',
      solvent: 'Bacteriostatic water',
    },
    research: `Neurological signalling research - MC3R/MC4R receptor agonist and hypothalamic pathway studies. Laboratory use only.`,
  },

  // ─── NAD+ ──────────────────────────────────────────────────────
  {
    name: 'NAD+ (Nicotinamide Adenine Dinucleotide)',
    slug: 'nad-plus',
    description: `NAD+ (Nicotinamide Adenine Dinucleotide) is a critical coenzyme found in all living cells, playing a fundamental role in cellular energy metabolism and redox signalling. As a substrate for sirtuins (SIRT1-7), poly-ADP-ribose polymerases (PARPs), and CD38, NAD+ is an essential research tool for studying the molecular mechanisms of mitochondrial function, DNA repair pathways, and cellular ageing processes. Laboratory investigations employ NAD+ to study flux through the NAD+/NADH redox cycle in metabolic assays, sirtuin-mediated deacetylation of histones and transcription factors (particularly PGC-1alpha and p53), and the downstream regulation of mitochondrial biogenesis. Supplied as lyophilised powder. For in-vitro research use only — not for human administration or therapeutic application.`,
    category: 'cellular-aging',
    sku: 'NAD-001',
    price: 20.0,
    stock: 80,
    lowStockThreshold: 15,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 8,
    variants: [
      { id: 'v1', name: '100 mg', sku: 'NAD-100MG',  stock: 80, price: 20.0 },
      { id: 'v2', name: '250 mg', sku: 'NAD-250MG',  stock: 60, price: 28.0 },
      { id: 'v3', name: '500 mg', sku: 'NAD-500MG',  stock: 40, price: 52.0 },
      { id: 'v4', name: '1000 mg', sku: 'NAD-1000MG', stock: 20, price: 90.0 },
    ],
    specs: {
      casNumber: '53-84-9',
      molecularWeight: '663.43 g/mol',
      formula: 'C21H27N7O14P2',
      storage: '-20 degrees C (long-term); 2-8 degrees C (short-term)',
      shelfLife: '24 months',
      solvent: 'Sterile water (do not use bacteriostatic water)',
    },
    research: `Cellular senescence research - sirtuin activation, NAD+/NADH redox cycle, and mitochondrial biogenesis studies. Laboratory use only.`,
  },

  // ─── GHK-Cu ────────────────────────────────────────────────────
  {
    name: 'GHK-Cu (Copper Peptide)',
    slug: 'ghk-cu-copper-peptide',
    description: `GHK-Cu (Glycyl-L-histidyl-L-lysine copper complex) is a naturally occurring copper-binding tripeptide known for its high binding affinity for copper(II) ions. This biochemical reagent is a focal point in studies involving gene expression modulation and cellular longevity pathways. Scientific literature indicates that GHK-Cu interacts with a significant number of human genes, particularly those involved in the maintenance of cellular homeostasis and collagen type I synthesis. Current research explores the peptide's ability to act as a potent chemoattractant for capillary cells and macrophages, facilitating the study of intercellular communication during cellular senescence. Laboratory analysis focuses on the upregulation of metalloproteinases and their inhibitors, providing insights into extracellular matrix remodelling. The analytical profile shows robust structural stability for in-vitro assays involving fibroblast proliferation and DNA repair mechanism observations. Supplied as lyophilised powder. For research purposes only — not for topical, oral, or injectable use in humans or animals.`,
    category: 'cellular-aging',
    sku: 'GHK-001',
    price: 24.99,
    stock: 45,
    lowStockThreshold: 10,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 9,
    variants: [
      { id: 'v1', name: '50 mg',  sku: 'GHK-50MG',  stock: 45, price: 24.99 },
      { id: 'v2', name: '100 mg', sku: 'GHK-100MG', stock: 25, price: 34.99 },
    ],
    specs: {
      casNumber: '89030-95-5',
      molecularWeight: '340.38 g/mol',
      formula: 'C14H23CuN6O4',
      storage: '2-8 degrees C (refrigerated)',
      shelfLife: '24 months lyophilised',
      solvent: 'Sterile water or saline',
    },
    research: `Cellular senescence research - gene expression modulation, collagen synthesis, and extracellular matrix remodelling studies. Laboratory use only.`,
  },

  // ─── GLOW blend ────────────────────────────────────────────────
  {
    name: 'GLOW Blend',
    slug: 'glow-blend',
    description: `GLOW is a proprietary research blend formulated for studies examining combined peptide interactions on cellular senescence, antioxidant defence pathways, and extracellular matrix maintenance. This combination reagent provides a streamlined research model for investigating synergistic effects of multiple bioactive peptides in a single assay system. Supplied as lyophilised powder at 70 mg total weight. For in-vitro research use only — not for human administration or therapeutic application.`,
    category: 'blends',
    sku: 'GLOW-001',
    price: 56.99,
    stock: 30,
    lowStockThreshold: 5,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 10,
    variants: [
      { id: 'v1', name: '70 mg', sku: 'GLOW-70MG', stock: 30, price: 56.99 },
    ],
    specs: {
      casNumber: 'Blend - see batch data',
      molecularWeight: 'N/A (blend)',
      formula: 'Proprietary peptide blend',
      storage: '2-8 degrees C (refrigerated)',
      shelfLife: '24 months',
      solvent: 'Bacteriostatic water',
    },
    research: `Research blend - combined peptide synergy studies for cellular ageing and antioxidant pathway research. Laboratory use only.`,
  },

  // ─── KLOW blend ────────────────────────────────────────────────
  {
    name: 'KLOW Blend',
    slug: 'klow-blend',
    description: `KLOW is a proprietary research blend formulated for studies examining combined peptide modulation of metabolic signalling, lipolysis regulation, and adipocyte biology. This combination reagent enables multi-target pathway analysis in a single experimental system, reducing assay complexity while maintaining research rigour. Supplied as lyophilised powder at 80 mg total weight. For in-vitro research use only — not for human administration or therapeutic application.`,
    category: 'blends',
    sku: 'KLOW-001',
    price: 63.99,
    stock: 25,
    lowStockThreshold: 5,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 11,
    variants: [
      { id: 'v1', name: '80 mg', sku: 'KLOW-80MG', stock: 25, price: 63.99 },
    ],
    specs: {
      casNumber: 'Blend - see batch data',
      molecularWeight: 'N/A (blend)',
      formula: 'Proprietary peptide blend',
      storage: '2-8 degrees C (refrigerated)',
      shelfLife: '24 months',
      solvent: 'Bacteriostatic water',
    },
    research: `Research blend - combined peptide metabolic signalling and lipolysis pathway studies. Laboratory use only.`,
  },

  // ─── MT-2 (Melanotan II) ───────────────────────────────────────
  {
    name: 'MT-2 (Melanotan II)',
    slug: 'mt-2-melanotan-ii',
    description: `MT-2 (Melanotan II) is a cyclic heptapeptide analogue of alpha-melanocyte-stimulating hormone (alpha-MSH). Its chemical structure (Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-NH2) is engineered for enhanced stability and increased affinity for melanocortin receptors (MC1R, MC3R, MC4R, and MC5R). This synthetic analogue is used in laboratory settings to investigate the biochemical pathways of melanogenesis and the systemic regulation of pigmentation signalling. Scientific research utilising MT-2 aims to understand the receptor-ligand interactions that govern eumelanin production and the cellular response to ultraviolet radiation. Beyond pigmentation studies, laboratory models use this compound to analyse the impact of melanocortin activation on metabolic homeostasis and lipid oxidation rates. The molecule's cyclic structure provides a unique research model for peptide stability and receptor binding kinetics. Supplied as lyophilised powder. For investigative studies only — strictly not for human consumption or aesthetic application.`,
    category: 'melanin',
    sku: 'MT2-001',
    price: 12.99,
    stock: 50,
    lowStockThreshold: 10,
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 12,
    variants: [
      { id: 'v1', name: '10 mg', sku: 'MT2-10MG', stock: 50, price: 12.99 },
    ],
    specs: {
      casNumber: '121062-08-6',
      molecularWeight: '1024.18 g/mol',
      formula: 'C50H69N15O9',
      storage: '-20 degrees C (long-term); 2-8 degrees C (short-term)',
      shelfLife: '24 months lyophilised',
      solvent: 'Bacteriostatic water',
    },
    research: `Photo-protection and melanin research - MC1R/MC3R/MC4R receptor binding and melanogenesis pathway studies. Laboratory use only.`,
  },

  // ─── Bacteriostatic Water ──────────────────────────────────────
  {
    name: 'Bacteriostatic Water',
    slug: 'bacteriostatic-water',
    description: `Bacteriostatic Water (0.9% benzyl alcohol in sterile water for injection) is the standard pharmaceutical-grade solvent employed for the reconstitution of lyophilised peptide research compounds. The 0.9% benzyl alcohol preservative inhibits microbial growth, enabling multiple-use vial access across extended experimental protocols without compromise to solvent sterility. This reagent is supplied as a sterile, non-pyrogenic solution in a sealed vial, manufactured to pharmacopoeial standards. ProHealth Peptides supplies bacteriostatic water as an essential laboratory accessory to support peptide reconstitution workflows in research settings. For laboratory reconstitution use only — not for direct human administration.`,
    category: 'accessories',
    sku: 'BAC-001',
    price: 6.99,
    stock: 150,
    lowStockThreshold: 20,
    purity: 'Sterile, 0.9% benzyl alcohol',
    imageUrl: IMG_VIAL,
    isActive: true,
    visibility: 'active',
    displayOrder: 13,
    variants: [
      { id: 'v1', name: '10 ml', sku: 'BAC-10ML', stock: 150, price: 6.99 },
    ],
    specs: {
      casNumber: 'N/A',
      molecularWeight: 'N/A',
      formula: '0.9% benzyl alcohol in water for injection',
      storage: 'Room temperature (15-25 degrees C)',
      shelfLife: '24 months sealed',
      solvent: 'N/A',
    },
    research: `Laboratory solvent accessory for lyophilised peptide reconstitution. Not for direct administration.`,
  },
];

// ─── Seed function ────────────────────────────────────────────────
export async function seedProducts(): Promise<{
  success: boolean;
  message: string;
  count?: number;
  total?: number;
  error?: any;
}> {
  try {
    const existing = await getDocs(collection(db, PRODUCTS_COL));
    const existingNames = new Set(existing.docs.map((d) => d.data().name as string));

    let successCount = 0;
    const errors: string[] = [];

    for (const product of INITIAL_PRODUCTS) {
      if (existingNames.has(product.name)) {
        successCount++;
        continue;
      }
      try {
        await addDoc(collection(db, PRODUCTS_COL), {
          ...product,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        successCount++;
      } catch (err: any) {
        errors.push(`${product.name}: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      console.warn('Some products failed to seed:', errors);
    }

    return {
      success: true,
      message: errors.length === 0
        ? 'Products seeded successfully'
        : `Seeded with ${errors.length} error(s)`,
      count: successCount,
      total: INITIAL_PRODUCTS.length,
    };
  } catch (error: any) {
    console.error('Seeding failed:', error);
    return {
      success: false,
      message: error.message || 'Seeding failed',
      error,
    };
  }
}

export async function clearAllProducts(): Promise<{ success: boolean; message: string; deleted?: number }> {
  try {
    const snap = await getDocs(collection(db, PRODUCTS_COL));
    for (const d of snap.docs) {
      await deleteDoc(doc(db, PRODUCTS_COL, d.id));
    }
    return { success: true, message: `Cleared ${snap.size} products`, deleted: snap.size };
  } catch (error: any) {
    return { success: false, message: error.message || 'Unknown error' };
  }
}

export async function checkSeedStatus(): Promise<{ exists: boolean; count: number; products: string[] }> {
  try {
    const snap = await getDocs(collection(db, PRODUCTS_COL));
    return {
      exists: snap.size > 0,
      count: snap.size,
      products: snap.docs.map(d => d.data().name || d.id),
    };
  } catch (error: any) {
    return { exists: false, count: 0, products: [] };
  }
}

// ─── Slug migration ───────────────────────────────────────────────
// Adds `slug` field to any Firestore product document that is missing it.
// Safe to run multiple times — skips documents that already have a slug.
export async function migrateAddSlugs(): Promise<{
  success: boolean;
  message: string;
  updated?: number;
  skipped?: number;
  error?: any;
}> {
  try {
    const snap = await getDocs(collection(db, PRODUCTS_COL));
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const d of snap.docs) {
      const data = d.data();
      if (data.slug) {
        skipped++;
        continue;
      }
      const slug = nameToSlug(data.name || '');
      if (!slug) {
        skipped++;
        continue;
      }
      try {
        await updateDoc(doc(db, PRODUCTS_COL, d.id), { slug });
        updated++;
      } catch (err: any) {
        errors.push(`${data.name || d.id}: ${err.message}`);
      }
    }

    return {
      success: errors.length === 0,
      message: errors.length === 0
        ? `Migration complete: ${updated} updated, ${skipped} already had slugs`
        : `Migration finished with ${errors.length} error(s): ${updated} updated, ${skipped} skipped`,
      updated,
      skipped,
    };
  } catch (error: any) {
    return { success: false, message: error.message || 'Migration failed', error };
  }
}
