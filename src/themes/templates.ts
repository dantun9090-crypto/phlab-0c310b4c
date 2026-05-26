/**
 * Theme Template System
 * 30 Professional Design Templates with Unique:
 * - Color schemes
 * - Skeleton structures
 * - Animation styles
 * - Typography
 * - Component layouts
 */

export interface ThemeTemplate {
  id: string;
  name: string;
  description: string;
  category: 'medical' | 'corporate' | 'modern' | 'minimal' | 'vibrant' | 'dark';
  preview: string; // URL to preview image
  
  // Color Palette
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: {
      primary: string;
      secondary: string;
      muted: string;
    };
    border: string;
  };
  
  // Layout & Structure
  skeleton: {
    headerStyle: 'minimal' | 'standard' | 'centered' | 'split' | 'floating';
    heroLayout: 'split' | 'centered' | 'full-width' | 'asymmetric' | 'minimal';
    cardStyle: 'flat' | 'elevated' | 'outlined' | 'glass' | 'gradient';
    footerStyle: 'compact' | 'standard' | 'mega' | 'minimal';
  };
  
  // Animation & Effects
  animations: {
    pageTransition: 'fade' | 'slide' | 'scale' | 'none';
    hoverEffect: 'lift' | 'glow' | 'scale' | 'subtle' | 'none';
    scrollReveal: boolean;
    particleEffects: boolean;
  };
  
  // Typography
  typography: {
    headingFont: string;
    bodyFont: string;
    scale: 'compact' | 'standard' | 'large';
  };
}

// ═══════════════════════════════════════════════════════════
// 30 PROFESSIONAL TEMPLATES
// ═══════════════════════════════════════════════════════════

