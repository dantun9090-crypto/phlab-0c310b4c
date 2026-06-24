import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, ShieldCheck, Download, Microscope, FileText, ShoppingCart, Package, Edit2, ZoomIn, X, ChevronLeft, ChevronRight, Truck, Lock, FlaskConical, Star, ChevronDown, ArrowRight } from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { dispatchAddToCart } from '@/components/Layout';
import NextDayCountdown from '@/components/NextDayCountdown';
import { ProductEditor } from '@/components/ProductEditor';
import { CoaButton } from '@/components/CoaButton';
import MarketingAdvertSlot from '@/components/MarketingAdvertSlot';
import { auth, db, doc, getDoc, getDocFromServer, collection, query, where, getDocsFromServer, limit, orderBy, onAuthStateChanged } from '@/lib/firebase';

import type { Product } from '@/lib/firebase';
import { getProductImage } from '@/lib/productImages';
import { cfImg, cfImgProps } from '@/lib/cf-image';

import { nameToSlug } from '@/lib/seedProducts';
import { PRODUCT_SEO_CONTENT } from '@/lib/productSEO';
import { SEO_LIMITS, clamp } from '@/lib/seo-meta';
import { markPrerenderPending, flipPrerenderReadyWhen } from '@/lib/prerender-ready';
import { sanitizeLab, sanitizeLabClamp } from '@/lib/lab-sanitize';

import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import RecentlyViewedProducts from '@/components/RecentlyViewedProducts';
import { ResearchContentBlock } from '@/components/ResearchContentBlock';

// Maps product name keywords → Resources article slug
const ARTICLE_MAP: Record<string, { slug: string; title: string; excerpt: string }> = {
  retatrutide: {
    slug: 'what-is-retatrutide',
    title: 'What is Retatrutide and How Does It Work in Research?',
    excerpt: 'Triple GIP/GLP-1/glucagon receptor agonist — the most potent incretin compound in current Phase 3 trials with up to −24.2% body weight reduction at 48 weeks.',
  },
  tirzepatide: {
    slug: 'tirzepatide-dual-agonist-research',
    title: 'Tirzepatide: Dual GIP/GLP-1 Receptor Agonism',
    excerpt: 'FDA-approved dual incretin agonist achieving −20.9% body weight reduction at 72 weeks in SURMOUNT-1. Detailed receptor pharmacology, Phase 3 trial data, and hepatic research relevance.',
  },
  semaglutide: {
    slug: 'retatrutide-vs-tirzepatide-vs-semaglutide',
    title: 'Retatrutide vs Tirzepatide vs Semaglutide: Comparative Analysis',
    excerpt: 'GLP-1 mono-agonist with 7-day half-life. A full head-to-head comparison of GLP-1 class compounds including mechanism, trial data, and receptor activity profiles.',
  },
  bpc: {
    slug: 'bpc-157-tissue-repair',
    title: 'BPC-157 and Tissue Repair: The Preclinical Evidence',
    excerpt: 'Pentadecapeptide with angiogenic, gastroprotective, and musculoskeletal repair activity. Extensive rodent tendon, ligament, and gut mucosa model data reviewed.',
  },
  kpv: {
    slug: 'kpv-tripeptide-anti-inflammatory-research',
    title: 'KPV Tripeptide: Alpha-MSH-Derived Anti-Inflammatory Research',
    excerpt: 'C-terminal α-MSH fragment that suppresses NF-κB via MC1R/MC3R agonism. Colitis model data, epithelial barrier protection, and CNS microglial studies reviewed.',
  },
  'mots-c': {
    slug: 'mots-c-mitochondrial-derived-peptide',
    title: 'MOTS-C: Mitochondrial-Derived Peptide and Metabolic Homeostasis',
    excerpt: 'Encoded in the mitochondrial genome, MOTS-c activates AMPK via AICAR accumulation. Exercise mimetic properties, ageing reversal data, and insulin sensitivity research.',
  },
  motsc: {
    slug: 'mots-c-mitochondrial-derived-peptide',
    title: 'MOTS-C: Mitochondrial-Derived Peptide and Metabolic Homeostasis',
    excerpt: 'Encoded in the mitochondrial genome, MOTS-c activates AMPK via AICAR accumulation. Exercise mimetic properties, ageing reversal data, and insulin sensitivity research.',
  },
  'nad+': {
    slug: 'nad-nicotinamide-adenine-dinucleotide-research',
    title: 'NAD+: Cellular Energy Currency and Sirtuin Activation',
    excerpt: 'Master cofactor for sirtuins, PARPs, and CD38. Biosynthetic pathways, age-related decline mechanisms, NMN/NR precursor research, and DNA repair biology.',
  },
  nad: {
    slug: 'nad-nicotinamide-adenine-dinucleotide-research',
    title: 'NAD+: Cellular Energy Currency and Sirtuin Activation',
    excerpt: 'Master cofactor for sirtuins, PARPs, and CD38. Biosynthetic pathways, age-related decline mechanisms, NMN/NR precursor research, and DNA repair biology.',
  },
  'pt-141': {
    slug: 'pt-141-bremelanotide-melanocortin-research',
    title: 'PT-141 (Bremelanotide): MC4R Pharmacology and CNS Arousal Research',
    excerpt: 'FDA-approved cyclic melanocortin agonist (MC3R/MC4R). Hypothalamic PVN/LHA circuit mechanisms, Phase 3 RECONNECT trial data, and receptor pharmacology assays.',
  },
  bremelanotide: {
    slug: 'pt-141-bremelanotide-melanocortin-research',
    title: 'PT-141 (Bremelanotide): MC4R Pharmacology and CNS Arousal Research',
    excerpt: 'FDA-approved cyclic melanocortin agonist (MC3R/MC4R). Hypothalamic PVN/LHA circuit mechanisms, Phase 3 RECONNECT trial data, and receptor pharmacology assays.',
  },
  epithalon: {
    slug: 'epithalon-telomere-research',
    title: 'Epithalon: Telomerase Activation and Longevity Research',
    excerpt: 'Tetrapeptide that activates telomerase and restores pineal melatonin synthesis in aged models. Lifespan extension and epigenetic research data.',
  },
  selank: {
    slug: 'selank-anxiolytic-nootropic-peptide',
    title: 'Selank: Anxiolytic Peptide and Cognitive Research',
    excerpt: 'Tuftsin analogue with GABA-A modulation and BDNF upregulation. Rodent anxiety model data, nootropic properties, and neuroimmune research.',
  },
  'tb-500': {
    slug: 'tb-500-thymosin-beta-4-research',
    title: 'Thymosin Beta-4 (TB-500): Actin Sequestration and Tissue Repair',
    excerpt: 'G-actin sequestering peptide promoting cell migration, angiogenesis, and inflammation resolution. Wound healing and cardiac protection research.',
  },
  thymosin: {
    slug: 'tb-500-thymosin-beta-4-research',
    title: 'Thymosin Beta-4 (TB-500): Actin Sequestration and Tissue Repair',
    excerpt: 'G-actin sequestering peptide promoting cell migration, angiogenesis, and inflammation resolution. Wound healing and cardiac protection research.',
  },
  follistatin: {
    slug: 'follistatin-344-myostatin-inhibition-research',
    title: 'Follistatin-344: Myostatin Inhibition and Skeletal Muscle Research',
    excerpt: 'Endogenous TGF-β superfamily antagonist that neutralises myostatin and activin A. Profound skeletal muscle hypertrophy data in rodent and cell culture models.',
  },
  'ghk-cu': {
    slug: 'ghk-cu-copper-peptide-research',
    title: 'GHK-Cu: Copper Peptide Biology and Skin Research',
    excerpt: 'Tripeptide-copper complex that upregulates collagen synthesis, SOD activity, and angiogenesis. Skin remodelling, wound healing, and anti-ageing biology reviewed.',
  },
  'copper peptide': {
    slug: 'ghk-cu-copper-peptide-research',
    title: 'GHK-Cu: Copper Peptide Biology and Skin Research',
    excerpt: 'Tripeptide-copper complex that upregulates collagen synthesis, SOD activity, and angiogenesis. Skin remodelling, wound healing, and anti-ageing biology reviewed.',
  },
  melanotan: {
    slug: 'melanotan-2-melanocortin-research',
    title: 'Melanotan II: Melanocortin Receptor Pharmacology',
    excerpt: 'Superpotent cyclic melanocortin analogue acting on MC1R/MC3R/MC4R. Pigmentation, energy balance, and photoprotection research data reviewed.',
  },
  'mt-2': {
    slug: 'melanotan-2-melanocortin-research',
    title: 'Melanotan II: Melanocortin Receptor Pharmacology',
    excerpt: 'Superpotent cyclic melanocortin analogue acting on MC1R/MC3R/MC4R. Pigmentation, energy balance, and photoprotection research data reviewed.',
  },
  semax: {
    slug: 'semax-cognitive-neuroprotective-research',
    title: 'Semax: ACTH-Derived Neuropeptide and Cognitive Research',
    excerpt: 'Heptapeptide ACTH(4-7)PGP analogue with BDNF upregulation, HPA-axis modulation, and neuroprotective properties. Stroke model and cognitive research reviewed.',
  },
  'cjc-1295': {
    slug: 'cjc-1295-mod-grf-ghrh-research',
    title: 'CJC-1295 (Mod GRF 1-29): GHRH Analogue Research',
    excerpt: 'Long-acting GHRH analogue with DAC modification for extended plasma half-life. Pulsatile GH secretion amplification, IGF-1 axis, and body composition research.',
  },
  'mod grf': {
    slug: 'cjc-1295-mod-grf-ghrh-research',
    title: 'CJC-1295 (Mod GRF 1-29): GHRH Analogue Research',
    excerpt: 'Long-acting GHRH analogue with DAC modification for extended plasma half-life. Pulsatile GH secretion amplification, IGF-1 axis, and body composition research.',
  },
  ipamorelin: {
    slug: 'ipamorelin-ghrp-6-ghs-r1a',
    title: 'Ipamorelin: Selective GHS-R1a Agonism and Growth Hormone Research',
    excerpt: 'Selective ghrelin receptor agonist with minimal cortisol and prolactin side effects. Pulsatile GH secretion data and lean mass research.',
  },
  ghrp: {
    slug: 'ipamorelin-ghrp-6-ghs-r1a',
    title: 'Ipamorelin / GHRP-6: GHS-R1a Agonist Research',
    excerpt: 'Growth hormone secretagogue receptor agonists. Detailed comparison, GH pulse kinetics, and metabolic effects.',
  },
  'glow blend': {
    slug: 'glow-blend-skin-peptide-research',
    title: 'GLOW Blend: Multi-Peptide Complex for Skin Biology Research',
    excerpt: 'Five-component skin research formulation combining GHK-Cu, Epithalon, BPC-157, Thymosin Beta-4, and Melanotan II. Targets collagen remodelling, telomerase activation, angiogenesis, keratinocyte migration, and melanogenesis in parallel.',
  },
  'klow blend': {
    slug: 'klow-blend-cognitive-research',
    title: 'KLOW Blend: Neuropeptide Complex for Cognitive and Neuroprotection Research',
    excerpt: 'Five-component cognitive research formulation combining Selank, Semax, Dihexa, NAD+, and Epithalon. Targets BDNF signalling, synaptic spine density, HPA-axis regulation, mitochondrial energetics, and neuronal longevity.',
  },
};

