import * as React from "react";
import { Button } from "@react-email/components";
import type { EmailBrandConfig } from "../brand-config";

interface Props {
  brand: EmailBrandConfig;
  href: string;
  children: React.ReactNode;
}

/**
 * Bulletproof CTA. React-Email's Button primitive emits VML fallback
 * markup for Outlook automatically.
 */
export function EmailButton({ brand, href, children }: Props) {
  const filled = brand.buttonStyle === "filled";
  return (
    <Button
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: filled ? brand.primaryColor : "transparent",
        color: filled ? "#ffffff" : brand.primaryColor,
        border: filled ? "none" : `2px solid ${brand.primaryColor}`,
        borderRadius: `${brand.buttonRadius}px`,
        fontFamily: brand.fontFamily,
        fontSize: "16px",
        fontWeight: 700,
        padding: filled ? "14px 32px" : "12px 30px",
        textDecoration: "none",
        textAlign: "center",
      }}
    >
      {children}
    </Button>
  );
}
