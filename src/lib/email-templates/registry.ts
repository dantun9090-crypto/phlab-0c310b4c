/**
 * Central registry of rich HTML campaign templates. Both the admin
 * configurator (live preview) and the send-marketing server route read
 * from this map — keep the id strings stable, they are stored on
 * saved campaigns.
 */
import * as React from "react";
import type { EmailBrandConfig } from "./brand-config";
import { PROMO_SALE_SAMPLE, PromoSaleTemplate, type PromoSaleContent } from "./templates/PromoSale";

export type TemplateId = "promo-sale";

export interface TemplateDefinition<TContent> {
  id: TemplateId;
  label: string;
  description: string;
  sample: TContent;
  render: (args: { brand: EmailBrandConfig; content: TContent }) => React.ReactElement;
}

export const PROMO_SALE_TEMPLATE: TemplateDefinition<PromoSaleContent> = {
  id: "promo-sale",
  label: "Promo Sale",
  description: "Hero banner + discount code + urgency + primary CTA.",
  sample: PROMO_SALE_SAMPLE,
  render: ({ brand, content }) => <PromoSaleTemplate brand={brand} content={content} />,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export const EMAIL_TEMPLATES: Record<TemplateId, TemplateDefinition<any>> = {
  "promo-sale": PROMO_SALE_TEMPLATE,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export function getTemplate(id: string): TemplateDefinition<unknown> | null {
  return (EMAIL_TEMPLATES as Record<string, TemplateDefinition<unknown>>)[id] ?? null;
}

export const TEMPLATE_LIST = Object.values(EMAIL_TEMPLATES);
