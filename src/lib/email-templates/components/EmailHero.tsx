import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { brandGradient, type EmailBrandConfig } from "../brand-config";
import { EmailButton } from "./EmailButton";

interface Props {
  brand: EmailBrandConfig;
  headline: string;
  subheadline?: string;
  ctaLabel?: string;
  ctaHref?: string;
  backgroundImage?: string;
}

export function EmailHero({
  brand,
  headline,
  subheadline,
  ctaLabel,
  ctaHref,
  backgroundImage,
}: Props) {
  // Priority: per-send override → brand hero image → gradient
  const heroImage = backgroundImage || brand.heroBackgroundImageUrl || "";
  const gradient = brandGradient(brand);
  const bg = heroImage
    ? `${gradient}, url(${heroImage}) center/cover no-repeat`
    : gradient;

  return (
    <Section
      style={{
        background: bg,
        padding: "48px 32px",
        textAlign: "center",
        color: "#ffffff",
      }}
    >
      <Heading
        as="h1"
        style={{
          margin: 0,
          fontFamily: brand.fontFamily,
          fontSize: "30px",
          lineHeight: 1.2,
          color: "#ffffff",
          fontWeight: 800,
        }}
      >
        {headline}
      </Heading>
      {subheadline ? (
        <Text
          style={{
            margin: "12px 0 0",
            fontFamily: brand.fontFamily,
            fontSize: "16px",
            lineHeight: 1.5,
            color: "#ffffff",
            opacity: 0.92,
          }}
        >
          {subheadline}
        </Text>
      ) : null}
      {ctaLabel && ctaHref ? (
        <div style={{ marginTop: "28px" }}>
          <EmailButton brand={brand} href={ctaHref}>
            {ctaLabel}
          </EmailButton>
        </div>
      ) : null}
    </Section>
  );
}
