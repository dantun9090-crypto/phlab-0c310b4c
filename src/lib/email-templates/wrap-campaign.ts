/**
 * Framework-free branded wrapper for marketing campaigns.
 *
 * Both the admin live preview (client) and the send-marketing server
 * route call this to wrap the user-authored body (plain text or HTML
 * fragment) in the branded header + card + footer layout defined by
 * `emailBrandConfig/default`.
 *
 * Table-based, inline-styled HTML — safe in Outlook, Gmail, Apple Mail,
 * and Yahoo. No @react-email dependency so it also works in server
 * routes without pulling React into the Worker bundle.
 */
import { brandGradient, withDefaults, type EmailBrandConfig } from "./brand-config";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasHtml(input: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(input);
}

/** Convert raw text into safe HTML paragraphs (blank line = new <p>). */
function textToHtml(text: string, brand: EmailBrandConfig): string {
  const paras = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return paras
    .map((p) => {
      const inner = esc(p.trim()).replace(/\n/g, "<br>");
      if (!inner) return "";
      return `<p style="margin:0 0 16px;font-family:${brand.fontFamily};font-size:15px;line-height:1.7;color:${brand.textColor};">${inner}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

export interface WrapCampaignInput {
  brand: Partial<EmailBrandConfig> | null | undefined;
  subject: string;
  body: string;
  preheader?: string;
  unsubscribeUrl?: string;
}

export function wrapCampaignHtml(input: WrapCampaignInput): string {
  const brand = withDefaults(input.brand);
  const bodyHtml = hasHtml(input.body) ? input.body : textToHtml(input.body, brand);
  const preheader = input.preheader || input.subject;
  const radius = brand.buttonRadius > 0 ? `${brand.buttonRadius}px` : "0";

  const socials = brand.socialLinks || {};
  const socialLinks = (
    [
      ["Instagram", socials.instagram],
      ["Twitter", socials.twitter],
      ["Facebook", socials.facebook],
      ["LinkedIn", socials.linkedin],
    ] as const
  )
    .filter(([, href]) => Boolean(href))
    .map(
      ([label, href]) =>
        `<a href="${esc(href!)}" style="color:${brand.mutedTextColor};text-decoration:underline;margin:0 6px;font-family:${brand.fontFamily};font-size:12px;">${label}</a>`,
    )
    .join("");

  const unsubscribe = input.unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-family:${brand.fontFamily};"><a href="${esc(input.unsubscribeUrl)}" style="color:${brand.mutedTextColor};text-decoration:underline;font-size:12px;">Unsubscribe</a></p>`
    : "";

  const logo = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.tagline || "Logo")}" height="40" style="display:block;margin:0 auto;max-height:40px;border:0;">`
    : "";

  const tagline = brand.tagline
    ? `<p style="margin:8px 0 0;font-family:${brand.fontFamily};font-size:12px;color:${brand.mutedTextColor};letter-spacing:1px;text-transform:uppercase;">${esc(brand.tagline)}</p>`
    : "";

  const gradient = brandGradient(brand);
  const bodyBg = brand.bodyBackgroundImageUrl
    ? `${brand.backgroundColor} url(${esc(brand.bodyBackgroundImageUrl)}) center top / cover no-repeat`
    : brand.backgroundColor;
  const headerHasImage = Boolean(brand.headerBackgroundImageUrl);
  const headerBg = headerHasImage
    ? `${gradient}, url(${esc(brand.headerBackgroundImageUrl!)}) center/cover no-repeat`
    : brand.surfaceColor;
  const headerText = headerHasImage ? "#ffffff" : brand.mutedTextColor;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${bodyBg};font-family:${brand.fontFamily};color:${brand.textColor};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bodyBg};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${brand.surfaceColor};border-radius:${radius};overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
      <tr><td height="4" style="height:4px;line-height:4px;font-size:4px;background:${gradient};">&nbsp;</td></tr>
      <tr><td style="padding:24px 32px;text-align:center;background:${headerBg};">
        ${logo}
        ${brand.tagline ? `<p style="margin:8px 0 0;font-family:${brand.fontFamily};font-size:12px;color:${headerText};letter-spacing:1px;text-transform:uppercase;">${esc(brand.tagline)}</p>` : ""}
      </td></tr>
      <tr><td style="padding:24px 32px;background:${brand.surfaceColor};">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:24px 32px 32px;background:${brand.surfaceColor};border-top:1px solid #e2e8f0;text-align:center;">
        ${socialLinks ? `<p style="margin:0 0 12px;">${socialLinks}</p>` : ""}
        <p style="margin:0 0 8px;font-family:${brand.fontFamily};font-size:12px;color:${brand.mutedTextColor};line-height:1.5;">${esc(brand.footerText)}</p>
        <p style="margin:0;font-family:${brand.fontFamily};font-size:12px;color:${brand.mutedTextColor};">${esc(brand.companyAddress)}</p>
        ${unsubscribe}
      </td></tr>
      <tr><td height="4" style="height:4px;line-height:4px;font-size:4px;background:${gradient};">&nbsp;</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Plain-text fallback derived from the wrapped body — footer + address included. */
export function wrapCampaignText(input: WrapCampaignInput): string {
  const brand = withDefaults(input.brand);
  const bodyText = hasHtml(input.body)
    ? input.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : input.body.trim();
  const parts = [bodyText, "", "—", brand.footerText, brand.companyAddress];
  if (input.unsubscribeUrl) parts.push("", `Unsubscribe: ${input.unsubscribeUrl}`);
  return parts.join("\n");
}
