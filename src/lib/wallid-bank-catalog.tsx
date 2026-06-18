/**
 * Curated catalog of UK bank "marks" admins can pick from to display
 * under the Wallid Pay-by-Bank checkout option.
 *
 * Each entry renders as a clean brand-coloured monogram tile (no
 * third-party trademark assets — looks professional + avoids logo
 * licensing issues). Add new banks here and they appear in the
 * admin picker automatically.
 */
import type { CSSProperties } from 'react';

export type WallidBankCategory =
  | 'high-street'
  | 'digital'
  | 'building-society'
  | 'business';

export interface WallidBankDef {
  id: string;
  name: string;
  /** Brand colour for the tile background. */
  color: string;
  /** Optional secondary brand colour for accent (gradient). */
  accent?: string;
  /** 1–3 letter monogram shown on the tile. */
  monogram: string;
  /** Text colour for the monogram. Defaults to white. */
  textColor?: string;
  /** White tile with coloured letter instead of coloured tile. */
  invert?: boolean;
  category: WallidBankCategory;
  keywords?: string[];
}

export const WALLID_BANK_CATALOG: WallidBankDef[] = [
  // ── High-street ──
  { id: 'lloyds',        name: 'Lloyds Bank',         color: '#006A4D', monogram: 'L',  category: 'high-street', keywords: ['lloydstsb'] },
  { id: 'barclays',      name: 'Barclays',            color: '#00AEEF', monogram: 'B',  category: 'high-street' },
  { id: 'hsbc',          name: 'HSBC',                color: '#DB0011', monogram: 'H',  category: 'high-street' },
  { id: 'natwest',       name: 'NatWest',             color: '#5A287D', monogram: 'NW', category: 'high-street' },
  { id: 'santander',     name: 'Santander',           color: '#EC0000', monogram: 'S',  category: 'high-street' },
  { id: 'halifax',       name: 'Halifax',             color: '#005EB8', monogram: 'H',  category: 'high-street' },
  { id: 'tsb',           name: 'TSB',                 color: '#1B3F94', monogram: 'TSB',category: 'high-street' },
  { id: 'rbs',           name: 'Royal Bank of Scotland', color: '#5A287D', monogram: 'RBS', category: 'high-street', keywords: ['scotland'] },
  { id: 'bos',           name: 'Bank of Scotland',    color: '#0050A0', monogram: 'BS', category: 'high-street' },
  { id: 'coop',          name: 'The Co-operative Bank', color: '#00B5E2', monogram: 'CO', category: 'high-street', keywords: ['cooperative'] },
  { id: 'firstdirect',   name: 'first direct',        color: '#000000', monogram: 'fd', category: 'high-street' },
  { id: 'metro',         name: 'Metro Bank',          color: '#DC0032', monogram: 'M',  category: 'high-street' },
  { id: 'virginmoney',   name: 'Virgin Money',        color: '#E10A0A', monogram: 'V',  category: 'high-street' },
  { id: 'ulsterbank',    name: 'Ulster Bank',         color: '#0033A0', monogram: 'UB', category: 'high-street' },
  { id: 'cooperative-bank', name: 'Cumberland BS',    color: '#005DA9', monogram: 'CU', category: 'building-society' },

  // ── Building societies ──
  { id: 'nationwide',    name: 'Nationwide',          color: '#15366F', monogram: 'N',  category: 'building-society' },
  { id: 'yorkshire-bs',  name: 'Yorkshire BS',        color: '#003366', monogram: 'Y',  category: 'building-society' },
  { id: 'coventry-bs',   name: 'Coventry BS',         color: '#005EB8', monogram: 'CV', category: 'building-society' },
  { id: 'skipton-bs',    name: 'Skipton BS',          color: '#0072CE', monogram: 'SK', category: 'building-society' },

  // ── Digital / challenger ──
  { id: 'monzo',         name: 'Monzo',               color: '#FF4F5F', accent: '#00D4AA', monogram: 'M', category: 'digital' },
  { id: 'starling',      name: 'Starling Bank',       color: '#7433FF', monogram: 'S',  category: 'digital' },
  { id: 'revolut',       name: 'Revolut',             color: '#000000', monogram: 'R',  category: 'digital' },
  { id: 'chase',         name: 'Chase UK',            color: '#117ACA', monogram: 'C',  category: 'digital' },
  { id: 'wise',          name: 'Wise',                color: '#163300', accent: '#9FE870', monogram: 'W', category: 'digital', keywords: ['transferwise'] },
  { id: 'atom',          name: 'Atom Bank',           color: '#F02D33', monogram: 'A',  category: 'digital' },
  { id: 'kroo',          name: 'Kroo',                color: '#1E1E1E', monogram: 'K',  category: 'digital' },
  { id: 'zopa',          name: 'Zopa',                color: '#00C8A0', monogram: 'Z',  category: 'digital' },

  // ── Business ──
  { id: 'tide',          name: 'Tide',                color: '#1E2329', monogram: 'T',  category: 'business' },
  { id: 'anna',          name: 'ANNA Money',          color: '#000000', monogram: 'A',  category: 'business' },
  { id: 'cashplus',      name: 'Cashplus Bank',       color: '#003C71', monogram: 'C+', category: 'business' },
];

export const DEFAULT_WALLID_BANK_IDS = [
  'lloyds', 'barclays', 'hsbc', 'natwest', 'monzo', 'starling',
];

export const WALLID_BANK_CATEGORY_LABELS: Record<WallidBankCategory, string> = {
  'high-street':       'High-Street',
  'digital':           'Digital',
  'building-society':  'Building Society',
  'business':          'Business',
};

interface BankMarkProps {
  bank: WallidBankDef;
  /** Render size in px (square). Defaults to 60. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a single bank "mark" — a brand-coloured rounded tile with
 * the bank's monogram. Used both on checkout and inside the admin picker.
 */
export function BankMark({ bank, size = 60, className = '', style }: BankMarkProps) {
  const bg = bank.invert
    ? '#ffffff'
    : bank.accent
      ? `linear-gradient(135deg, ${bank.color} 0%, ${bank.accent} 100%)`
      : bank.color;
  const fg = bank.invert ? bank.color : (bank.textColor ?? '#ffffff');
  const fontSize = bank.monogram.length >= 3
    ? Math.round(size * 0.32)
    : bank.monogram.length === 2
      ? Math.round(size * 0.40)
      : Math.round(size * 0.52);

  return (
    <div
      role="img"
      aria-label={bank.name}
      title={bank.name}
      className={`flex items-center justify-center font-black tracking-tight select-none ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        background: bg,
        color: fg,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, sans-serif',
        fontSize,
        lineHeight: 1,
        letterSpacing: '-0.02em',
        boxShadow: bank.invert
          ? `inset 0 0 0 1px ${bank.color}33`
          : '0 1px 2px rgba(0,0,0,0.15)',
        ...style,
      }}
    >
      {bank.monogram}
    </div>
  );
}