export const THEME_TEMPLATES: ThemeTemplate[] = [
  // ──────── MEDICAL / PHARMACEUTICAL (10 templates) ────────
  {
    id: 'navy-professional',
    name: 'Navy Professional',
    description: 'Deep navy with clinical precision — current PH Labs theme',
    category: 'medical',
    preview: '/templates/navy-professional.jpg',
    colors: {
      primary: '#2563eb',
      secondary: '#3b82f6',
      accent: '#60a5fa',
      background: '#060f1e',
      surface: '#0b1a30',
      text: {
        primary: '#f0f6ff',
        secondary: '#8caad4',
        muted: '#3a5a82',
      },
      border: 'rgba(255,255,255,0.08)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'split',
      cardStyle: 'elevated',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'lift',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'medical-white',
    name: 'Clinical White',
    description: 'Clean white lab aesthetic with subtle blue accents',
    category: 'medical',
    preview: '/templates/medical-white.jpg',
    colors: {
      primary: '#1e40af',
      secondary: '#3b82f6',
      accent: '#60a5fa',
      background: '#ffffff',
      surface: '#f8fafc',
      text: {
        primary: '#0f172a',
        secondary: '#475569',
        muted: '#94a3b8',
      },
      border: 'rgba(15,23,42,0.1)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'centered',
      cardStyle: 'outlined',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'pharma-green',
    name: 'Pharmaceutical Green',
    description: 'Medical green with trust-building neutrals',
    category: 'medical',
    preview: '/templates/pharma-green.jpg',
    colors: {
      primary: '#059669',
      secondary: '#10b981',
      accent: '#34d399',
      background: '#0a1410',
      surface: '#0f1f18',
      text: {
        primary: '#ecfdf5',
        secondary: '#86efac',
        muted: '#166534',
      },
      border: 'rgba(16,185,129,0.15)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'split',
      cardStyle: 'glass',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'slide',
      hoverEffect: 'glow',
      scrollReveal: true,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'lab-cyan',
    name: 'Laboratory Cyan',
    description: 'Scientific cyan with precision layout',
    category: 'medical',
    preview: '/templates/lab-cyan.jpg',
    colors: {
      primary: '#0891b2',
      secondary: '#06b6d4',
      accent: '#22d3ee',
      background: '#0c1419',
      surface: '#111f28',
      text: {
        primary: '#e0f2fe',
        secondary: '#67e8f9',
        muted: '#155e75',
      },
      border: 'rgba(6,182,212,0.12)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'asymmetric',
      cardStyle: 'flat',
      footerStyle: 'compact',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'lift',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'compact',
    },
  },

  {
    id: 'research-gray',
    name: 'Research Gray',
    description: 'Sophisticated gray palette for serious research',
    category: 'medical',
    preview: '/templates/research-gray.jpg',
    colors: {
      primary: '#475569',
      secondary: '#64748b',
      accent: '#94a3b8',
      background: '#0f172a',
      surface: '#1e293b',
      text: {
        primary: '#f1f5f9',
        secondary: '#cbd5e1',
        muted: '#64748b',
      },
      border: 'rgba(148,163,184,0.1)',
    },
    skeleton: {
      headerStyle: 'centered',
      heroLayout: 'centered',
      cardStyle: 'elevated',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'scale',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'large',
    },
  },

  {
    id: 'biotech-purple',
    name: 'Biotech Purple',
    description: 'Futuristic purple for cutting-edge biotech',
    category: 'medical',
    preview: '/templates/biotech-purple.jpg',
    colors: {
      primary: '#7c3aed',
      secondary: '#8b5cf6',
      accent: '#a78bfa',
      background: '#1a0f2e',
      surface: '#271a3e',
      text: {
        primary: '#f3e8ff',
        secondary: '#c4b5fd',
        muted: '#6d28d9',
      },
      border: 'rgba(139,92,246,0.15)',
    },
    skeleton: {
      headerStyle: 'floating',
      heroLayout: 'full-width',
      cardStyle: 'gradient',
      footerStyle: 'mega',
    },
    animations: {
      pageTransition: 'slide',
      hoverEffect: 'glow',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'clinical-teal',
    name: 'Clinical Teal',
    description: 'Calm teal with medical authority',
    category: 'medical',
    preview: '/templates/clinical-teal.jpg',
    colors: {
      primary: '#0d9488',
      secondary: '#14b8a6',
      accent: '#2dd4bf',
      background: '#0c1614',
      surface: '#132420',
      text: {
        primary: '#ccfbf1',
        secondary: '#5eead4',
        muted: '#115e59',
      },
      border: 'rgba(20,184,166,0.12)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'split',
      cardStyle: 'glass',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'lift',
      scrollReveal: true,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'pharma-blue-light',
    name: 'Pharma Blue Light',
    description: 'Light mode pharmaceutical blue',
    category: 'medical',
    preview: '/templates/pharma-blue-light.jpg',
    colors: {
      primary: '#2563eb',
      secondary: '#3b82f6',
      accent: '#60a5fa',
      background: '#f8fafc',
      surface: '#ffffff',
      text: {
        primary: '#0f172a',
        secondary: '#1e293b',
        muted: '#64748b',
      },
      border: 'rgba(37,99,235,0.15)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'centered',
      cardStyle: 'outlined',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'lab-indigo',
    name: 'Laboratory Indigo',
    description: 'Deep indigo for scientific precision',
    category: 'medical',
    preview: '/templates/lab-indigo.jpg',
    colors: {
      primary: '#4f46e5',
      secondary: '#6366f1',
      accent: '#818cf8',
      background: '#0f0e1a',
      surface: '#1a1828',
      text: {
        primary: '#e0e7ff',
        secondary: '#a5b4fc',
        muted: '#3730a3',
      },
      border: 'rgba(99,102,241,0.12)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'asymmetric',
      cardStyle: 'elevated',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'slide',
      hoverEffect: 'glow',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'medical-mint',
    name: 'Medical Mint',
    description: 'Fresh mint green with clean layouts',
    category: 'medical',
    preview: '/templates/medical-mint.jpg',
    colors: {
      primary: '#10b981',
      secondary: '#34d399',
      accent: '#6ee7b7',
      background: '#f0fdf4',
      surface: '#ffffff',
      text: {
        primary: '#064e3b',
        secondary: '#047857',
        muted: '#6ee7b7',
      },
      border: 'rgba(16,185,129,0.2)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'centered',
      cardStyle: 'flat',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  // ──────── CORPORATE (5 templates) ────────
  {
    id: 'corporate-charcoal',
    name: 'Corporate Charcoal',
    description: 'Professional dark charcoal with gold accents',
    category: 'corporate',
    preview: '/templates/corporate-charcoal.jpg',
    colors: {
      primary: '#d97706',
      secondary: '#f59e0b',
      accent: '#fbbf24',
      background: '#171717',
      surface: '#262626',
      text: {
        primary: '#fafafa',
        secondary: '#d4d4d4',
        muted: '#737373',
      },
      border: 'rgba(217,119,6,0.15)',
    },
    skeleton: {
      headerStyle: 'centered',
      heroLayout: 'split',
      cardStyle: 'elevated',
      footerStyle: 'mega',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'lift',
      scrollReveal: true,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'large',
    },
  },

  {
    id: 'business-blue',
    name: 'Business Blue',
    description: 'Classic corporate blue with trust signals',
    category: 'corporate',
    preview: '/templates/business-blue.jpg',
    colors: {
      primary: '#1e40af',
      secondary: '#3b82f6',
      accent: '#60a5fa',
      background: '#ffffff',
      surface: '#f9fafb',
      text: {
        primary: '#111827',
        secondary: '#374151',
        muted: '#9ca3af',
      },
      border: 'rgba(30,64,175,0.1)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'centered',
      cardStyle: 'outlined',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'executive-navy',
    name: 'Executive Navy',
    description: 'Premium navy with executive polish',
    category: 'corporate',
    preview: '/templates/executive-navy.jpg',
    colors: {
      primary: '#1e3a8a',
      secondary: '#2563eb',
      accent: '#60a5fa',
      background: '#0c1427',
      surface: '#172033',
      text: {
        primary: '#dbeafe',
        secondary: '#93c5fd',
        muted: '#1e40af',
      },
      border: 'rgba(37,99,235,0.15)',
    },
    skeleton: {
      headerStyle: 'floating',
      heroLayout: 'full-width',
      cardStyle: 'glass',
      footerStyle: 'mega',
    },
    animations: {
      pageTransition: 'scale',
      hoverEffect: 'glow',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'large',
    },
  },

  {
    id: 'professional-slate',
    name: 'Professional Slate',
    description: 'Modern slate gray with subtle sophistication',
    category: 'corporate',
    preview: '/templates/professional-slate.jpg',
    colors: {
      primary: '#0f172a',
      secondary: '#334155',
      accent: '#64748b',
      background: '#f8fafc',
      surface: '#ffffff',
      text: {
        primary: '#0f172a',
        secondary: '#475569',
        muted: '#94a3b8',
      },
      border: 'rgba(15,23,42,0.1)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'split',
      cardStyle: 'outlined',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'finance-green',
    name: 'Finance Green',
    description: 'Professional green with financial credibility',
    category: 'corporate',
    preview: '/templates/finance-green.jpg',
    colors: {
      primary: '#065f46',
      secondary: '#059669',
      accent: '#10b981',
      background: '#f0fdf4',
      surface: '#ffffff',
      text: {
        primary: '#064e3b',
        secondary: '#047857',
        muted: '#6ee7b7',
      },
      border: 'rgba(16,185,129,0.15)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'centered',
      cardStyle: 'flat',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'lift',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  // ──────── MODERN (5 templates) ────────
  {
    id: 'neon-dark',
    name: 'Neon Dark',
    description: 'Cyberpunk neon with electric blue accents',
    category: 'modern',
    preview: '/templates/neon-dark.jpg',
    colors: {
      primary: '#0ea5e9',
      secondary: '#06b6d4',
      accent: '#22d3ee',
      background: '#020617',
      surface: '#0c1220',
      text: {
        primary: '#e0f2fe',
        secondary: '#7dd3fc',
        muted: '#0c4a6e',
      },
      border: 'rgba(14,165,233,0.2)',
    },
    skeleton: {
      headerStyle: 'floating',
      heroLayout: 'full-width',
      cardStyle: 'glass',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'slide',
      hoverEffect: 'glow',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'gradient-sunset',
    name: 'Gradient Sunset',
    description: 'Warm gradient from orange to pink',
    category: 'modern',
    preview: '/templates/gradient-sunset.jpg',
    colors: {
      primary: '#f59e0b',
      secondary: '#f97316',
      accent: '#fb923c',
      background: '#1a0f0a',
      surface: '#2a1810',
      text: {
        primary: '#fff7ed',
        secondary: '#fdba74',
        muted: '#9a3412',
      },
      border: 'rgba(251,146,60,0.15)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'asymmetric',
      cardStyle: 'gradient',
      footerStyle: 'compact',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'scale',
      scrollReveal: true,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'large',
    },
  },

  {
    id: 'glass-morphism',
    name: 'Glassmorphism',
    description: 'Frosted glass effects with vibrant colors',
    category: 'modern',
    preview: '/templates/glass-morphism.jpg',
    colors: {
      primary: '#8b5cf6',
      secondary: '#a78bfa',
      accent: '#c4b5fd',
      background: '#0a0514',
      surface: '#1a0f2e',
      text: {
        primary: '#f3e8ff',
        secondary: '#c4b5fd',
        muted: '#6d28d9',
      },
      border: 'rgba(167,139,250,0.2)',
    },
    skeleton: {
      headerStyle: 'floating',
      heroLayout: 'full-width',
      cardStyle: 'glass',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'scale',
      hoverEffect: 'lift',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'brutalist',
    name: 'Brutalist',
    description: 'Bold, raw, geometric brutalist design',
    category: 'modern',
    preview: '/templates/brutalist.jpg',
    colors: {
      primary: '#000000',
      secondary: '#171717',
      accent: '#ef4444',
      background: '#ffffff',
      surface: '#f5f5f5',
      text: {
        primary: '#000000',
        secondary: '#171717',
        muted: '#737373',
      },
      border: 'rgba(0,0,0,1)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'centered',
      cardStyle: 'flat',
      footerStyle: 'compact',
    },
    animations: {
      pageTransition: 'none',
      hoverEffect: 'scale',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'large',
    },
  },

  {
    id: 'pastel-gradient',
    name: 'Pastel Gradient',
    description: 'Soft pastel gradients with modern aesthetics',
    category: 'modern',
    preview: '/templates/pastel-gradient.jpg',
    colors: {
      primary: '#818cf8',
      secondary: '#a5b4fc',
      accent: '#c7d2fe',
      background: '#fefce8',
      surface: '#ffffff',
      text: {
        primary: '#1e1b4b',
        secondary: '#4338ca',
        muted: '#6366f1',
      },
      border: 'rgba(129,140,248,0.2)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'centered',
      cardStyle: 'outlined',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: true,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  // ──────── MINIMAL (5 templates) ────────
  {
    id: 'pure-white',
    name: 'Pure White',
    description: 'Ultra-minimal white with black typography',
    category: 'minimal',
    preview: '/templates/pure-white.jpg',
    colors: {
      primary: '#000000',
      secondary: '#171717',
      accent: '#404040',
      background: '#ffffff',
      surface: '#ffffff',
      text: {
        primary: '#000000',
        secondary: '#404040',
        muted: '#737373',
      },
      border: 'rgba(0,0,0,0.08)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'centered',
      cardStyle: 'flat',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'mono-black',
    name: 'Monochrome Black',
    description: 'Pure black minimalism with white text',
    category: 'minimal',
    preview: '/templates/mono-black.jpg',
    colors: {
      primary: '#ffffff',
      secondary: '#e5e5e5',
      accent: '#a3a3a3',
      background: '#000000',
      surface: '#0a0a0a',
      text: {
        primary: '#ffffff',
        secondary: '#e5e5e5',
        muted: '#737373',
      },
      border: 'rgba(255,255,255,0.1)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'centered',
      cardStyle: 'flat',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'swiss-minimal',
    name: 'Swiss Minimal',
    description: 'Swiss design principles — grid-based minimalism',
    category: 'minimal',
    preview: '/templates/swiss-minimal.jpg',
    colors: {
      primary: '#dc2626',
      secondary: '#ef4444',
      accent: '#f87171',
      background: '#fafafa',
      surface: '#ffffff',
      text: {
        primary: '#0a0a0a',
        secondary: '#262626',
        muted: '#525252',
      },
      border: 'rgba(0,0,0,0.1)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'split',
      cardStyle: 'outlined',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'none',
      hoverEffect: 'none',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'compact',
    },
  },

  {
    id: 'zen-beige',
    name: 'Zen Beige',
    description: 'Calm beige with zen-like simplicity',
    category: 'minimal',
    preview: '/templates/zen-beige.jpg',
    colors: {
      primary: '#78716c',
      secondary: '#a8a29e',
      accent: '#d6d3d1',
      background: '#fafaf9',
      surface: '#ffffff',
      text: {
        primary: '#1c1917',
        secondary: '#44403c',
        muted: '#a8a29e',
      },
      border: 'rgba(120,113,108,0.15)',
    },
    skeleton: {
      headerStyle: 'centered',
      heroLayout: 'centered',
      cardStyle: 'flat',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'nordic-light',
    name: 'Nordic Light',
    description: 'Scandinavian-inspired light minimalism',
    category: 'minimal',
    preview: '/templates/nordic-light.jpg',
    colors: {
      primary: '#0f766e',
      secondary: '#14b8a6',
      accent: '#5eead4',
      background: '#f8fafc',
      surface: '#ffffff',
      text: {
        primary: '#0f172a',
        secondary: '#334155',
        muted: '#94a3b8',
      },
      border: 'rgba(15,118,110,0.1)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'split',
      cardStyle: 'flat',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'subtle',
      scrollReveal: false,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  // ──────── VIBRANT (5 templates) ────────
  {
    id: 'electric-pink',
    name: 'Electric Pink',
    description: 'Bold pink with electric energy',
    category: 'vibrant',
    preview: '/templates/electric-pink.jpg',
    colors: {
      primary: '#ec4899',
      secondary: '#f472b6',
      accent: '#f9a8d4',
      background: '#1a0514',
      surface: '#2a0a1e',
      text: {
        primary: '#fce7f3',
        secondary: '#f9a8d4',
        muted: '#9d174d',
      },
      border: 'rgba(236,72,153,0.2)',
    },
    skeleton: {
      headerStyle: 'floating',
      heroLayout: 'asymmetric',
      cardStyle: 'gradient',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'slide',
      hoverEffect: 'glow',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'large',
    },
  },

  {
    id: 'tropical-lime',
    name: 'Tropical Lime',
    description: 'Fresh lime green with tropical vibes',
    category: 'vibrant',
    preview: '/templates/tropical-lime.jpg',
    colors: {
      primary: '#84cc16',
      secondary: '#a3e635',
      accent: '#bef264',
      background: '#0f1a0a',
      surface: '#1a2814',
      text: {
        primary: '#f7fee7',
        secondary: '#d9f99d',
        muted: '#3f6212',
      },
      border: 'rgba(132,204,22,0.2)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'full-width',
      cardStyle: 'elevated',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'lift',
      scrollReveal: true,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'sunset-orange',
    name: 'Sunset Orange',
    description: 'Vibrant orange with sunset gradients',
    category: 'vibrant',
    preview: '/templates/sunset-orange.jpg',
    colors: {
      primary: '#ea580c',
      secondary: '#f97316',
      accent: '#fb923c',
      background: '#1a0a05',
      surface: '#2a140a',
      text: {
        primary: '#fff7ed',
        secondary: '#fdba74',
        muted: '#9a3412',
      },
      border: 'rgba(249,115,22,0.2)',
    },
    skeleton: {
      headerStyle: 'minimal',
      heroLayout: 'asymmetric',
      cardStyle: 'gradient',
      footerStyle: 'compact',
    },
    animations: {
      pageTransition: 'slide',
      hoverEffect: 'scale',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'ocean-turquoise',
    name: 'Ocean Turquoise',
    description: 'Deep turquoise with ocean depth',
    category: 'vibrant',
    preview: '/templates/ocean-turquoise.jpg',
    colors: {
      primary: '#06b6d4',
      secondary: '#22d3ee',
      accent: '#67e8f9',
      background: '#041419',
      surface: '#0a1f28',
      text: {
        primary: '#cffafe',
        secondary: '#67e8f9',
        muted: '#155e75',
      },
      border: 'rgba(6,182,212,0.2)',
    },
    skeleton: {
      headerStyle: 'floating',
      heroLayout: 'full-width',
      cardStyle: 'glass',
      footerStyle: 'minimal',
    },
    animations: {
      pageTransition: 'fade',
      hoverEffect: 'glow',
      scrollReveal: true,
      particleEffects: true,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },

  {
    id: 'magenta-pop',
    name: 'Magenta Pop',
    description: 'Bold magenta with high contrast',
    category: 'vibrant',
    preview: '/templates/magenta-pop.jpg',
    colors: {
      primary: '#c026d3',
      secondary: '#d946ef',
      accent: '#e879f9',
      background: '#140514',
      surface: '#1f0a1e',
      text: {
        primary: '#fae8ff',
        secondary: '#f0abfc',
        muted: '#86198f',
      },
      border: 'rgba(192,38,211,0.2)',
    },
    skeleton: {
      headerStyle: 'standard',
      heroLayout: 'split',
      cardStyle: 'elevated',
      footerStyle: 'standard',
    },
    animations: {
      pageTransition: 'slide',
      hoverEffect: 'lift',
      scrollReveal: true,
      particleEffects: false,
    },
    typography: {
      headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      scale: 'standard',
    },
  },
];

// Helper function to get template by ID
export function getTemplateById(id: string): ThemeTemplate | undefined {
  return THEME_TEMPLATES.find(t => t.id === id);
}

// Helper function to get templates by category
export function getTemplatesByCategory(category: ThemeTemplate['category']): ThemeTemplate[] {
  return THEME_TEMPLATES.filter(t => t.category === category);
}

// Current active template ID (stored in localStorage or Firestore)
export const DEFAULT_TEMPLATE_ID = 'navy-professional';
