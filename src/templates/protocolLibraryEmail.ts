import { 
  emailWrapper, 
  ctaButton, 
  EMAIL_COLORS,
  EMAIL_FONT 
} from './emailBase';

interface ProtocolLibraryEmailParams {
  recipientEmail: string;
  discountCode: string;
  pdfDownloadUrl: string;
}

export function protocolLibraryEmail({
  recipientEmail: _recipientEmail,
  discountCode,
  pdfDownloadUrl,
}: ProtocolLibraryEmailParams) {
  const C = EMAIL_COLORS;
  
  const content = `
    <!-- Hero Badge -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <div style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#10b981 0%,#059669 100%);border-radius:8px;">
            <span style="color:#ffffff;font-size:24px;font-weight:700;font-family:${EMAIL_FONT};">🎉 Your Free Protocol Library is Ready!</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- What's Inside Box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.bgCard};border:1px solid ${C.border};border-radius:12px;margin-bottom:24px;" bgcolor="${C.bgCard}">
      <tr>
        <td style="padding:28px;">
          <h2 style="color:${C.textBright};margin:0 0 16px 0;font-size:22px;font-weight:600;font-family:${EMAIL_FONT};">What's Inside Your 28-Page Guide:</h2>
          <ul style="color:${C.text};font-size:15px;line-height:1.8;margin:0;padding-left:20px;font-family:${EMAIL_FONT};">
            <li style="margin-bottom:8px;"><strong style="color:${C.textBright};">BPC-157 Research Protocol</strong> — Complete dosing, reconstitution & storage guide</li>
            <li style="margin-bottom:8px;"><strong style="color:${C.textBright};">TB-500 Application Guide</strong> — Evidence-based usage protocols</li>
            <li style="margin-bottom:8px;"><strong style="color:${C.textBright};">Semaglutide Handbook</strong> — Safe handling & administration</li>
            <li style="margin-bottom:8px;"><strong style="color:${C.textBright};">Storage Best Practices</strong> — Maximise peptide stability & shelf life</li>
            <li style="margin-bottom:8px;"><strong style="color:${C.textBright};">Certificate of Analysis Guide</strong> — How to read HPLC test results</li>
            <li style="margin-bottom:0;"><strong style="color:${C.textBright};">UK Legal Compliance</strong> — Research-only use requirements</li>
          </ul>
        </td>
      </tr>
    </table>

    <!-- Download CTA -->
    ${ctaButton('📥 Download Your Free Guide (PDF)', pdfDownloadUrl)}

    <!-- Discount Code Box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:2px solid #fbbf24;border-radius:12px;margin:32px 0;" bgcolor="#fef3c7">
      <tr>
        <td style="padding:24px;" align="center">
          <p style="color:#78350f;margin:0 0 12px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;font-family:${EMAIL_FONT};">🎁 YOUR EXCLUSIVE DISCOUNT CODE</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr>
              <td style="background-color:#ffffff;padding:16px 32px;border-radius:8px;border:2px dashed #fbbf24;" bgcolor="#ffffff">
                <code style="font-size:28px;font-weight:700;color:#059669;letter-spacing:2px;font-family:monospace;">${discountCode}</code>
              </td>
            </tr>
          </table>
          <p style="color:#78350f;margin:16px 0 0 0;font-size:15px;font-weight:500;font-family:${EMAIL_FONT};">Save 10% on your first order — valid for 30 days</p>
        </td>
      </tr>
    </table>

    <!-- Quick Tips Box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.bgCard};border-left:4px solid ${C.accent};border-radius:8px;margin-bottom:24px;" bgcolor="${C.bgCard}">
      <tr>
        <td style="padding:20px 24px;">
          <p style="color:${C.accentLight};margin:0 0 12px 0;font-size:16px;font-weight:600;font-family:${EMAIL_FONT};">💡 Quick Start Tips:</p>
          <ol style="color:${C.text};font-size:14px;line-height:1.7;margin:0;padding-left:20px;font-family:${EMAIL_FONT};">
            <li style="margin-bottom:6px;">Read the <strong style="color:${C.textBright};">Storage Guide</strong> (pages 18-21) first — proper storage is critical</li>
            <li style="margin-bottom:6px;">Review <strong style="color:${C.textBright};">Reconstitution Protocols</strong> before handling lyophilised peptides</li>
            <li style="margin-bottom:6px;">Keep the <strong style="color:${C.textBright};">CoA Interpretation Guide</strong> (pages 24-27) handy when ordering</li>
            <li style="margin-bottom:0;"><a href="https://phlabs.co.uk/resources" style="color:${C.success};font-weight:600;text-decoration:none;">Research Hub</a> for ongoing updates</li>
          </ol>
        </td>
      </tr>
    </table>

    <!-- CTA to Shop -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
      <tr>
        <td align="center">
          <p style="color:${C.textMuted};font-size:15px;margin:0 0 16px 0;font-family:${EMAIL_FONT};">Ready to order HPLC-verified peptides?</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="border:2px solid ${C.success};border-radius:8px;">
                <a href="https://phlabs.co.uk/products" style="display:inline-block;padding:14px 32px;color:${C.success};font-size:15px;font-weight:600;text-decoration:none;font-family:${EMAIL_FONT};">Browse All Products →</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Disclaimer -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.border};padding-top:24px;margin-top:32px;">
      <tr>
        <td>
          <p style="color:${C.textMuted};font-size:13px;line-height:1.6;margin:0;font-family:${EMAIL_FONT};">
            <strong style="color:${C.textBright};">⚠️ Research Use Only</strong><br>
            All peptides supplied by PH Labs UK are for in-vitro research purposes only. Not for human or veterinary use. By downloading this guide, you confirm you are purchasing for legitimate research applications in compliance with UK law.
          </p>
        </td>
      </tr>
    </table>

    <!-- Contact -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr>
        <td align="center">
          <p style="color:${C.textDimmed};font-size:12px;margin:0 0 8px 0;font-family:${EMAIL_FONT};">Questions? We're here to help</p>
          <p style="margin:0;">
            <a href="mailto:info@phlabs.co.uk" style="color:${C.success};text-decoration:none;font-weight:600;font-size:13px;font-family:${EMAIL_FONT};">info@phlabs.co.uk</a>
          </p>
        </td>
      </tr>
    </table>
  `;

  return emailWrapper(content, 'linear-gradient(135deg, #10b981 0%, #059669 100%)');
}