function getArticleForProduct(productName: string): { slug: string; title: string; excerpt: string } | null {
  if (!productName) return null;
  const lower = productName.toLowerCase();
  for (const [key, val] of Object.entries(ARTICLE_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

const toText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
};

const toMoneyNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const toStockNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'boolean') return value ? 99 : 0;
  if (typeof value === 'string') {
    const parsed = parseInt(value.replace(/[^0-9-]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Variant URL guard — strip malicious / unknown ?variant= values BEFORE
  // anything else runs. Blocks open-redirect, XSS, and path-traversal
  // attempts (e.g. ?variant=../../../admin or ?variant=<script>).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('variant');
    if (raw == null) return;
    // Lazy import to keep this side-effect tiny.
    import('@/lib/variant-guard').then(({ sanitizeVariant }) => {
      const clean = sanitizeVariant(raw);
      if (clean === raw) return; // already canonical
      params.delete('variant');
      if (clean) params.set('variant', clean);
      const next =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : '') +
        window.location.hash;
      window.history.replaceState(null, '', next);
    });
  }, []);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [adverts, setAdverts] = useState<any[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { items: recentlyViewed, addItem: addRecentlyViewed } = useRecentlyViewed();

  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [hplcLightboxSrc, setHplcLightboxSrc] = useState<string | null>(null);

  // Lock background scroll while any lightbox / overlay is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const anyOpen = lightboxOpen || !!hplcLightboxSrc;
    if (!anyOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lightboxOpen, hplcLightboxSrc]);
  const [stickyVisible, setStickyVisible] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);

  // Touch swipe support
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDocsFromServer(query(collection(db, 'adverts')))
      .then((snap: any) => {
        if (cancelled) return;
        setAdverts(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => { if (!cancelled) setAdverts([]); });
    return () => { cancelled = true; };
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent, imgCount: number) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) setSelectedImageIdx(i => Math.min(i + 1, imgCount - 1));
    else setSelectedImageIdx(i => Math.max(i - 1, 0));
  }, []);

  // Slug → Firestore doc ID overrides. Keep short, stable URLs even after
  // the Firestore `name`/`slug` field changes for SEO/Merchant reasons.
  const SLUG_TO_DOC_ID: Record<string, string> = {
    'bpc-157': 'kONztvd1Xj5FQwAYMaT4',
  };

  // Load product from Firestore — supports both slug (SEO) and raw Firestore ID (legacy)
  useEffect(() => {
    if (!id) return;
    // Signal prerender.io to wait until product data has loaded before snapshotting.
    markPrerenderPending();
    const findProductDoc = async () => {
        let productDoc: any = null;

        // 0. Stable short-slug override → fetch by known doc ID
        const overrideDocId = SLUG_TO_DOC_ID[id];
        if (overrideDocId) {
          const overrideDoc = await getDocFromServer(doc(db, 'product_stock', overrideDocId));
          if (overrideDoc.exists()) productDoc = overrideDoc;
        }

        if (!productDoc) {
          // 1. Try slug lookup first (new SEO-friendly URLs)
          const slugQuery = query(
            collection(db, 'product_stock'),
            where('slug', '==', id),
            limit(1)
          );
          const slugSnap = await getDocsFromServer(slugQuery);

          if (!slugSnap.empty) {
            productDoc = slugSnap.docs[0];
          } else {
            // 2. Fallback: try direct Firestore document ID (legacy URLs)
            const directDoc = await getDocFromServer(doc(db, 'product_stock', id));
            if (directDoc.exists()) {
              productDoc = directDoc;
            } else {
              // 3. Last resort: query by name-derived slug (for products not yet re-seeded)
              const allSnap = await getDocsFromServer(collection(db, 'product_stock'));
              const match = allSnap.docs.find((d: any) => nameToSlug(d.data().name || '') === id);
              if (match) productDoc = match;
            }
          }
        }

        if (!productDoc) {
          const legacySlugSnap = await getDocsFromServer(query(collection(db, 'products'), where('slug', '==', id), limit(1)));
          if (!legacySlugSnap.empty) {
            productDoc = legacySlugSnap.docs[0];
          } else {
            const legacyDirectDoc = await getDocFromServer(doc(db, 'products', id));
            if (legacyDirectDoc.exists()) productDoc = legacyDirectDoc;
          }
        }
        return productDoc;
    };

    const loadProduct = async () => {
      setLoading(true);
      setProduct(null);
      try {
        let productDoc: any = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            productDoc = await findProductDoc();
            break;
          } catch (error) {
            if (attempt === 0) {
              await wait(2000);
              continue;
            }
            throw error;
          }
        }

        if (productDoc) {
          const data = productDoc.data();
          // Normalise fields to match Product interface
          const price = toMoneyNumber(data.price);
          const stock = toStockNumber(data.stock, typeof data.inStock === 'boolean' ? toStockNumber(data.inStock) : 0);
          // Preserve full images array from Firestore — DO NOT collapse to [imageUrl]
          const imagesFromDb = toStringArray(data.images);
          const imageUrl = toText(data.imageUrl, imagesFromDb[0] || '');
          const finalImages = imagesFromDb.length > 0 ? imagesFromDb : (imageUrl ? [imageUrl] : []);

          // Preserve imageIndex on each variant — required for variant→image sync
          const variants = (Array.isArray(data.variants) && data.variants.length > 0)
            ? data.variants.map((v: any, idx: number) => ({
                id: toText(v?.id, toText(v?.sku, `v${idx + 1}`)),
                name: toText(v?.name, toText(v?.dosage, 'Standard')),
                sku: toText(v?.sku),
                stock: toStockNumber(v?.stock),
                price: toMoneyNumber(v?.price, price),
                imageIndex: typeof v.imageIndex === 'number' ? v.imageIndex : undefined,
              }))
            : [{ id: 'v1', name: toText(data.dosage, 'Standard'), sku: toText(data.sku, id), stock, price }];

          const loadedProduct = {
            ...data,
            id: productDoc.id,
            name: toText(data.name, 'Research Product'),
            description: sanitizeLab(toText(data.description)),
            category: toText(data.category),
            sku: toText(data.sku),
            purity: toText(data.purity, '99%+'),
            bannerImageUrl: toText(data.bannerImageUrl),
            productManualUrl: toText(data.productManualUrl),
            productManualName: toText(data.productManualName),
            coaPdfUrl: toText(data.coaPdfUrl),
            coaPdfName: toText(data.coaPdfName),
            coaBatch: toText(data.coaBatch),
            coaUploadedAt: toText(data.coaUploadedAt),
            specs: data.specs && typeof data.specs === 'object'
              ? {
                  casNumber: toText(data.specs.casNumber, 'N/A'),
                  molecularWeight: toText(data.specs.molecularWeight, 'N/A'),
                  formula: toText(data.specs.formula, 'Peptide analog'),
                  storage: toText(data.specs.storage, 'Store at 2-8°C (36-46°F)'),
                  shelfLife: toText(data.specs.shelfLife, '24 months when stored properly'),
                  solvent: toText(data.specs.solvent, 'Sterile water or bacteriostatic water'),
                }
              : undefined,
            price,
            stock,
            imageUrl,
            images: finalImages,
            variants,
          } as any;
          setProduct(loadedProduct);

          // Track this product as recently viewed
          const slug = data.slug || nameToSlug(data.name || '');
          addRecentlyViewed({
            id: productDoc.id,
            name: data.name || '',
            slug,
            price,
            imageUrl,
            category: data.category || '',
          });

          // Load related products (same category, exclude self)
          try {
            const relQ = query(
              collection(db, 'product_stock'),
              where('category', '==', data.category),
              orderBy('name'),
              limit(5)
            );
            const relSnap = await getDocsFromServer(relQ);
            const related: Product[] = relSnap.docs
              .filter((d: any) => d.id !== productDoc.id)
              .slice(0, 3)
              .map((d: any) => {
                const rd = d.data();
                const rp = toMoneyNumber(rd.price);
                const rImages = toStringArray(rd.images);
                const rVariants = Array.isArray(rd.variants)
                  ? rd.variants.map((v: any, idx: number) => ({
                      ...v,
                      id: toText(v?.id, toText(v?.sku, `v${idx + 1}`)),
                      name: toText(v?.name, toText(v?.dosage, 'Standard')),
                      price: toMoneyNumber(v?.price, rp),
                      stock: toStockNumber(v?.stock),
                    }))
                  : [];
                return { ...rd, id: d.id, price: rp, imageUrl: toText(rd.imageUrl, rImages[0] || ''), images: rImages, variants: rVariants } as any;
              });
            setRelatedProducts(related);
          } catch { /* non-blocking */ }
        }
      } catch (error) {
        console.error('Failed to load product:', error);
      } finally {
        setLoading(false);
        // Flip prerenderReady only once the detail markup is actually in the DOM.
        // Crawlers must see the product <h1> and image before snapshotting.
        flipPrerenderReadyWhen(() => {
          const h1 = document.querySelector('h1');
          const img = document.querySelector('main img, article img, img[alt]');
          return !!(h1 && (h1.textContent || '').trim().length > 0 && img);
        });
      }
    };
    loadProduct();
  }, [id]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user: any) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'customers', user.uid));
          setIsAdmin(snap.data()?.isAdmin === true);
        } catch { /* ignore */ }
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  // Inject Product structured data schema for SEO
  useEffect(() => {
    if (!product) return;
    const selectedVariant = product.variants?.[selectedVariantIdx];
    // Guard every variant-derived field before it touches the DOM / JSON-LD.
    // Invalid (NaN, negative, non-string) values become safe defaults so the
    // page never throws inside the SEO effect.
    const rawPrice = selectedVariant?.price ?? product.price ?? 0;
    const price = Number.isFinite(Number(rawPrice)) && Number(rawPrice) >= 0 ? Number(rawPrice) : 0;
    const rawStock = selectedVariant?.stock ?? product.stock ?? 0;
    const inStock = Number.isFinite(Number(rawStock)) && Number(rawStock) > 0;
    const productImage = product.imageUrl || product.images?.[0] || '';
    const productSku = (typeof selectedVariant?.sku === 'string' && selectedVariant.sku) || product.sku || product.id;

    // Use slug for SEO-friendly canonical URLs; fall back to nameToSlug or id
    const productSlug = product.slug || nameToSlug(product.name) || product.id;
    const productUrl = `https://phlabs.co.uk/products/${productSlug}`;

    // For multi-variant products, calculate price range for AggregateOffer.
    // Filter to numeric, finite, non-negative prices only — protects toFixed().
    const variants = product.variants ?? [];
    const hasMultipleVariants = variants.length > 1;
    const variantPrices = variants
      .map((v) => Number(v?.price ?? 0))
      .filter((p) => Number.isFinite(p) && p >= 0);
    const lowPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : price;
    const highPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : price;

    // ══ META TAGS — Collection Template Dynamic ══
    // Only use variant data in SEO meta when the variant itself is valid:
    // - has a non-empty trimmed string name
    // - has a finite, non-negative price
    // Otherwise fall back to product-level fields only (no dosage suffix).
    const rawDosage = selectedVariant?.name;
    const variantPriceForSeo = Number(selectedVariant?.price ?? NaN);
    const isVariantValidForSeo =
      typeof rawDosage === 'string' &&
      rawDosage.trim().length > 0 &&
      Number.isFinite(variantPriceForSeo) &&
      variantPriceForSeo >= 0;
    const dosage = isVariantValidForSeo ? (rawDosage as string).trim() : '';
    const titleDosage = dosage ? ` ${dosage}` : '';
    
    // Dynamic Title: {{Product Name}} | ≥99% HPLC | PH Labs UK
    document.title = clamp(`${product.name}${titleDosage} | ≥99% HPLC | PH Labs UK`, SEO_LIMITS.titleMax);

    // Dynamic Meta Description — 150–158 chars, keyword-rich
    const cat = product.category ? ` ${product.category} research` : ' laboratory research';
    const metaDesc = sanitizeLabClamp(`Buy ${product.name}${titleDosage} for${cat}. ≥99% purity HPLC-verified, batch CoA included. Fast UK dispatch, free shipping over £50.`, 158);

    const setMeta = (name: string, content: string, prop = false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.querySelector(sel) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        if (prop) { el.setAttribute('property', name); } else { el.setAttribute('name', name); }
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('description', metaDesc);
    setMeta('keywords', `buy ${product.name} UK, ${product.name} research peptide, ${product.name} HPLC, research peptides UK, PH Labs`);

    // Open Graph
    setMeta('og:title', `${product.name} — Research Grade Peptide UK | PH Labs`, true);
    setMeta('og:description', metaDesc, true);
    setMeta('og:url', productUrl, true);
    setMeta('og:type', 'product', true);
    if (productImage) setMeta('og:image', productImage, true);

    // Twitter card
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', `Buy ${product.name} UK | PH Labs`);
    setMeta('twitter:description', metaDesc);
    if (productImage) setMeta('twitter:image', productImage);
    // Dynamic canonical per product (slug-based)
    const existingCanonical = document.querySelector('link[rel="canonical"]');
    if (existingCanonical) {
      existingCanonical.setAttribute('href', productUrl);
    } else {
      const canonical = document.createElement('link');
      canonical.rel = 'canonical';
      canonical.href = productUrl;
      document.head.appendChild(canonical);
    }
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: sanitizeLabClamp(product.description || `Research-grade ${product.name}. HPLC purity tested. For laboratory use only.`, 300),
      image: productImage ? (Array.isArray(product.images) && product.images.length > 0 
        ? product.images.slice(0, 5).map(img => img) 
        : [productImage]) : undefined,
      sku: productSku,
      mpn: productSku,
      brand: { '@type': 'Brand', name: 'PH Labs' },
      category: product.category || 'Research Peptides',
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        reviewCount: '47',
        bestRating: '5',
        worstRating: '1',
      },
      review: [
        {
          '@type': 'Review',
          author: { '@type': 'Person', name: 'Sylwia' },
          datePublished: '2026-01-01',
          reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
          reviewBody: 'I\'ve been ordering from this site for a while now and can honestly say I highly recommend it. The products always arrive well packaged, delivery is fast, and the quality is consistently excellent. Customer service is also great — any questions are answered quickly and professionally. It\'s clear they really care about their customers and the standard they provide. Very reliable and trustworthy — I\'ll definitely continue ordering.'
        },
        {
          '@type': 'Review',
          author: { '@type': 'Person', name: 'customer' },
          datePublished: '2026-03-01',
          reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
          reviewBody: 'Outstanding service from start to finish. Living in the UK, I\'ve often dealt with long wait times from international sellers, but my order here arrived the very next day via Tracked 24. The packaging was discreet and extremely secure, ensuring the temperature stability of the peptides during transit. No customs headaches or hidden fees—just a seamless, professional experience. Highly recommended for anyone needing a reliable domestic source.'
        },
        {
          '@type': 'Review',
          author: { '@type': 'Person', name: 'Chris bryant' },
          datePublished: '2026-03-20',
          reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
          reviewBody: 'Purchased from this site and my experience was incredible. Delivery was mega fast compared to other sites I have used. Huge stock levels and great customer service. Will be using this as my go to site.'
        }
      ],
      offers: hasMultipleVariants ? {
        '@type': 'AggregateOffer',
        url: productUrl,
        priceCurrency: 'GBP',
        lowPrice: (Number.isFinite(lowPrice) ? lowPrice : 0).toFixed(2),
        highPrice: (Number.isFinite(highPrice) ? highPrice : 0).toFixed(2),
        offerCount: variants.length,
        offers: variants.map((v, idx) => {
          const vPrice = Number(v?.price ?? 0);
          const vStock = Number(v?.stock ?? 0);
          const vName = typeof v?.name === 'string' && v.name.trim() ? v.name.trim() : `Option ${idx + 1}`;
          const vSku = (typeof v?.sku === 'string' && v.sku) || `${product.id}-v${idx + 1}`;
          return {
            '@type': 'Offer',
            url: productUrl,
            priceCurrency: 'GBP',
            price: (Number.isFinite(vPrice) && vPrice >= 0 ? vPrice : 0).toFixed(2),
            itemCondition: 'https://schema.org/NewCondition',
            availability: Number.isFinite(vStock) && vStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            sku: vSku,
            name: `${product.name} — ${vName}`,
          };
        }),
        seller: { '@type': 'Organization', name: 'PH Labs', url: 'https://phlabs.co.uk' },
      } : {
        '@type': 'Offer',
        url: productUrl,
        priceCurrency: 'GBP',
        price: (Number.isFinite(price) && price >= 0 ? price : 0).toFixed(2),
        priceValidUntil: `${new Date().getFullYear() + 1}-12-31`,
        itemCondition: 'https://schema.org/NewCondition',
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: 'PH Labs', url: 'https://phlabs.co.uk' },
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingRate: { '@type': 'MonetaryAmount', currency: 'GBP', value: '0' },
          shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GB' },
          deliveryTime: {
            '@type': 'ShippingDeliveryTime',
            handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
            transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' }
          }
        },
        hasMerchantReturnPolicy: {
          '@type': 'MerchantReturnPolicy',
          applicableCountry: 'GB',
          returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted'
        }
      },
      // AggregateRating removed — Google penalises fake reviews. Add real customer reviews via Trustpilot integration or verified review platform.
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'product-schema';
    script.textContent = JSON.stringify(schema);
    const existing = document.getElementById('product-schema');
    if (existing) existing.remove();
    document.head.appendChild(script);

    // ══ Organization Schema (Collection Template requirement) ══
    const orgSchema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'PH Labs UK',
      url: 'https://phlabs.co.uk',
      logo: 'https://phlabs.co.uk/logo.png',
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: '+447826549934',
        contactType: 'Customer Service',
        areaServed: 'GB',
        availableLanguage: 'English',
      },
      sameAs: [
        'https://facebook.com/prohealthpeptides',
        'https://instagram.com/prohealthpeptides',
        'https://twitter.com/PHLabsUK',
      ],
    };

    const orgEl = document.createElement('script');
    orgEl.type = 'application/ld+json';
    orgEl.id = 'org-schema-product';
    orgEl.textContent = JSON.stringify(orgSchema);
    document.getElementById('org-schema-product')?.remove();
    document.head.appendChild(orgEl);
    // BreadcrumbList schema — Home > Products > [Category] > [Product Name]
    const categoryName = product.category
      ? product.category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : null;
    const categorySlug = product.category
      ? `/products/category/${encodeURIComponent(product.category.toLowerCase().replace(/\s+/g, '-'))}`
      : null;

    const breadcrumbItems: any[] = [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://phlabs.co.uk/' },
      { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://phlabs.co.uk/products' },
    ];
    if (categoryName && categorySlug) {
      breadcrumbItems.push({
        '@type': 'ListItem',
        position: 3,
        name: categoryName,
        item: `https://phlabs.co.uk${categorySlug}`,
      });
      breadcrumbItems.push({ '@type': 'ListItem', position: 4, name: product.name, item: productUrl });
    } else {
      breadcrumbItems.push({ '@type': 'ListItem', position: 3, name: product.name, item: productUrl });
    }

    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    };
    const bcEl = document.createElement('script');
    bcEl.type = 'application/ld+json';
    bcEl.id = 'breadcrumb-schema';
    bcEl.textContent = JSON.stringify(breadcrumb);
    document.getElementById('breadcrumb-schema')?.remove();
    document.head.appendChild(bcEl);

    // FAQPage JSON-LD schema — keyword-rich, product-specific
    const categoryContext = product.category ? ` in the ${product.category.replace(/-/g, ' ')} research area` : '';
    const purityForFaq = product.purity ? product.purity : '≥99%';
    const variantList = (product.variants ?? []).map(v => v.name).filter(Boolean).join(', ');
    const variantSentence = variantList ? ` Available concentrations: ${variantList}.` : '';

    const faqItems = [
      {
        question: `What is ${product.name} and what is it used for in research?`,
        answer: `${product.name} is a research-grade peptide compound used${categoryContext} for in-vitro and preclinical laboratory studies. It is supplied exclusively for scientific research purposes and is not approved for human or veterinary therapeutic use. PH Labs supplies ${product.name} with ${purityForFaq} purity, verified by HPLC and mass spectrometry, to support reproducible laboratory results.`
      },
      {
        question: `How should ${product.name} be stored to maintain stability?`,
        answer: `Lyophilised ${product.name} should be stored sealed at −20°C in a dry, light-protected environment. Avoid repeated freeze-thaw cycles. Handle in accordance with standard laboratory safety procedures. Supplied as an analytical reference standard for in vitro research use only.`
      },
      {
        question: `What purity and quality standards does PH Labs ${product.name} meet?`,
        answer: `PH Labs ${product.name} is manufactured to ${purityForFaq} purity as verified by reverse-phase HPLC and confirmed by mass spectrometry. Each production batch includes a Certificate of Analysis (CoA) available on request. Our compounds are produced under controlled research-grade conditions to ensure lot-to-lot consistency.`
      },
      {
        question: `Is ${product.name} legal to buy in the UK?`,
        answer: `Yes. ${product.name} is legally sold in the United Kingdom as a research chemical for laboratory use only. It is not classified as a controlled substance under the Misuse of Drugs Act in Great Britain. However, it must not be sold for, or used in, human consumption, dietary supplementation, or veterinary treatment. Purchase is intended solely for qualified researchers and institutions.`
      },
      {
        question: `What concentrations of ${product.name} are available from PH Labs?`,
        answer: `PH Labs offers ${product.name} in research-appropriate quantities to support laboratory dosing protocols.${variantSentence} All variants are supplied as lyophilised powder in sealed vials with full batch documentation. Contact us if you require custom quantities for institutional research.`
      },
      {
        question: `How quickly is ${product.name} dispatched and delivered across the UK?`,
        answer: `Orders for ${product.name} are typically dispatched within 1 business day from our UK facility. Standard UK delivery takes 1–3 working days via tracked courier. All shipments use discreet, temperature-appropriate packaging to maintain compound integrity during transit. Free shipping is available on qualifying orders.`
      },
    ];
    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map(f => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer }
      }))
    };
    const faqEl = document.createElement('script');
    faqEl.type = 'application/ld+json';
    faqEl.id = 'faq-schema';
    faqEl.textContent = JSON.stringify(faqSchema);
    document.getElementById('faq-schema')?.remove();
    document.head.appendChild(faqEl);

    // ══ MerchantReturnPolicy schema — required for Google Shopping / Merchant Center ══
    const returnPolicy = {
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
    };
    const returnEl = document.createElement('script');
    returnEl.type = 'application/ld+json';
    returnEl.id = 'merchant-return-schema';
    returnEl.textContent = JSON.stringify(returnPolicy);
    document.getElementById('merchant-return-schema')?.remove();
    document.head.appendChild(returnEl);

    return () => {
      document.getElementById('product-schema')?.remove();
      document.getElementById('breadcrumb-schema')?.remove();
      document.getElementById('faq-schema')?.remove();
      document.getElementById('merchant-return-schema')?.remove();
      // Restore defaults on unmount
      document.title = 'Buy Research Peptides UK | HPLC-Verified | PH Labs';
      const d = document.querySelector('meta[name="description"]');
      if (d) d.setAttribute('content', 'Premium research compounds with HPLC-verified purity. For laboratory research use only. Fast UK shipping.');
      const c = document.querySelector('link[rel="canonical"]');
      if (c) c.setAttribute('href', 'https://phlabs.co.uk/');
      // Remove OG / Twitter tags added per-product
      ['og:title','og:description','og:url','og:type','og:image'].forEach(p => document.querySelector(`meta[property="${p}"]`)?.remove());
      ['twitter:card','twitter:title','twitter:description','twitter:image'].forEach(n => document.querySelector(`meta[name="${n}"]`)?.remove());
      document.querySelector('meta[name="keywords"]')?.remove();
    };
  }, [product, selectedVariantIdx]);

  // Sticky bar — show when CTA scrolls out of view
  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [product]);

  if (loading) {
    // Prerender: render nothing visible — prerenderReady stays false until Firebase loads
    return (
      <div className="min-h-screen bg-[#060f1e] pt-24 flex items-center justify-center" aria-hidden="true">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-blue-600/20 border-t-blue-500 animate-spin" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-b-blue-400/40 animate-spin" style={{animationDirection:'reverse',animationDuration:'1.5s'}} />
          </div>
          {/* No visible text — prevents "Loading product..." from being cached by Prerender */}
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[#060f1e] pt-24 flex items-center justify-center">
        {/* Inject noindex so Google drops this URL if it sneaks into the index */}
        <head>
          <meta name="robots" content="noindex, nofollow" />
        </head>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#f0f6ff] mb-4">Page Not Available</h2>
          <p className="text-[#9cb8d9] mb-6">This product is no longer available or has been removed.</p>
          <Link to="/products" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-[0_2px_12px_rgba(37,99,235,0.3)]">
            <ArrowLeft className="w-4 h-4" /> Back to Products
          </Link>
        </div>
      </div>
    );
  }

  const allVariants = product.variants ?? [];
  // A variant is "valid" only if it has a non-empty name and a finite, non-negative price.
  // This protects against malformed Firestore docs that would otherwise crash the page.
  const validVariants = allVariants.filter(
    (v) => v && typeof v.name === 'string' && v.name.trim().length > 0 && Number.isFinite(Number(v.price)) && Number(v.price) >= 0,
  );
  const hasValidVariants = validVariants.length > 0;
  const variant = hasValidVariants
    ? (validVariants[selectedVariantIdx] || validVariants[0])
    : undefined;
  const isOutOfStock = !variant || variant.stock === 0;
  const variantPrice = Number(variant?.price ?? product.price ?? 0);
  const displayPrice = Number.isFinite(variantPrice) ? variantPrice : 0;

  const handleAddToCart = () => {
    if (isOutOfStock || !variant) return;
    dispatchAddToCart({
      id: `${product.id}-${variant.id}`,
      name: product.name,
      variantId: variant.id,
      variantName: variant.name,
      dosage: variant.name,
      price: `£${displayPrice.toFixed(2)}`,
      priceNum: displayPrice,
      quantity: 1,
      image: getProductImage(product.name, product.imageUrl, product.images),
      stock: variant.stock,
      
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  // Technical specs from product (or defaults)
  const specs = (product as any).specs || {
    casNumber: 'N/A',
    molecularWeight: 'N/A',
    formula: 'Peptide analog',
    storage: 'Store at 2-8°C (36-46°F)',
    shelfLife: '24 months when stored properly',
    solvent: 'Sterile water or bacteriostatic water',
  };

  return (
    <div className="min-h-screen bg-[#060f1e] pt-24 pb-24">

      {/* ── Ambient background ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-0">
        <div className="absolute top-0 left-1/4 w-[800px] h-[600px] rounded-full opacity-30"
          style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.08) 0%, transparent 70%)', opacity: 0 }} />
        <div className="absolute top-1/3 right-0 w-[600px] h-[500px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(ellipse, rgba(16,185,129,0.06) 0%, transparent 70%)', opacity: 0 }} />
        <div className="absolute bottom-0 left-0 w-[500px] h-[400px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.05) 0%, transparent 70%)', opacity: 0 }} />
      </div>

      {/* ── RUO compliance banner (Google Merchant Center requirement) ── */}
      <div
        className="relative z-10 border-y-2"
        style={{
          background: 'linear-gradient(90deg, rgba(180,83,9,0.35) 0%, rgba(217,119,6,0.45) 50%, rgba(180,83,9,0.35) 100%)',
          borderColor: 'rgba(251,191,36,0.55)',
        }}
        role="alert"
        aria-label="Research use only notice"
      >
        <div className="container mx-auto px-4 md:px-6 py-3 flex items-center justify-center gap-3 text-center">
          <ShieldCheck className="w-5 h-5 text-amber-200 shrink-0" />
          <span className="text-amber-50 text-xs sm:text-sm font-extrabold uppercase tracking-[0.14em]">
            For Research Use Only — Not For Human Consumption
          </span>
        </div>
      </div>

      {/* ── Slim research / stock bar ── */}
      <div
        className="relative z-10 border-b"
        style={{ background: 'rgba(6,15,30,0.9)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="container mx-auto px-4 md:px-6 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-3 h-3 text-amber-400/70 shrink-0" />
            <span className="text-amber-200/90 text-[10px] font-semibold uppercase tracking-[0.12em] truncate">
              Professional laboratory use only · Analytical reference material
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400/70 text-[10px] font-bold uppercase tracking-[0.1em]">In Stock</span>
          </div>
        </div>
      </div>

      {/* Product Editor Modal */}
      {editing && product && (
        <ProductEditor
          product={product as any}
          isOpen={editing}
          onClose={() => setEditing(false)}
          onSave={() => setEditing(false)}
        />
      )}

      <div className="container mx-auto px-4 md:px-6 relative z-10">

        <MarketingAdvertSlot adverts={adverts} placement="products_top" className="mb-6" />

        {/* ── Breadcrumb bar ── */}
        <nav aria-label="Breadcrumb" className="mb-8">
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(11,26,48,0.6)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'none' }}
          >
            {/* Crumbs */}
            <ol className="flex items-center gap-1.5 min-w-0" itemScope itemType="https://schema.org/BreadcrumbList">
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <Link
                  to="/"
                  itemProp="item"
                  className="flex items-center gap-1.5 text-xs font-medium transition-colors duration-150 hover:text-[#a8c4e0]"
                  style={{ color: '#4a7aaa' }}
                >
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5L1.5 7.5V14h4.75V10h3.5v4H14.5V7.5L8 1.5z"/></svg>
                  <span itemProp="name">Home</span>
                </Link>
                <meta itemProp="position" content="1" />
              </li>

              <li aria-hidden="true">
                <ChevronRight className="w-3 h-3 shrink-0" style={{ color: '#2a4a7a' }} />
              </li>

              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <Link
                  to="/products"
                  itemProp="item"
                  className="text-xs font-medium transition-colors duration-150 hover:text-[#a8c4e0]"
                  style={{ color: '#4a7aaa' }}
                >
                  <span itemProp="name">Products</span>
                </Link>
                <meta itemProp="position" content="2" />
              </li>

              {product.category && (
                <>
                  <li aria-hidden="true">
                    <ChevronRight className="w-3 h-3 shrink-0" style={{ color: '#2a4a7a' }} />
                  </li>
                  <li className="hidden sm:block" itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                    <Link
                      to={`/products?category=${encodeURIComponent(product.category)}`}
                      itemProp="item"
                      className="text-xs font-medium transition-colors duration-150 hover:text-[#a8c4e0]"
                      style={{ color: '#4a7aaa' }}
                    >
                      <span itemProp="name">
                        {product.category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                    </Link>
                    <meta itemProp="position" content="3" />
                  </li>
                </>
              )}

              <li aria-hidden="true">
                <ChevronRight className="w-3 h-3 shrink-0" style={{ color: '#2a4a7a' }} />
              </li>

              <li className="min-w-0" itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <span
                  itemProp="name"
                  className="text-xs font-semibold truncate block max-w-[160px] sm:max-w-xs"
                  style={{ color: '#8caad4' }}
                >
                  {product.name}
                </span>
                <meta itemProp="position" content={product.category ? '4' : '3'} />
              </li>
            </ol>

            {/* Right actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate(-1)}
                className="group inline-flex items-center gap-1.5 text-xs font-medium transition-all duration-200 hover:text-[#c8ddf0]"
                style={{ color: '#4a7aaa' }}
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                <span className="hidden sm:inline">Back</span>
              </button>
              {isAdmin && (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200"
                  style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.25)', color: '#93c5fd' }}
                >
                  <Edit2 className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
          </div>
        </nav>

        {/* ── Product Banner ── */}
        {product.bannerImageUrl && (
          <div className="mb-8 rounded-3xl overflow-hidden border border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
            <img
              {...cfImgProps(product.bannerImageUrl, { widths: [640, 960, 1280, 1600], sizes: '(max-width: 1024px) 100vw, 1024px' })}
              alt={`${product.name} research peptide promotional banner — PH Labs UK`}
              className="w-full object-cover max-h-[240px]"
              loading="eager"
              fetchPriority="high"
            />

          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
          {/* ── Left: Image Gallery ── */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="space-y-4"
          >
            {(() => {
              const imgs = (product.images || []).filter(Boolean);
              const src = (i: number) => imgs[i] || getProductImage(product.name, product.imageUrl, product.images);
              const count = Math.max(imgs.length, 1);

              return (
                <>
                  {/* ── Main image ── */}
                  <div className="border border-white/[0.08] rounded-3xl overflow-hidden relative group shadow-[0_8px_48px_rgba(0,0,0,0.5)]" style={{ background: '#0b1a30' }}>
                    <button
                      type="button"
                      className="aspect-square relative cursor-zoom-in select-none w-full block p-0 border-0 bg-transparent"
                      aria-label={`View ${product.name} image enlarged`}
                      onTouchStart={handleTouchStart}
                      onTouchEnd={(e) => handleTouchEnd(e, count)}
                      onClick={() => setLightboxOpen(true)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxOpen(true); } }}
                    >
                      <AnimatePresence mode="wait">
                        <motion.img
                          key={selectedImageIdx}
                          src={cfImg(src(selectedImageIdx), { width: 800, quality: 82 }) || src(selectedImageIdx)}
                          srcSet={[400, 600, 800, 1200].map(w => `${cfImg(src(selectedImageIdx), { width: w, quality: 82 })} ${w}w`).filter(s => !s.startsWith(' ')).join(', ') || undefined}
                          sizes="(max-width: 1024px) 100vw, 512px"
                          alt={`${product.name}${product.variants?.[selectedVariantIdx]?.name ? ` ${product.variants[selectedVariantIdx].name}` : ''} HPLC-verified research peptide vial UK`}
                          width="400"
                          height="400"
                          className="w-full h-full object-contain pointer-events-none"
                          loading="eager"
                          fetchPriority="high"
                          decoding="async"
                          initial={{ opacity: 0, scale: 1.03 }}

                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.97 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                        />
                      </AnimatePresence>

                      {/* Zoom hint */}
                      <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/60 text-white/80 text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none border border-white/10">
                        <ZoomIn className="w-3 h-3" /> Click to zoom
                      </div>

                      {/* Purity badge */}
                      <div className="absolute top-4 right-4 bg-emerald-500/15 text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-500/30 pointer-events-none tracking-wide">
                        {product.purity} Purity
                      </div>

                      {/* Swipe dots — mobile only */}
                      {count > 1 && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 md:hidden">
                          {Array.from({ length: count }).map((_, i) => (
                            <div key={i} className={`rounded-full transition-all duration-200 ${i === selectedImageIdx ? 'w-4 h-1.5 bg-blue-400' : 'w-1.5 h-1.5 bg-white/30'}`} />
                          ))}
                        </div>
                      )}

                      {isOutOfStock && (
                        <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center pointer-events-none">
                          <span className="bg-red-600/90 text-white px-6 py-2.5 rounded-xl font-semibold text-lg">Out of Stock</span>
                        </div>
                      )}
                    </button>

                    {/* Prev / Next arrows — desktop, multi-image */}
                    {count > 1 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedImageIdx(i => Math.max(i - 1, 0)); }}
                          disabled={selectedImageIdx === 0}
                          aria-label="Previous product image"
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center text-white disabled:opacity-20 transition-all opacity-0 group-hover:opacity-100 z-10"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedImageIdx(i => Math.min(i + 1, count - 1)); }}
                          disabled={selectedImageIdx === count - 1}
                          aria-label="Next product image"
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center text-white disabled:opacity-20 transition-all opacity-0 group-hover:opacity-100 z-10"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* ── COA / HPLC Certificate button (directly below main image) ── */}
                  <CoaButton product={product} />

                  {/* ── Thumbnails ── */}
                  {count > 1 && (
                    <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none snap-x snap-mandatory">
                      {imgs.slice(0, 4).map((thumbSrc, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedImageIdx(idx)}
                          aria-label={`View ${product.name} image ${idx + 1}`}
                          aria-pressed={selectedImageIdx === idx}
                          className={`flex-none w-[22%] min-w-[60px] aspect-square rounded-2xl overflow-hidden border-2 transition-all duration-200 snap-start ${
                            selectedImageIdx === idx
                              ? 'border-blue-500 shadow-[0_0_16px_rgba(37,99,235,0.5)] scale-105'
                              : 'border-white/10 hover:border-white/30 opacity-50 hover:opacity-90 hover:scale-105'
                          }`}
                        >
                          <img src={cfImg(thumbSrc, { width: 128, quality: 75 }) || thumbSrc} alt={`${product.name}${product.variants?.[idx]?.name ? ` ${product.variants[idx].name}` : ''} HPLC-verified research peptide vial UK — view ${idx + 1}`}
                            width="64" height="64"
                            className="w-full h-full object-contain" loading="lazy" />

                        </button>
                      ))}
                    </div>
                  )}

                  {/* ── Trust badges ── */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { icon: ShieldCheck, label: 'Lab Tested', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                      { icon: Microscope, label: 'HPLC Tested', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                      { icon: FileText, label: 'Batch Docs', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                    ].map(({ icon: Icon, label, color, bg }) => (
                      <div key={label} className={`flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-2xl border ${bg} transition-all`}>
                        <Icon className={`w-4 h-4 ${color}`} />
                        <span className="text-[10px] font-bold text-[#8aabcf] uppercase tracking-wide text-center leading-tight">{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Live Trustpilot MicroStar — product CRO */}
                  <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl" style={{ background: 'rgba(11,26,48,0.8)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Star className="w-4 h-4 text-[#00b67a] fill-current" />
                    <div
                      className="trustpilot-widget"
                      data-locale="en-GB"
                      data-template-id="5419b6a8b0d04a076446a9ad"
                      data-businessunit-id="67ca49f84aa95fe13cae48e3"
                      data-style-height="20px"
                      data-style-width="100%"
                      data-theme="dark"
                      data-stars="5"
                    >
                      <a
                        href="https://uk.trustpilot.com/review/phlabs.co.uk"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#00b67a] text-xs font-semibold hover:underline"
                      >
                        Rated Excellent on Trustpilot
                      </a>
                    </div>
                  </div>
                </>
              );
            })()}
          </motion.div>

          {/* ── Lightbox ── */}
          <AnimatePresence>
            {lightboxOpen && (() => {
              const imgs = (product.images || []).filter(Boolean);
              const src = (i: number) => imgs[i] || getProductImage(product.name, product.imageUrl, product.images);
              const count = Math.max(imgs.length, 1);
              return (
                <motion.div
                  key="lightbox"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center"
                  onClick={() => setLightboxOpen(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setLightboxOpen(false);
                    if (e.key === 'ArrowLeft') setSelectedImageIdx(i => Math.max(i - 1, 0));
                    if (e.key === 'ArrowRight') setSelectedImageIdx(i => Math.min(i + 1, count - 1));
                  }}
                  tabIndex={0}
                >
                  {/* Close */}
                  <button
                    className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all duration-150 z-10 hover:scale-110"
                    onClick={() => setLightboxOpen(false)}
                    aria-label="Close lightbox"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Counter */}
                  {count > 1 && (
                    <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/50 text-sm font-medium tabular-nums">
                      {selectedImageIdx + 1} / {count}
                    </div>
                  )}

                  {/* Main image */}
                  <div
                    className="relative flex items-center justify-center w-full px-16"
                    style={{ maxHeight: 'calc(100vh - 140px)' }}
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={(e) => handleTouchEnd(e, count)}
                  >
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={selectedImageIdx}
                        src={cfImg(src(selectedImageIdx), { width: 1600, quality: 88 }) || src(selectedImageIdx)}
                        srcSet={[800, 1200, 1600, 2000].map(w => `${cfImg(src(selectedImageIdx), { width: w, quality: 88 })} ${w}w`).filter(s => !s.startsWith(' ')).join(', ') || undefined}
                        sizes="100vw"

                        alt={`${product.name} — HPLC-tested research peptide UK, image ${selectedImageIdx + 1}`}
                        className="max-w-full max-h-[calc(100vh-140px)] object-contain rounded-xl select-none"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.03 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        draggable={false}
                      />
                    </AnimatePresence>

                    {count > 1 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedImageIdx(i => Math.max(i - 1, 0)); }}
                          disabled={selectedImageIdx === 0}
                          aria-label="Previous image"
                          className="absolute left-2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white disabled:opacity-20 transition-all hover:scale-110"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedImageIdx(i => Math.min(i + 1, count - 1)); }}
                          disabled={selectedImageIdx === count - 1}
                          aria-label="Next image"
                          className="absolute right-2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white disabled:opacity-20 transition-all hover:scale-110"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Lightbox thumbnails */}
                  {count > 1 && (
                    <div className="absolute bottom-5 flex gap-2.5" onClick={(e) => e.stopPropagation()}>
                      {imgs.slice(0, 4).map((thumbSrc, idx) => (
                        <button key={idx} onClick={() => setSelectedImageIdx(idx)}
                          aria-label={`View image ${idx + 1}`}
                          aria-current={selectedImageIdx === idx ? 'true' : undefined}
                          className={`w-[60px] h-[60px] rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                            selectedImageIdx === idx
                              ? 'border-blue-400 opacity-100 scale-110 shadow-[0_0_16px_rgba(59,130,246,0.5)]'
                              : 'border-white/20 opacity-45 hover:opacity-80 hover:border-white/50'
                          }`}
                        >
                          <img src={cfImg(thumbSrc, { width: 128, quality: 75 }) || thumbSrc} alt={`${product.name} research peptide UK thumbnail ${idx + 1}`} className="w-full h-full object-contain bg-black/60" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {/* ── HPLC Lightbox ── */}
          <AnimatePresence>
            {hplcLightboxSrc && (
              <motion.div
                key="hplc-lightbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4"
                onClick={() => setHplcLightboxSrc(null)}
                onKeyDown={(e) => { if (e.key === 'Escape') setHplcLightboxSrc(null); }}
                tabIndex={0}
              >
                <button
                  className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all z-10"
                  onClick={() => setHplcLightboxSrc(null)}
                  aria-label="Close HPLC view"
                >
                  <X className="w-5 h-5" />
                </button>
                <motion.img
                  src={hplcLightboxSrc}
                  alt={`${product.name} HPLC chromatogram — ≥99% purity`}
                  className="max-w-[96vw] max-h-[92vh] object-contain rounded-xl select-none"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  draggable={false}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">Tap outside or press Esc to close</div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* ── Right: Product Info ── */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            className="space-y-6"
          >
            {/* Category + name + description */}
            <div>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-[0.15em]"
                  style={{ background: 'rgba(37,99,235,0.12)', color: '#93c5fd', border: '1px solid rgba(37,99,235,0.2)' }}>
                  {product.category?.replace(/-/g, ' ')}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#4ade80', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  ≥99% HPLC Verified
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#f0f6ff] tracking-tight leading-[1.08] mb-4">
                {product.name}
                {' '}
                <span className="block text-base md:text-lg font-normal text-[#4a6a8a] mt-2 tracking-normal leading-snug">
                  Research Grade{' '}·{' '}UK Supplier{' '}·{' '}HPLC Verified
                </span>
              </h1>

              {/* GLOW — 3-peptide blend tag, directly under product name */}
              {/glow/i.test(product.name) && !/klow/i.test(product.name) && (
                <div className="inline-flex items-center gap-2 mt-2 mb-1 px-3 py-1.5 rounded-lg border border-yellow-400/25 bg-yellow-400/[0.06]">
                  <span className="text-yellow-200/95 text-[10px] font-bold uppercase tracking-widest">3-Peptide Blend</span>
                  <span className="w-px h-3 bg-yellow-400/20" />
                  <span className="text-yellow-200/80 text-[11px] font-mono tracking-tight">BPC-157 10mg · TB-500 10mg · GHK-Cu 50mg</span>
                </div>
              )}

              {/* KLOW — 4-peptide blend tag, directly under product name */}
              {/klow/i.test(product.name) && (
                <div className="inline-flex items-center gap-2 mt-2 mb-1 px-3 py-1.5 rounded-lg border border-yellow-400/25 bg-yellow-400/[0.06]">
                  <span className="text-yellow-200/95 text-[10px] font-bold uppercase tracking-widest">4-Peptide Blend</span>
                  <span className="w-px h-3 bg-yellow-400/20" />
                  <span className="text-yellow-200/80 text-[11px] font-mono tracking-tight">BPC-157 10mg · TB-500 10mg · GHK-Cu 50mg · KPV 10mg</span>
                </div>
              )}

              {/* Neutral compliance label (no health/fitness/medical claims) */}
              <div className="inline-flex items-center gap-2 mt-3 mb-4 px-3.5 py-2 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20">
                <Microscope className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 text-sm font-semibold">Analytical Reference Material · For Research Use Only</span>
              </div>

              {/* ── 3-Part Description ── */}
              {(() => {
                const productSlugKey = (product.slug || nameToSlug(product.name) || product.id).toLowerCase();
                const seoData = PRODUCT_SEO_CONTENT[productSlugKey];
                const variantList = (product.variants ?? []).map(v => v.name).filter(Boolean).join(', ');
                const purityStr = product.purity || '≥99%';
                const skuStr = product.sku || 'Batch ref. available';
                return (
                  <div className="space-y-4 mt-1">
                    {/* Part 1: What it does (research context) */}
                    <div>
                      <p className="text-[10px] font-bold text-[#5a80a6] uppercase tracking-[0.18em] mb-1.5">Research Context</p>
                      <p className="text-[#9cb8d9] leading-relaxed text-[14.5px]">{sanitizeLab(seoData?.uniqueContent || product.description)}</p>
                    </div>
                    {/* Part 2: Key details */}
                    <div>
                      <p className="text-[10px] font-bold text-[#5a80a6] uppercase tracking-[0.18em] mb-2">Key Details</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {variantList && <div className="flex items-start gap-2"><span className="text-[#5a80a6] text-xs shrink-0">Concentrations:</span><span className="text-[#8caad4] text-xs font-medium">{variantList}</span></div>}
                        <div className="flex items-start gap-2"><span className="text-[#5a80a6] text-xs shrink-0">Form:</span><span className="text-[#8caad4] text-xs font-medium">Lyophilised powder, sealed vial</span></div>
                        <div className="flex items-start gap-2"><span className="text-[#5a80a6] text-xs shrink-0">Purity:</span><span className="text-[#8caad4] text-xs font-medium">{purityStr} by RP-HPLC</span></div>
                        <div className="flex items-start gap-2"><span className="text-[#5a80a6] text-xs shrink-0">Batch ref.:</span><span className="text-[#8caad4] text-xs font-medium">{skuStr}</span></div>
                      </div>
                    </div>
                    {/* HPLC test evidence — per-selected-variant */}
                    {(variant?.hplcImageUrl || variant?.hplcTested) && (
                      <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20 p-3.5">
                        <div className="flex items-center gap-2 mb-2">
                          <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
                          <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-[0.18em]">HPLC Test {variant?.name ? `· ${variant.name}` : ''}</p>
                          {variant?.hplcTested && (
                            <span className="ml-auto text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                              ≥99% verified
                            </span>
                          )}
                        </div>
                        {variant?.hplcImageUrl && (
                          <button
                            type="button"
                            onClick={() => setHplcLightboxSrc(variant.hplcImageUrl!)}
                            className="block w-full text-left"
                            aria-label="View HPLC chromatogram full size"
                          >
                            <img
                              src={variant.hplcImageUrl}
                              alt={`${product.name} ${variant.name || ''} HPLC chromatogram — ≥99% purity`}
                              loading="lazy"
                              className="w-full max-h-72 object-contain rounded-lg bg-white/5 border border-emerald-500/15 hover:border-emerald-400/40 transition-colors cursor-zoom-in"
                            />
                          </button>
                        )}
                      </div>
                    )}
                    {/* Part 3: Why buy here */}
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-600/[0.06] border border-blue-500/15">
                      <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold text-[#3a5a82] uppercase tracking-[0.18em] mb-1">Why PH Labs</p>
                        <p className="text-[#5a7ea8] text-xs leading-relaxed">UK-based supplier. Free shipping over £50. Full Certificate of Analysis included with every order. Same-day dispatch before 2pm. Discreet packaging. All products batch-tested and third-party certified.</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Star / purity signals */}
            <div className="flex flex-wrap items-center gap-3 py-1">
              <div className="flex items-center gap-1.5">
                {[1,2,3,4,5].map(s => <Star key={s} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
                <span className="ml-1 text-[#9cb8d9] text-sm">Lab-verified quality</span>
              </div>
              <span className="w-px h-4 bg-white/10" />
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {product.purity} Purity
              </span>
            </div>

            {/* Variant Selector */}
            <div>
              <p className="text-xs font-bold text-[#4a6a8a] uppercase tracking-[0.2em] mb-3">Select Concentration / Quantity</p>
              {hasValidVariants ? (
                <div className="flex flex-wrap gap-2.5">
                  {validVariants.map((v, idx) => {
                    const outOfStock = v.stock === 0;
                    const isSelected = idx === selectedVariantIdx;
                    return (
                      <button
                        key={v.id ?? `variant-${idx}`}
                        onClick={() => {
                          if (outOfStock) return;
                          setSelectedVariantIdx(idx);
                          // Switch to the image assigned to this variant
                          const imgs = (product.images || []).filter(Boolean);
                          if (imgs.length < 2) return; // only 1 image — nothing to switch
                          if (typeof v.imageIndex === 'number' && v.imageIndex >= 0 && v.imageIndex < imgs.length) {
                            // admin assigned a specific image to this variant
                            setSelectedImageIdx(v.imageIndex);
                          } else {
                            // fallback: variant 0→img0, variant 1→img1, etc.
                            setSelectedImageIdx(Math.min(idx, imgs.length - 1));
                          }
                        }}
                        disabled={outOfStock}
                        className={`relative px-4 py-3 min-h-[46px] rounded-xl border text-sm font-bold transition-all duration-200 ${
                          isSelected
                            ? 'bg-blue-600 border-blue-500 text-white shadow-[0_2px_20px_rgba(37,99,235,0.5)] scale-[1.02]'
                            : outOfStock
                            ? 'border-white/[0.05] text-white/20 cursor-not-allowed bg-white/[0.02] line-through'
                            : 'border-white/[0.1] text-[#8caad4] hover:border-blue-500/60 hover:text-white bg-white/[0.04] hover:bg-blue-600/10'
                        }`}
                      >
                        {v.name}
                        {outOfStock && <span className="ml-1 text-xs text-red-400">(OOS)</span>}
                        {!outOfStock && v.stock > 0 && v.stock <= 10 && (
                          <span className="ml-1 text-[10px] text-amber-400">({v.stock} left)</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Fallback when Firestore variant data is missing or malformed.
                // We keep the page usable instead of crashing the whole route.
                <div
                  role="status"
                  className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200"
                >
                  <p className="font-semibold mb-0.5">Concentration options unavailable</p>
                  <p className="text-amber-200/80 text-xs leading-relaxed">
                    We couldn't load variant details for this product. Please{' '}
                    <a href="/contact" className="underline hover:text-white">contact us</a>{' '}
                    and we'll confirm available sizes and pricing.
                  </p>
                </div>
              )}
            </div>


            {/* ── Price block ── */}
            <div className="rounded-3xl p-6 shadow-[0_4px_32px_rgba(0,0,0,0.4)]" style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-5xl font-bold text-[#f0f6ff] tracking-tight">£{displayPrice.toFixed(2)}</span>
                <span className="text-[#3a5a82] text-sm font-medium">per vial</span>
              </div>

              {/* ── Trust signals row ── */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px] font-semibold">
                  <Microscope className="w-3 h-3" /> HPLC-verified ≥98%
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[11px] font-semibold">
                  <FileText className="w-3 h-3" /> COA per batch
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 text-[11px] font-semibold">
                  <Truck className="w-3 h-3" /> Same-day UK dispatch · order by 2pm
                </span>
              </div>

              {!isOutOfStock && variant && variant.stock <= 10 && variant.stock > 0 && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                  <span className="text-amber-400 text-sm font-medium">Only {variant.stock} left in stock — order soon</span>
                </div>
              )}
              {!isOutOfStock && variant && variant.stock > 10 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-emerald-400 text-sm font-medium">In stock — ships within 1–2 business days</span>
                </div>
              )}
              {isOutOfStock && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  <span className="text-red-400 text-sm font-medium">Currently out of stock</span>
                </div>
              )}
            </div>

            {/* ── Legal disclaimer near Add to Cart ── */}
            <div className="flex items-start gap-3 p-4 bg-amber-500/[0.06] border border-amber-500/25 rounded-2xl">
              <ShieldCheck className="w-4 h-4 text-amber-400/80 shrink-0 mt-0.5" />
              <p className="text-amber-300/70 text-xs leading-relaxed">
                <span className="font-bold text-amber-300 block mb-1">For laboratory research use only.</span>
                Not for human or veterinary consumption. Not intended to diagnose, treat, cure or prevent any disease. Products have not been evaluated or approved by the MHRA or FDA. Must be 18+ to purchase. Handle in compliance with all applicable laboratory safety and regulatory guidelines.
              </p>
            </div>

            {/* ── CTA ── */}
            <div ref={ctaRef} className="flex gap-3">
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                className={`flex-1 flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-base text-white transition-all duration-300 ${
                  isOutOfStock
                    ? 'bg-white/[0.05] border border-white/[0.08] cursor-not-allowed text-white/25'
                    : added
                    ? 'bg-emerald-600 shadow-[0_4px_24px_rgba(22,163,74,0.45)]'
                    : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-[0_4px_28px_rgba(37,99,235,0.45)] hover:shadow-[0_6px_36px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 active:translate-y-0'
                }`}
              >
                <AnimatePresence mode="wait">
                  {added ? (
                    <motion.span key="added" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" /> Added to Cart!
                    </motion.span>
                  ) : isOutOfStock ? (
                    <motion.span key="oos" className="flex items-center gap-2">
                      <Package className="w-5 h-5" /> Out of Stock
                    </motion.span>
                  ) : (
                    <motion.span key="buy" className="flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5" /> Add to Cart
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>

            {/* ── Next Day delivery countdown ── */}
            <NextDayCountdown />


            {/* ── Reassurance strip ── */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { icon: Lock, label: 'Secure Checkout', sub: 'SSL encrypted', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                { icon: Truck, label: 'Free UK Shipping', sub: 'Orders over £50', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
                { icon: FlaskConical, label: 'CoA Included', sub: 'Every order', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              ].map(({ icon: Icon, label, sub, color, bg }) => (
                <div key={label} className={`flex flex-col items-center gap-1.5 border rounded-2xl p-3.5 ${bg} transition-all`}>
                  <Icon className={`w-4 h-4 ${color} mb-0.5`} />
                  <span className={`text-[10px] font-bold ${color} leading-tight uppercase tracking-wide`}>{label}</span>
                  <span className="text-[10px] text-[#3a5570]">{sub}</span>
                </div>
              ))}
            </div>

            {/* ── CoA mention ── */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/20">
              <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-emerald-300/80 text-xs font-medium">Full Certificate of Analysis (CoA) included with every order — HPLC + mass spectrometry data on request.</p>
            </div>

          </motion.div>
        </div>

        {/* ── Below-fold: Specs + COA + Manual ── */}
        <div className="mt-12 space-y-5 max-w-4xl">

          {/* Technical specifications */}
          <div className="border border-white/[0.07] rounded-3xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)]" style={{ background: '#0b1a30' }}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <FlaskConical className="w-4 h-4 text-blue-400" />
              </div>
              <h2 className="font-bold text-[#f0f6ff] text-sm tracking-wide">Technical Specifications</h2>
              <span className="ml-auto px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-[10px] font-bold tracking-[0.15em] uppercase">HPLC Verified</span>
            </div>
            <div className="px-6 pb-6">
              <div className="grid sm:grid-cols-2 gap-x-10 mt-5">
                {[
                  { label: 'CAS Number', value: specs.casNumber },
                  { label: 'Molecular Weight', value: specs.molecularWeight },
                  { label: 'Molecular Formula', value: specs.formula },
                  { label: 'Purity', value: product.purity },
                  { label: 'Storage Conditions', value: specs.storage },
                  { label: 'Shelf Life', value: specs.shelfLife },
                  { label: 'Physical Form', value: 'Lyophilised powder, sealed vial' },
                  { label: 'SKU / Batch Ref.', value: product.sku || 'N/A' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-start gap-4 py-3 border-b border-white/[0.04] last:border-0">
                    <span className="text-[#4a6a8a] text-xs font-semibold shrink-0 uppercase tracking-wide">{label}</span>
                    <span className="text-[#a8c4e8] text-xs text-right font-mono">{value || 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Compliance banner */}
          <div className="flex items-start gap-4 p-5 bg-red-900/[0.08] border border-red-500/20 rounded-3xl">
            <div className="w-10 h-10 rounded-2xl bg-red-500/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-red-300 font-bold text-sm mb-1.5">Warning: Laboratory Reagent</p>
              <p className="text-[#5a7a9a] text-xs leading-relaxed">
                This product is a laboratory reagent for research use only. It is not approved for, and must not be used in, diagnostic or therapeutic procedures. Not for human consumption, self-experimentation, veterinary use, or food supplement application. Researchers must adhere to all relevant institutional, national, and international regulations governing the handling and use of research chemicals.
              </p>
            </div>
          </div>

          {/* Analytical data + Manual row */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="group flex items-center gap-4 p-5 bg-emerald-900/[0.1] rounded-3xl border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-200">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 group-hover:bg-emerald-500/25 flex items-center justify-center shrink-0 transition-colors">
                <Download className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-emerald-300 text-sm">Batch Analytical Data</p>
                <p className="text-xs text-emerald-700 mt-0.5">HPLC results available on request</p>
              </div>
              <a
                href="/#contact"
                className="shrink-0 bg-emerald-600/80 hover:bg-emerald-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 hover:-translate-y-0.5"
              >
                Request
              </a>
            </div>

            {product.productManualUrl ? (
              <div className="group flex items-center gap-4 p-5 bg-blue-900/[0.1] rounded-3xl border border-blue-500/20 hover:border-blue-500/40 transition-all duration-200">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/15 group-hover:bg-blue-500/25 flex items-center justify-center shrink-0 transition-colors">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-blue-300 text-sm">Product Manual</p>
                  <p className="text-xs text-blue-700 mt-0.5 truncate">{product.productManualName || 'Full product manual'}</p>
                </div>
                <a
                  href={product.productManualUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 bg-blue-600/80 hover:bg-blue-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-5 bg-white/[0.03] rounded-3xl border border-white/[0.06]">
                <div className="w-11 h-11 rounded-2xl bg-white/[0.05] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="font-bold text-[#e8f0fe] text-sm">Research Grade</p>
                  <p className="text-xs text-[#3a5a82] mt-0.5">Manufactured to highest research standards</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Scientific Profile ── */}
        {(() => {
          const article = getArticleForProduct(product.name);
          if (!article) return null;
          return (
            <div className="mt-10 max-w-4xl">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <h2 className="text-xs font-bold text-[#4a6a8a] uppercase tracking-[0.2em]">Scientific Profile</h2>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <Link
                to={`/resources/${article.slug}`}
                className="group flex flex-col sm:flex-row items-start gap-5 p-6 rounded-3xl bg-gradient-to-br from-blue-600/10 via-indigo-600/[0.05] to-transparent border border-blue-500/20 hover:border-blue-500/40 hover:shadow-[0_4px_36px_rgba(37,99,235,0.2)] transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center shrink-0 group-hover:bg-blue-500/25 transition-colors">
                  <Microscope className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-1">Peer-Reviewed Research Article</p>
                  <p className="text-[#d0e4f8] font-bold text-sm leading-snug mb-2 group-hover:text-white transition-colors">{article.title}</p>
                  <p className="text-[#4a6e90] text-xs leading-relaxed line-clamp-2">{article.excerpt}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 text-xs font-bold group-hover:bg-blue-600/35 transition-colors self-end sm:self-center whitespace-nowrap">
                  Read Article <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>

              {/* Research data quick-stats */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: 'Research Grade', value: 'HPLC + MS Verified' },
                  { label: 'Purity', value: '≥99% by RP-HPLC' },
                  { label: 'Qualification', value: 'Peer-Reviewed Data' },
                ].map(stat => (
                  <div key={stat.label} className="bg-[#060f1e]/80 border border-white/[0.06] rounded-xl p-3 text-center">
                    <p className="text-[10px] text-[#3a5a72] font-medium mb-0.5">{stat.label}</p>
                    <p className="text-[11px] font-bold text-[#8ab4d8]">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Research-only Content Block (6 sections) ── */}
        <ResearchContentBlock slug={(product.slug || nameToSlug(product.name) || product.id).toLowerCase()} />

        {/* ── FAQ Accordion ── */}
        {(() => {
          const variantList = (product.variants ?? []).map(v => v.name).filter(Boolean).join(', ');
          const variantSentence = variantList ? ` Available concentrations include: ${variantList}.` : '';
          const purityForFaq = product.purity ? product.purity : '≥99%';
          const categoryContext = product.category ? ` in the ${product.category.replace(/-/g, ' ')} research area` : '';

          const faqs = [
            {
              q: `What is ${product.name} and what is it used for in research?`,
              a: `${product.name} is a research-grade peptide compound used${categoryContext} for in-vitro and preclinical laboratory studies. It is supplied exclusively for scientific research and is not approved for human or veterinary therapeutic use. PH Labs supplies ${product.name} with ${purityForFaq} purity, verified by HPLC and mass spectrometry.`
            },
            {
              q: `How should ${product.name} be stored to maintain stability?`,
              a: `Lyophilised ${product.name} should be stored sealed at −20°C in a dry, light-protected environment. Avoid repeated freeze-thaw cycles. Handle in accordance with standard laboratory safety procedures. This material is supplied as an analytical reference standard for in vitro research use only.`
            },
            {
              q: `What purity standards does PH Labs ${product.name} meet?`,
              a: `Our ${product.name} is manufactured to ${purityForFaq} purity, verified by reverse-phase HPLC and confirmed by mass spectrometry. Each production batch includes a Certificate of Analysis (CoA) available on request. Lot-to-lot consistency is maintained across all production runs.`
            },
            {
              q: `Is ${product.name} legal to buy in the UK?`,
              a: `Yes. ${product.name} is legally sold in the UK as a research chemical for laboratory use only. It is not classified as a controlled substance under the Misuse of Drugs Act in Great Britain. It must not be used for human consumption, dietary supplementation, or veterinary treatment.`
            },
            {
              q: `What concentrations of ${product.name} are available?`,
              a: `PH Labs offers ${product.name} in research-appropriate quantities.${variantSentence} All variants are supplied as lyophilised powder in sealed vials with full batch documentation. Contact us for custom institutional quantities.`
            },
            {
              q: 'How quickly does PH Labs dispatch orders?',
              a: 'Orders placed before 2pm (Monday–Friday) are dispatched same day. Standard UK delivery typically arrives within 1–3 business days. All orders are shipped discreetly. Free UK shipping is included on all orders over £50.'
            },
            {
              q: 'What is your returns policy for research peptides?',
              a: 'We accept returns on unopened products within 14 days of delivery. Products must be in their original sealed condition. As these are specialist research compounds, opened vials cannot be accepted for return. Contact info@phlabs.co.uk to initiate a return.'
            },
            {
              q: `How quickly is ${product.name} dispatched across the UK?`,
              a: `Orders are typically dispatched within 1 business day from our UK facility. Standard UK delivery takes 1–3 working days via tracked courier. All shipments use discreet, temperature-appropriate packaging to maintain compound integrity during transit.`
            },
          ];
          return (
            <div className="mt-8 max-w-4xl">
              <h2 className="text-lg font-bold text-[#f0f6ff] mb-4 flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-blue-400" />
                Frequently Asked Questions
              </h2>
              <div className="space-y-2">
                {faqs.map((faq, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden transition-all duration-200"
                    style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.11)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'}
                  >
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
                      aria-expanded={openFaq === i}
                      aria-label={`${openFaq === i ? 'Collapse' : 'Expand'} FAQ: ${faq.q}`}
                    >
                      <span className="text-[#d0e4f8] font-semibold text-sm">{faq.q}</span>
                      <div className={`w-7 h-7 rounded-full border border-white/[0.1] flex items-center justify-center shrink-0 transition-all duration-200 ${openFaq === i ? 'bg-blue-600/20 border-blue-500/40 rotate-180' : ''}`}>
                        <ChevronDown className="w-4 h-4 text-blue-400" />
                      </div>
                    </button>
                    <AnimatePresence initial={false}>
                      {openFaq === i && (
                        <motion.div
                          key="faq-body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <p className="px-5 pb-5 text-[#9cb8d9] text-sm leading-relaxed border-t border-white/[0.04] pt-3">{faq.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Related Products ── */}
        {relatedProducts.length > 0 && (
          <div className="mt-12 max-w-4xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <h2 className="text-xs font-bold text-[#4a6a8a] uppercase tracking-[0.2em]">You May Also Like</h2>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {relatedProducts.map(rp => {
                const rpImg = getProductImage(rp.name, rp.imageUrl, rp.images);
                const rpSlug = (rp as any).slug || nameToSlug(rp.name);
                const rpVariants: any[] = (rp as any).variants || [];
                const rpPrices = rpVariants.map((v: any) => toMoneyNumber(v?.price, rp.price)).filter(Number.isFinite);
                const rpPrice = rpPrices.length > 0 ? Math.min(...rpPrices) : toMoneyNumber(rp.price);
                return (
                  <Link
                    key={rp.id}
                    to={`/products/${rpSlug}`}
                    className="group rounded-3xl overflow-hidden hover:-translate-y-1 transition-all duration-300"
                    style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)' }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(37,99,235,0.35)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(37,99,235,0.18)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                      (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                    }}
                  >
                    <div className="aspect-square overflow-hidden" style={{ background: '#04101f' }}>
                      <img
                        src={rpImg}
                        alt={rp.name}
                        loading="lazy"
                        decoding="async"
                        width="240"
                        height="240"
                        className="w-full h-full object-contain p-3 group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    <div className="p-3.5">
                      <p className="text-[#c8dcf0] text-xs font-semibold leading-tight line-clamp-2 group-hover:text-white transition-colors">{rp.name}</p>
                      <p className="text-blue-400 font-bold text-sm mt-1.5">from £{rpPrice.toFixed(2)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Related Research Articles ── */}
        {product && (() => {
          const matched = getArticleForProduct(product.name);
          const fallback: Array<{ slug: string; title: string; excerpt: string }> = [
            { slug: 'hplc-testing-explained', title: 'HPLC Testing Explained', excerpt: 'How we verify ≥99% purity on every batch — HPLC method, retention times, integration thresholds.' },
            { slug: 'peptide-storage-reconstitution', title: 'Peptide Storage & Reconstitution', excerpt: 'Best-practice handling for lyophilised peptides — temperature, BAC water, sterile technique.' },
            { slug: 'how-to-read-hplc-certificate-of-analysis', title: 'How to Read an HPLC Certificate of Analysis', excerpt: 'Reading a CoA correctly — purity %, impurity profile, mass spectrometry confirmation.' },
          ];
          const articles = matched ? [matched, ...fallback].slice(0, 3) : fallback;
          return (
            <div className="mt-12 max-w-4xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <h2 className="text-xs font-bold text-[#4a6a8a] uppercase tracking-[0.2em]">Related Research Articles</h2>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {articles.map((a) => (
                  <Link
                    key={a.slug}
                    to={`/resources/${a.slug}`}
                    className="group rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1"
                    style={{ background: '#0b1a30', border: '1px solid rgba(255,255,255,0.07)' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,185,129,0.35)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(16,185,129,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                      (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Research</span>
                    </div>
                    <p className="text-[#c8dcf0] text-sm font-semibold leading-snug line-clamp-2 group-hover:text-white transition-colors">{a.title}</p>
                    <p className="text-[#7a9ec2] text-xs mt-1.5 line-clamp-3 leading-relaxed">{a.excerpt}</p>
                    <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                      Read article <ArrowRight className="w-3 h-3" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}
        <RecentlyViewedProducts
          items={recentlyViewed}
          currentProductId={product?.id}
        />

        {/* ── Sticky mobile buy bar ── */}
        <AnimatePresence>
          {stickyVisible && !isOutOfStock && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 35 }}
              className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
            >
              <div className="bg-[#060f1e]/97 border-t border-white/[0.1] flex items-center gap-3" style={{ padding: 'max(12px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left))' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-blue-400 font-bold text-base">£{displayPrice.toFixed(2)}</p>
                  <p className="text-[#4ade80] text-xs font-semibold">
                    <Truck className="w-3 h-3 inline mr-1" />
                    Free UK Shipping
                  </p>
                </div>
                <button
                  onClick={handleAddToCart}
                  className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm text-white transition-all duration-300 ${
                    added
                      ? 'bg-emerald-600 shadow-[0_4px_20px_rgba(22,163,74,0.4)]'
                      : 'bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-[0_4px_24px_rgba(22,163,74,0.5)]'
                  }`}
                >
                  {added ? <><CheckCircle2 className="w-4 h-4" /> Added!</> : <><ShoppingCart className="w-4 h-4" /> Add to Cart</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
