import * as React from "react";
import { Img, Section, Text } from "@react-email/components";
import { brandGradient, type EmailBrandConfig } from "../brand-config";

interface Props {
  brand: EmailBrandConfig;
}

export function EmailHeader({ brand }: Props) {
  const hasImage = Boolean(brand.headerBackgroundImageUrl);
  const bg = hasImage
    ? `${brandGradient(brand)}, url(${brand.headerBackgroundImageUrl}) center/cover no-repeat`
    : brand.surfaceColor;
  const textOnDark = hasImage;

  return (
    <Section
      style={{
        padding: "24px 32px",
        textAlign: "center",
        background: bg,
        backgroundColor: hasImage ? brand.secondaryColor : brand.surfaceColor,
      }}
    >
      {brand.logoUrl ? (
        <Img
          src={brand.logoUrl}
          alt="Logo"
          height={44}
          style={{ margin: "0 auto", display: "block", maxHeight: "44px" }}
        />
      ) : null}
      {brand.tagline ? (
        <Text
          style={{
            margin: "8px 0 0",
            fontSize: "12px",
            color: textOnDark ? "#ffffff" : brand.mutedTextColor,
            letterSpacing: "1px",
            textTransform: "uppercase",
            opacity: textOnDark ? 0.92 : 1,
          }}
        >
          {brand.tagline}
        </Text>
      ) : null}
    </Section>
  );
}
