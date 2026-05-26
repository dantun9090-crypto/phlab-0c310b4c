import { emailWrapper, ctaButton, divider, EMAIL_COLORS as C } from './emailBase';

export interface AdminInvoiceEmailOptions {
  customerName: string;
  email: string;
  invoiceRef: string;
  description: string;
  amount: number;
  currency: string;
  dueDate?: string;
  notes?: string;
}

export function buildAdminInvoiceEmail(opts: AdminInvoiceEmailOptions): string {
  const currencySymbol = opts.currency === 'GBP' ? '£' : opts.currency === 'EUR' ? '€' : '$';
  const formattedAmount = `${currencySymbol}${opts.amount.toFixed(2)}`;

  const content = `
    <div>
      <!-- Header accent bar -->
      <div style="height:4px;background:linear-gradient(90deg,${C.accentDark},${C.accent},${C.accentLight});border-radius:12px 12px 0 0;margin:-28px -28px 28px;"></div>

      <!-- Logo + Invoice header -->
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
        <tr>
          <td>
            <div style="font-size:22px;font-weight:800;color:${C.textBright};letter-spacing:-0.5px;">PH Labs</div>
            <div style="font-size:12px;color:${C.textMuted};margin-top:2px;">phlabs.co.uk</div>
          </td>
          <td align="right">
            <div style="display:inline-block;padding:6px 16px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:8px;">
              <div style="font-size:10px;color:${C.textMuted};text-transform:uppercase;letter-spacing:1px;font-weight:600;">Invoice</div>
              <div style="font-size:14px;color:${C.accent};font-weight:700;font-family:monospace;">${opts.invoiceRef}</div>
            </div>
          </td>
        </tr>
      </table>

      <p style="color:${C.text};font-size:15px;line-height:1.6;margin:0 0 24px;">
        Dear <strong style="color:${C.textBright};">${opts.customerName}</strong>,<br><br>
        Please find below your invoice from PH Labs. Kindly ensure payment is made by the due date.
      </p>

      <!-- Invoice card -->
      <div style="background:${C.bgCard};border:1px solid ${C.borderStrong};border-radius:14px;overflow:hidden;margin-bottom:24px;">
        <div style="padding:16px 20px;border-bottom:1px solid ${C.border};">
          <div style="font-size:11px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.8px;font-weight:600;margin-bottom:6px;">Description</div>
          <div style="font-size:14px;color:${C.text};line-height:1.5;">${opts.description}</div>
        </div>
        <div style="padding:20px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="color:${C.textMuted};font-size:13px;">Amount Due</td>
              <td align="right" style="color:${C.textBright};font-size:24px;font-weight:800;font-family:monospace;">${formattedAmount}</td>
            </tr>
            ${opts.dueDate ? `
            <tr>
              <td colspan="2" style="padding-top:12px;">
                <div style="display:inline-block;padding:6px 14px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);border-radius:8px;margin-top:8px;">
                  <span style="color:#fbbf24;font-size:12px;font-weight:600;">Due: ${opts.dueDate}</span>
                </div>
              </td>
            </tr>` : ''}
          </table>
        </div>
      </div>

      ${opts.notes ? `
      <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:11px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.8px;font-weight:600;margin-bottom:8px;">Notes</div>
        <div style="font-size:13px;color:${C.text};line-height:1.5;">${opts.notes}</div>
      </div>` : ''}

      ${ctaButton('Pay Now', 'https://www.phlabs.co.uk')}

      ${divider()}

      <p style="color:${C.textDimmed};font-size:11px;line-height:1.6;margin:0;text-align:center;">
        Questions about this invoice? <a href="mailto:info@phlabs.co.uk" style="color:${C.accent};text-decoration:none;">info@phlabs.co.uk</a>
      </p>
    </div>
  `;

  return emailWrapper(content);
}
