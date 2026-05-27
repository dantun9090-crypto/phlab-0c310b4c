import { EMAIL_COLORS as C, EMAIL_FONT } from './emailBase';

export interface ContactFormEmailOptions {
  senderName: string;
  senderEmail: string;
  subject: string;
  message: string;
  submittedAt?: string;
}

// Escape user-controlled values before embedding into the HTML email so a
// crafted name/subject/message cannot inject markup or scripts into the
// admin notification.
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildContactFormEmail(opts: ContactFormEmailOptions): string {
  const ts = opts.submittedAt || new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
  const senderName = esc(opts.senderName);
  const senderEmail = esc(opts.senderEmail);
  const subject = esc(opts.subject);
  const message = esc(opts.message);


  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Contact Form — PH Labs</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${EMAIL_FONT};">

<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0d1f38,#091528);border:1px solid ${C.border};border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
            <div style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#3b82f6);border-radius:12px;padding:10px 14px;margin-bottom:14px;">
              <span style="font-size:22px;">📩</span>
            </div>
            <div style="font-size:18px;font-weight:800;color:${C.textBright};letter-spacing:-0.3px;">New Contact Message</div>
            <div style="font-size:12px;color:${C.textMuted};margin-top:4px;">PH Labs — Admin Notification</div>
          </td>
        </tr>

        <!-- Meta -->
        <tr>
          <td style="background:${C.bgCard};border-left:1px solid ${C.border};border-right:1px solid ${C.border};padding:20px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
              <tr>
                <td style="color:${C.textMuted};padding:6px 0;border-bottom:1px solid rgba(59,130,246,0.07);width:120px;">From</td>
                <td style="color:${C.textBright};font-weight:600;padding:6px 0;border-bottom:1px solid rgba(59,130,246,0.07);">${senderName}</td>
              </tr>
              <tr>
                <td style="color:${C.textMuted};padding:6px 0;border-bottom:1px solid rgba(59,130,246,0.07);">Email</td>
                <td style="padding:6px 0;border-bottom:1px solid rgba(59,130,246,0.07);">
                  <a href="mailto:${senderEmail}" style="color:${C.accent};text-decoration:none;font-family:monospace;">${senderEmail}</a>
                </td>
              </tr>
              <tr>
                <td style="color:${C.textMuted};padding:6px 0;border-bottom:1px solid rgba(59,130,246,0.07);">Subject</td>
                <td style="color:${C.textBright};font-weight:600;padding:6px 0;border-bottom:1px solid rgba(59,130,246,0.07);">${subject}</td>
              </tr>
              <tr>
                <td style="color:${C.textMuted};padding:6px 0;">Received</td>
                <td style="color:${C.textDimmed};font-size:12px;padding:6px 0;">${ts}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Message body -->
        <tr>
          <td style="background:${C.bgCardDark};border-left:1px solid ${C.border};border-right:1px solid ${C.border};padding:24px 32px;">
            <div style="font-size:11px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.8px;font-weight:600;margin-bottom:12px;">Message</div>
            <div style="font-size:14px;color:${C.text};line-height:1.7;white-space:pre-wrap;background:rgba(59,130,246,0.04);border:1px solid rgba(59,130,246,0.1);border-radius:10px;padding:16px 20px;">${message}</div>
          </td>
        </tr>

        <!-- Reply CTA -->
        <tr>
          <td style="background:${C.bgCard};border-left:1px solid ${C.border};border-right:1px solid ${C.border};padding:20px 32px;">
            <a href="mailto:${senderEmail}?subject=Re: ${encodeURIComponent(opts.subject)}" style="display:inline-block;padding:11px 28px;background:linear-gradient(135deg,#1d4ed8,#3b82f6);border-radius:9px;color:#fff;font-size:13px;font-weight:700;text-decoration:none;box-shadow:0 4px 16px rgba(59,130,246,0.3);">Reply to ${senderName} →</a>
          </td>
        </tr>


        <!-- Footer -->
        <tr>
          <td style="background:${C.bgCardDark};border:1px solid ${C.border};border-top:none;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
            <div style="height:3px;background:linear-gradient(90deg,#1d4ed8,#3b82f6,#60a5fa);border-radius:2px;margin-bottom:12px;"></div>
            <div style="font-size:11px;color:${C.textDimmed};">PH Labs Admin Panel · <a href="https://www.phlabs.co.uk" style="color:${C.accent};text-decoration:none;">phlabs.co.uk</a></div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}
