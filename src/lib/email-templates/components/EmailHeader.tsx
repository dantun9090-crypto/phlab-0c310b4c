import * as React from "react";
import { Img, Section, Text } from "@react-email/components";
import type { EmailBrandConfig } from "../brand-config";

interface Props {
  brand: EmailBrandConfig;
}

export function EmailHeader({ brand }: Props) {
  return (
    <Section
      style={{
        padding: "24px 32px",
        textAlign: "center",
        backgroundColor: brand.surfaceColor,
      }}
    >
      {brand.logoUrl ? (
        <Img
          src={brand.logoUrl}
          alt="Logo"
          height={40}
          style={{ margin: "0 auto", display: "block", maxHeight: "40px" }}
        />
      ) : null}
      {brand.tagline ? (
        <Text
          style={{
            margin: "8px 0 0",
            fontSize: "12px",
            color: brand.mutedTextColor,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          {brand.tagline}
        </Text>
      ) : null}
    </Section>
  );
}
