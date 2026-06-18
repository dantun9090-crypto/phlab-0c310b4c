/**
 * Curated catalog of trust badges admins can pick from for the Wallid
 * "Pay by Bank" checkout option. Each entry maps to a Lucide icon name
 * (resolved in `WallidTrustElements`) plus a short label and category
 * used by the admin badge search/picker.
 *
 * Add new badges here — they appear in the admin picker automatically.
 */

export type WallidBadgeCategory =
  | 'security'
  | 'compliance'
  | 'banking'
  | 'speed'
  | 'trust'
  | 'privacy';

export interface WallidBadgeDef {
  id: string;
  label: string;
  icon: string; // lucide-react icon name
  category: WallidBadgeCategory;
  keywords?: string[];
}

export const WALLID_BADGE_CATALOG: WallidBadgeDef[] = [
  // Security
  { id: 'secure-open-banking', label: 'Secure Open Banking', icon: 'ShieldCheck', category: 'security', keywords: ['ssl', 'safe'] },
  { id: 'bank-grade-encryption', label: 'Bank-Grade Encryption', icon: 'Lock', category: 'security' },
  { id: '256-bit-ssl', label: '256-bit SSL', icon: 'KeyRound', category: 'security' },
  { id: '3d-secure', label: '3D Secure', icon: 'ShieldAlert', category: 'security' },
  { id: 'fraud-protection', label: 'Fraud Protection', icon: 'ShieldX', category: 'security' },
  { id: 'verified-by-wallid', label: 'Verified by Wallid', icon: 'BadgeCheck', category: 'security' },

  // Compliance
  { id: 'fca-regulated', label: 'FCA Regulated', icon: 'Landmark', category: 'compliance', keywords: ['uk', 'authority'] },
  { id: 'psd2-compliant', label: 'PSD2 Compliant', icon: 'FileCheck2', category: 'compliance' },
  { id: 'gdpr-compliant', label: 'GDPR Compliant', icon: 'FileLock2', category: 'compliance', keywords: ['privacy', 'eu'] },
  { id: 'pci-dss', label: 'PCI DSS Compliant', icon: 'ShieldCheck', category: 'compliance' },
  { id: 'iso-27001', label: 'ISO 27001 Certified', icon: 'Award', category: 'compliance' },
  { id: 'open-banking-uk', label: 'Open Banking UK', icon: 'Building2', category: 'compliance' },

  // Banking
  { id: 'instant-bank-transfer', label: 'Instant Bank Transfer', icon: 'Zap', category: 'banking', keywords: ['fast'] },
  { id: 'pay-from-your-bank', label: 'Pay from Your Bank', icon: 'Banknote', category: 'banking' },
  { id: 'no-card-needed', label: 'No Card Needed', icon: 'CreditCard', category: 'banking' },
  { id: 'no-card-stored', label: 'No Card Details Stored', icon: 'CreditCard', category: 'banking' },
  { id: 'direct-bank-pay', label: 'Direct Bank Payment', icon: 'ArrowRightLeft', category: 'banking' },
  { id: 'supports-all-uk-banks', label: 'All UK Banks Supported', icon: 'Building', category: 'banking' },

  // Speed
  { id: 'instant-confirmation', label: 'Instant Confirmation', icon: 'CheckCircle2', category: 'speed' },
  { id: 'pay-in-seconds', label: 'Pay in Seconds', icon: 'Timer', category: 'speed' },
  { id: 'real-time-settlement', label: 'Real-time Settlement', icon: 'Activity', category: 'speed' },
  { id: 'one-tap-checkout', label: 'One-Tap Checkout', icon: 'MousePointerClick', category: 'speed' },

  // Trust
  { id: 'trusted-by-thousands', label: 'Trusted by Thousands', icon: 'Users', category: 'trust' },
  { id: 'uk-based', label: 'UK Based', icon: 'MapPin', category: 'trust' },
  { id: '24-7-support', label: '24/7 Support', icon: 'Headphones', category: 'trust' },
  { id: 'money-back', label: 'Money-Back Guarantee', icon: 'BadgePoundSterling', category: 'trust' },
  { id: 'secure-checkout', label: 'Secure Checkout', icon: 'ShoppingCart', category: 'trust' },
  { id: 'buyer-protection', label: 'Buyer Protection', icon: 'ShieldCheck', category: 'trust' },

  // Privacy
  { id: 'no-data-sold', label: 'We Never Sell Your Data', icon: 'EyeOff', category: 'privacy' },
  { id: 'anonymous-checkout', label: 'Private Checkout', icon: 'UserX', category: 'privacy' },
  { id: 'no-tracking', label: 'No Payment Tracking', icon: 'Ban', category: 'privacy' },
];

export const DEFAULT_WALLID_BADGE_IDS = [
  'secure-open-banking',
  'fca-regulated',
  'instant-bank-transfer',
  'no-card-needed',
];

export const WALLID_CATEGORY_LABELS: Record<WallidBadgeCategory, string> = {
  security: 'Security',
  compliance: 'Compliance',
  banking: 'Banking',
  speed: 'Speed',
  trust: 'Trust',
  privacy: 'Privacy',
};
