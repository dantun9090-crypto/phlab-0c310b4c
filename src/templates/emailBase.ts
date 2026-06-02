/**
 * Shared design tokens & layout helpers for all PH Labs emails.
 * Gmail Android forced dark mode safe: bgcolor attrs + data-ogsc CSS selectors.
 */

export const EMAIL_COLORS = {
  bg: '#04101f',
  bgCard: '#0b1a30',
  bgCardDark: '#071525',
  border: 'rgba(59,130,246,0.15)',
  borderStrong: 'rgba(59,130,246,0.25)',
  accent: '#3b82f6',
  accentDark: '#1d4ed8',
  accentLight: '#60a5fa',
  text: '#c8daf0',
  textBright: '#e8f0fe',
  textMuted: '#9cb8d9',
  textDimmed: '#3a5a82',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  rowEven: '#071525',
};

export const EMAIL_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

export function emailWrapper(content: string, topBarGradient?: string): string {
  const C = EMAIL_COLORS;
  const bar = topBarGradient || `linear-gradient(90deg,${C.accentDark},${C.accent},${C.accentLight},${C.accent})`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>PH Labs</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    body, html { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    body { background-color: ${C.bg} !important; }

    /* Gmail Android standard dark mode selectors */
    u + .body { background-color: ${C.bg} !important; }
    u + .body .email-bg { background-color: ${C.bg} !important; }
    u + .body .email-card { background-color: ${C.bgCard} !important; }
    u + .body .email-card-dark { background-color: ${C.bgCardDark} !important; }
    u + .body .email-header { background-color: ${C.bgCard} !important; }
    u + .body .email-footer { background-color: ${C.bgCardDark} !important; }
    #MessageViewBody, #MessageWebViewDiv { background-color: ${C.bg} !important; }

    /* Gmail Android FORCED dark mode — data-ogsc overrides Gmail colour injection */
    [data-ogsc] .email-bg,
    [data-ogsb] .email-bg { background-color: ${C.bg} !important; }
    [data-ogsc] .email-card,
    [data-ogsb] .email-card { background-color: ${C.bgCard} !important; }
    [data-ogsc] .email-card-dark,
    [data-ogsb] .email-card-dark { background-color: ${C.bgCardDark} !important; }
    [data-ogsc] .email-header,
    [data-ogsb] .email-header { background-color: ${C.bgCard} !important; }
    [data-ogsc] .email-footer,
    [data-ogsb] .email-footer { background-color: ${C.bgCardDark} !important; }
    [data-ogsc] .email-row-even { background-color: ${C.bgCardDark} !important; }
    [data-ogsc] .email-row-odd { background-color: ${C.bgCard} !important; }
    [data-ogsc] .email-text { color: ${C.text} !important; }
    [data-ogsc] .email-text-bright { color: ${C.textBright} !important; }
    [data-ogsc] .email-text-muted { color: ${C.textMuted} !important; }
    [data-ogsc] .email-accent { color: ${C.accent} !important; }

    /* Base wrapper classes */
    .email-bg { background-color: ${C.bg} !important; }
    .email-card { background-color: ${C.bgCard} !important; }
    .email-card-dark { background-color: ${C.bgCardDark} !important; }

    span.MsoHyperlink, a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
    }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .email-pad { padding: 20px !important; }
    }
    @media (prefers-color-scheme: dark) {
      body { background-color: ${C.bg} !important; }
      .email-bg { background-color: ${C.bg} !important; }
      .email-card { background-color: ${C.bgCard} !important; }
      .email-card-dark { background-color: ${C.bgCardDark} !important; }
    }
  </style>
</head>
<body class="body email-bg" style="margin:0;padding:0;background-color:${C.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;" bgcolor="${C.bg}">

<!-- Preheader spacer -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>

