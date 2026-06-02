import { emailWrapper, greeting, ctaButton, divider, EMAIL_COLORS as C } from './emailBase';

export interface WelcomeEmailOptions {
  firstName: string;
  email: string;
}

export function buildWelcomeEmail(opts: WelcomeEmailOptions): string {
  const features = [
    { icon: '🧬', title: 'Research-Grade Peptides', desc: 'HPLC-tested purity. For in-vitro laboratory research use only.' },
    { icon: '🚀', title: 'Fast UK Dispatch', desc: 'Same-day dispatch on orders placed before 2 PM weekdays.' },
    { icon: '🔒', title: 'Secure Checkout', desc: 'Open Banking payments via TrueLayer. FCA-regulated, bank-grade security.' },
    { icon: '📋', title: 'Order Tracking', desc: 'Real-time status updates and dispatch notifications by email.' },
  ];

  const featureCards = features.map(f => `
    <tr>
      <td style="padding:14px 20px;border-bottom:1px solid ${C.border};">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="36" style="vertical-align:top;padding-top:2px;">
              <span style="font-size:20px;">${f.icon}</span>
            </td>
            <td style="padding-left:12px;">
              <p style="margin:0 0 3px;color:${C.textBright};font-size:14px;font-weight:600;">${f.title}</p>
              <p style="margin:0;color:${C.textMuted};font-size:12px;line-height:1.5;">${f.desc}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const content = `
    <!-- Hero accent bar -->
    <div style="height:3px;background:linear-gradient(90deg,${C.accentDark},${C.accent},${C.accentLight});border-radius:12px 12px 0 0;margin:-1px -1px 0;"></div>

    <!-- Logo + brand -->
    <div style="text-align:center;padding:40px 40px 32px;">
      <div style="display:inline-block;width:56px;height:56px;background:linear-gradient(135deg,${C.accentDark},${C.accent});border-radius:16px;margin-bottom:20px;box-shadow:0 0 30px rgba(59,130,246,0.35);">
        <p style="margin:0;line-height:56px;font-size:28px;text-align:center;">🧬</p>
      </div>
      <h1 style="margin:0 0 6px;color:${C.textBright};font-size:24px;font-weight:800;letter-spacing:-0.5px;">Welcome to PH Labs</h1>
      <p style="margin:0;color:${C.textMuted};font-size:14px;">Your account is ready. Research starts here.</p>
    </div>

    <div style="padding:0 40px 40px;">

      ${greeting(opts.firstName)}

      <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 28px;">
        Your PH Labs account has been created successfully. 
        You now have access to our full catalogue of research-grade peptides — all independently tested 
        with Certificates of Analysis available on every product page.
      </p>

      <!-- Features -->
      <div style="background:${C.bgCardDark};border:1px solid ${C.border};border-radius:12px;overflow:hidden;margin:0 0 28px;">
        <p style="margin:0;padding:14px 20px 12px;color:${C.accent};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid ${C.border};">What you get with your account</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          ${featureCards}
        </table>
      </div>

      ${divider()}

      <!-- Account info -->
      <div style="background:${C.bgCard};border:1px solid ${C.border};border-radius:10px;padding:16px 20px;margin:0 0 28px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="color:${C.textMuted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:4px;">Registered Email</td>
          </tr>
          <tr>
            <td style="color:${C.textBright};font-size:14px;font-family:monospace;">${opts.email}</td>
          </tr>
        </table>
      </div>

      ${ctaButton('Browse Our Catalogue →', 'https://phlabs.co.uk/products')}

      ${divider()}

      <p style="color:${C.textDimmed};font-size:11px;line-height:1.6;margin:0;text-align:center;">
        All products are sold for <strong style="color:${C.textMuted};">research purposes only</strong>. 
        Not for human consumption. For laboratory use only.<br>
        Questions? <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a>
      </p>
    </div>
  `;

  return emailWrapper(content);
}
