import * as React from "react";
import type { EmailBrandConfig } from "../brand-config";
import { EmailLayout } from "../components/EmailLayout";
import { EmailHeader } from "../components/EmailHeader";
import { EmailHero } from "../components/EmailHero";
import { EmailTextBlock } from "../components/EmailTextBlock";
import { EmailDivider } from "../components/EmailDivider";
import { EmailFooter } from "../components/EmailFooter";
import { EmailButton } from "../components/EmailButton";
import { Section, Text } from "@react-email/components";

export interface PromoSaleContent {
  headline: string;
  subheadline?: string;
  bodyText: string;
  promoCode?: string;
  urgencyText?: string;
  ctaLabel: string;
  ctaHref: string;
  heroImage?: string;
  preview?: string;
  unsubscribeUrl?: string;
}

interface Props {
  brand: EmailBrandConfig;
  content: PromoSaleContent;
}

export function PromoSaleTemplate({ brand, content }: Props) {
  return (
    <EmailLayout brand={brand} preview={content.preview || content.headline}>
      <EmailHeader brand={brand} />
      <EmailHero
        brand={brand}
        headline={content.headline}
        subheadline={content.subheadline}
        backgroundImage={content.heroImage}
      />

      <EmailTextBlock brand={brand} align="center" fontSize={16}>
        {content.bodyText}
      </EmailTextBlock>

      {content.promoCode ? (
        <Section style={{ padding: "8px 32px 8px", textAlign: "center" }}>
          <div
            style={{
              display: "inline-block",
              padding: "16px 28px",
              border: `2px dashed ${brand.primaryColor}`,
              borderRadius: `${brand.buttonRadius}px`,
              fontFamily: brand.fontFamily,
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "3px",
              color: brand.primaryColor,
              backgroundColor: "#ffffff",
            }}
          >
            {content.promoCode}
          </div>
        </Section>
      ) : null}

      {content.urgencyText ? (
        <Section style={{ padding: "4px 32px 8px", textAlign: "center" }}>
          <Text
            style={{
              margin: 0,
              fontFamily: brand.fontFamily,
              fontSize: "13px",
              fontWeight: 700,
              color: brand.secondaryColor,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            ⏰ {content.urgencyText}
          </Text>
        </Section>
      ) : null}

      <Section style={{ padding: "16px 32px 32px", textAlign: "center" }}>
        <EmailButton brand={brand} href={content.ctaHref}>
          {content.ctaLabel}
        </EmailButton>
      </Section>

      <EmailDivider />
      <EmailFooter brand={brand} unsubscribeUrl={content.unsubscribeUrl} />
    </EmailLayout>
  );
}

export const PROMO_SALE_SAMPLE: PromoSaleContent = {
  headline: "Summer Research Sale",
  subheadline: "Save 20% on selected peptides this week only.",
  bodyText:
    "Restock your lab with premium research-grade peptides. Use the code below at checkout — offer valid until Sunday.",
  promoCode: "RESEARCH20",
  urgencyText: "Ends Sunday at midnight",
  ctaLabel: "Shop the Sale",
  ctaHref: "https://phlabs.co.uk/products",
  preview: "20% off all research peptides — code inside.",
};