<!-- Outer background table -->
<table class="email-bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background-color:${C.bg};width:100%;min-height:100%;">
  <tr>
    <td align="center" class="email-bg" style="padding:40px 16px;background-color:${C.bg};" bgcolor="${C.bg}">

      <!-- Email card container -->
      <table class="email-container" role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;">

        <!-- TOP ACCENT BAR -->
        <tr>
          <td height="4" style="height:4px;font-size:4px;line-height:4px;background:${bar};border-radius:12px 12px 0 0;" bgcolor="${C.accentDark}"></td>
        </tr>

        <!-- HEADER -->
        <tr>
          <td class="email-card email-header" bgcolor="${C.bgCard}" style="background-color:${C.bgCard};padding:28px 36px 20px;border-left:1px solid rgba(59,130,246,0.2);border-right:1px solid rgba(59,130,246,0.2);">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="vertical-align:middle;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="52" style="vertical-align:middle;">
                        <img src="https://cdn.wegic.ai/assets/onepage/uploads/2031481443271393281/image/2026/03/14/01KKPB20SGJ3T4RK47TQPSAV0N.png"
                          alt="PH Labs" width="44" height="44"
                          style="display:block;width:44px;height:44px;border-radius:10px;border:1px solid rgba(59,130,246,0.3);" />
                      </td>
                      <td style="padding-left:12px;vertical-align:middle;">
                        <div style="color:${C.textBright};font-size:15px;font-weight:800;letter-spacing:-0.3px;font-family:${EMAIL_FONT};">PH Labs</div>
                        <div style="color:${C.accent};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;font-family:${EMAIL_FONT};">Research Grade</div>
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" valign="middle" style="vertical-align:middle;">
                  <a href="https://phlabs.co.uk" style="color:${C.textMuted};font-size:11px;text-decoration:none;font-family:${EMAIL_FONT};">phlabs.co.uk</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- HEADER BOTTOM BORDER -->
        <tr>
          <td height="1" style="height:1px;font-size:1px;line-height:1px;background-color:rgba(59,130,246,0.15);border-left:1px solid rgba(59,130,246,0.2);border-right:1px solid rgba(59,130,246,0.2);" bgcolor="${C.bgCard}"></td>
        </tr>

        <!-- MAIN CONTENT -->
        <tr>
          <td class="email-card email-pad" bgcolor="${C.bgCard}" style="background-color:${C.bgCard};padding:36px;border-left:1px solid rgba(59,130,246,0.2);border-right:1px solid rgba(59,130,246,0.2);font-family:${EMAIL_FONT};">
            ${content}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td class="email-card-dark email-footer" bgcolor="${C.bgCardDark}" style="background-color:${C.bgCardDark};padding:20px 36px;border:1px solid rgba(59,130,246,0.2);border-top:none;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="text-align:center;">
                  <div style="color:${C.textMuted};font-size:12px;margin-bottom:8px;font-family:${EMAIL_FONT};">
                    <a href="https://phlabs.co.uk" style="color:${C.textMuted};text-decoration:none;">phlabs.co.uk</a>
                    &nbsp;&bull;&nbsp;
                    <a href="https://phlabs.co.uk/contact" style="color:${C.textMuted};text-decoration:none;">Contact</a>
                    &nbsp;&bull;&nbsp;
                    <a href="mailto:info@phlabs.co.uk" style="color:${C.textMuted};text-decoration:none;">info@phlabs.co.uk</a>
                  </div>
                  <div style="color:${C.textDimmed};font-size:10px;margin-top:8px;font-family:${EMAIL_FONT};">
                    All products are for <strong style="color:${C.textMuted};">research &amp; laboratory use only</strong>. Not for human consumption.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BOTTOM ACCENT BAR -->
        <tr>
          <td height="4" style="height:4px;font-size:4px;line-height:4px;background:${bar};border-radius:0 0 12px 12px;" bgcolor="${C.accentDark}"></td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

/** Section heading */
export function sectionHeading(text: string): string {
  const C = EMAIL_COLORS;
  return `<p style="margin:0 0 20px;color:${C.textBright};font-size:22px;font-weight:800;letter-spacing:-0.5px;font-family:${EMAIL_FONT};">${text}</p>`;
}

/** Greeting line */
export function greeting(firstName: string): string {
  const C = EMAIL_COLORS;
  return `<p style="margin:0 0 20px;color:${C.text};font-size:15px;line-height:1.6;font-family:${EMAIL_FONT};">Hi <strong style="color:${C.textBright};">${firstName}</strong>,</p>`;
}

/** Info card — key/value rows on dark background */
export function infoCard(rows: Array<{ label: string; value: string; mono?: boolean; highlight?: boolean }>): string {
  const C = EMAIL_COLORS;
  const rowsHtml = rows.map(r => `
    <tr>
      <td style="padding:10px 16px;color:${C.textDimmed};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:40%;font-family:${EMAIL_FONT};">${r.label}</td>
      <td style="padding:10px 16px;color:${r.highlight ? C.textBright : C.text};font-size:${r.highlight ? '15px' : '14px'};font-weight:${r.highlight ? '700' : '400'};text-align:right;${r.mono ? 'font-family:monospace;' : `font-family:${EMAIL_FONT};`}">${r.value}</td>
    </tr>`).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.bgCardDark};border:1px solid rgba(59,130,246,0.15);border-radius:10px;overflow:hidden;margin-bottom:20px;" bgcolor="${C.bgCardDark}">
      ${rowsHtml}
    </table>`;
}

/** Status badge */
export function statusBadge(label: string, color: string, bg: string): string {
  return `<span style="display:inline-block;padding:5px 16px;background-color:${bg};border:1px solid ${color};border-radius:999px;color:${color};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;font-family:${EMAIL_FONT};">${label}</span>`;
}

/** CTA button — table-based for all email clients */
export function ctaButton(text: string, href: string): string {
  const C = EMAIL_COLORS;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
      <tr>
        <td style="background-color:${C.accentDark};border-radius:10px;" bgcolor="${C.accentDark}">
          <a href="${href}" style="display:inline-block;padding:13px 32px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.2px;font-family:${EMAIL_FONT};background-color:${C.accentDark};border-radius:10px;" bgcolor="${C.accentDark}">${text}</a>
        </td>
      </tr>
    </table>`;
}

/** Divider */
export function divider(): string {
  const C = EMAIL_COLORS;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td height="1" style="height:1px;font-size:1px;line-height:1px;background-color:rgba(59,130,246,0.15);" bgcolor="${C.bgCardDark}"></td></tr></table>`;
}
