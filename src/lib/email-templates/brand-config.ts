/**
 * Email brand configuration — single source of truth for all rich HTML
 * campaign templates. Persisted to Firestore at
 * `emailBrandConfig/default` and edited via the /admin/email-branding
 * tab. Loaded server-side (send-marketing route) and client-side
 * (admin live preview) — keep this file framework-free.
 */

export type ButtonStyle = "filled" | "outline";

export interface EmailSocialLinks {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  linkedin?: string;
}

export interface EmailBrandConfig {
  /** Firestore doc id — always "default" for now. */
  id: string;
  logoUrl: string;
  /** Optional tagline shown under the logo. */
  tagline?: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  /** Card / content panel colour. */
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  fontFamily: string;
  buttonStyle: ButtonStyle;
  /** 0 | 8 | 16 */
  buttonRadius: number;
  socialLinks: EmailSocialLinks;
  footerText: string;
  companyAddress: string;
  /** ISO timestamp — set by admin UI. */
  updatedAt?: string;
}

export const DEFAULT_EMAIL_BRAND: EmailBrandConfig = {
  id: "default",
  logoUrl: "https://phlabs.co.uk/logo.png",
  tagline: "Research-Grade Peptides",
  primaryColor: "#10b981",
  secondaryColor: "#0f172a",
  backgroundColor: "#f8fafc",
  surfaceColor: "#ffffff",
  textColor: "#0f172a",
  mutedTextColor: "#64748b",
  fontFamily: "Arial, Helvetica, sans-serif",
  buttonStyle: "filled",
  buttonRadius: 8,
  socialLinks: {},
  footerText:
    "You are receiving this email because you subscribed to updates from PH Labs. For Research Use Only. Not for Human Consumption.",
  companyAddress: "PH Labs, United Kingdom",
};

/** Safe merge — user config wins, defaults fill any gap. */
export function withDefaults(
  cfg: Partial<EmailBrandConfig> | null | undefined,
): EmailBrandConfig {
  const merged: EmailBrandConfig = {
    ...DEFAULT_EMAIL_BRAND,
    ...(cfg ?? {}),
    socialLinks: {
      ...DEFAULT_EMAIL_BRAND.socialLinks,
      ...((cfg?.socialLinks as EmailSocialLinks | undefined) ?? {}),
    },
  };
  return merged;
}

export const FONT_STACKS: Array<{ label: string; value: string }> = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "System UI", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
];
