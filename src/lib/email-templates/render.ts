/**
 * Isomorphic render helper — works in-browser (admin live preview) and
 * server-side (send-marketing route). Uses `@react-email/render`, which
 * emits HTML that renders correctly across Outlook, Gmail, Apple Mail,
 * and Yahoo. Also produces a plain-text fallback derived from the same
 * React tree so subscribers on text-only clients see the campaign.
 */
import { render } from "@react-email/render";
import { withDefaults, type EmailBrandConfig } from "./brand-config";
import { getTemplate } from "./registry";

export interface RenderedEmail {
  html: string;
  text: string;
}

export async function renderTemplate(input: {
  templateId: string;
  content: unknown;
  brand?: Partial<EmailBrandConfig> | null;
}): Promise<RenderedEmail> {
  const tpl = getTemplate(input.templateId);
  if (!tpl) throw new Error(`unknown_template:${input.templateId}`);
  const brand = withDefaults(input.brand);
  const element = tpl.render({ brand, content: input.content });
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}
