import { emailWrapper, greeting, sectionHeading, infoCard, ctaButton, divider, EMAIL_COLORS as C } from './emailBase';

interface ReferralRewardEmailOpts {
  firstName: string;
  newReferralBalance: number;
  referralCount?: number;
  isBuyerBonus?: boolean;
  isRedemption?: boolean;
  couponCode?: string;
  couponValue?: number;
}

export const buildReferralRewardEmail = (opts: ReferralRewardEmailOpts): string => {
  const {
    firstName,
    newReferralBalance,
    referralCount,
    isBuyerBonus = false,
    isRedemption = false,
    couponCode,
    couponValue,
  } = opts;

  const siteUrl = 'https://phlabs.co.uk';

  let headingText: string;
  let bodyText: string;

  if (isRedemption && couponCode) {
    headingText = 'Your Referral Discount Code';
    bodyText = `Your referral earnings have been converted into a discount code worth <strong style="color:${C.success};">GBP${couponValue?.toFixed(2)}</strong>. Use it at checkout.`;
  } else if (isBuyerBonus) {
    headingText = 'You Earned a Referral Reward!';
    bodyText = `Great news  -  you signed up via a referral link and reached GBP50 in purchases, so we credited <strong style="color:${C.success};">GBP5</strong> to your referral balance.`;
  } else {
    headingText = 'You Earned GBP5  -  New Referral Purchase!';
    bodyText = `Someone you referred just completed their first qualifying purchase. We have credited <strong style="color:${C.success};">GBP5</strong> to your referral balance.`;
  }

  const rows: Array<{ label: string; value: string; mono?: boolean; highlight?: boolean }> = [];

  if (isRedemption && couponCode) {
    rows.push({ label: 'Discount Code', value: `<span style="font-family:monospace;font-size:18px;font-weight:700;color:${C.accentLight};letter-spacing:2px;">${couponCode}</span>`, highlight: true });
    rows.push({ label: 'Code Value', value: `GBP${couponValue?.toFixed(2)}` });
    rows.push({ label: 'Referral Balance', value: 'GBP0.00 (reset)' });
  } else {
    rows.push({ label: 'Reward Added', value: 'GBP5.00', highlight: true });
    rows.push({ label: 'New Referral Balance', value: `GBP${newReferralBalance.toFixed(2)}` });
    if (typeof referralCount === 'number') {
      rows.push({ label: 'Total Referrals', value: `${referralCount} ${referralCount === 1 ? 'person' : 'people'}` });
    }
    if (newReferralBalance >= 30) {
      rows.push({ label: 'Status', value: `<span style="color:${C.success};font-weight:700;">Ready to redeem!</span>` });
    } else {
      const needed = (30 - newReferralBalance).toFixed(2);
      rows.push({ label: 'To Unlock Code', value: `GBP${needed} more needed` });
    }
  }

  const howItWorks = !isRedemption ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr>
      <td style="background:${C.bgCard};border-radius:10px;padding:16px 20px;border:1px solid ${C.border};">
        <p style="font-size:12px;color:${C.textMuted};font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">How it works</p>
        <p style="font-size:13px;color:${C.text};line-height:1.6;margin:0;">
          Share your link &rarr; Friend registers and spends GBP50 &rarr; You both earn GBP5 &rarr; Reach GBP30 to unlock a discount code.
        </p>
      </td>
    </tr></table>` : '';

  const content = `
    ${greeting(firstName)}
    <p style="font-size:15px;color:${C.text};line-height:1.7;margin:0 0 24px;">${bodyText}</p>
    ${sectionHeading(headingText)}
    ${infoCard(rows)}
    ${howItWorks}
    ${isRedemption
      ? ctaButton('Shop Now  -  Use Your Code', siteUrl + '/products')
      : ctaButton('View My Referral Dashboard', siteUrl + '/account')
    }
    ${!isRedemption ? `${divider()}<p style="font-size:13px;color:${C.textMuted};text-align:center;margin:0;">Share your referral link from your <a href="${siteUrl}/account" style="color:${C.accent};text-decoration:none;">Account page</a> to keep earning.</p>` : ''}
  `;

  return emailWrapper(content);
};
