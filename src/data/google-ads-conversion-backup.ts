/**
 * Google Ads conversion configuration snapshot — taken BEFORE the
 * 2026-09-15 conversion clean-up (account 4410206709 "Ph Labs").
 *
 * Read-only restore reference. To roll back, re-apply each row's
 * `primaryForGoal` / `includeInConversionsMetric` / `status` values, and
 * restore the account goal `biddable` flags below.
 */

export const ADS_BACKUP_TAKEN_AT = '2026-09-15T22:55:00Z';
export const ADS_BACKUP_CUSTOMER_ID = '4410206709';

export interface AdsConversionSnapshot {
  id: string;
  name: string;
  category: string;
  status: string;
  countingType: string;
  primaryForGoal: boolean;
  includeInConversionsMetric: boolean;
}

/** Only the ENABLED actions that matter for bidding/reporting. */
export const ADS_CONVERSION_BACKUP: AdsConversionSnapshot[] = [
  { id: '7650709850', name: 'Products', category: 'ADD_TO_CART', status: 'ENABLED', countingType: 'MANY_PER_CLICK', primaryForGoal: true, includeInConversionsMetric: true },
  { id: '7650707693', name: 'Add to basket', category: 'ADD_TO_CART', status: 'ENABLED', countingType: 'MANY_PER_CLICK', primaryForGoal: false, includeInConversionsMetric: false },
  { id: '7711710161', name: 'Add to basket (1)', category: 'ADD_TO_CART', status: 'ENABLED', countingType: 'MANY_PER_CLICK', primaryForGoal: false, includeInConversionsMetric: false },
  { id: '7700452550', name: 'Begin checkout (Page load phlabs.co.uk/checkout)', category: 'BEGIN_CHECKOUT', status: 'ENABLED', countingType: 'MANY_PER_CLICK', primaryForGoal: true, includeInConversionsMetric: true },
  { id: '7722450159', name: 'Purchase (offline import)', category: 'PURCHASE', status: 'ENABLED', countingType: 'MANY_PER_CLICK', primaryForGoal: true, includeInConversionsMetric: true },
  { id: '7711984483', name: 'Purchase (website)', category: 'PURCHASE', status: 'ENABLED', countingType: 'MANY_PER_CLICK', primaryForGoal: false, includeInConversionsMetric: false },
  { id: '7707583639', name: 'Purchase (4)', category: 'PURCHASE', status: 'ENABLED', countingType: 'MANY_PER_CLICK', primaryForGoal: false, includeInConversionsMetric: false },
  { id: '7713353916', name: 'Purchase (5)', category: 'PURCHASE', status: 'ENABLED', countingType: 'MANY_PER_CLICK', primaryForGoal: false, includeInConversionsMetric: false },
  { id: '7648046375', name: 'prohealthpeptides-a0808 (web) purchase', category: 'PURCHASE', status: 'ENABLED', countingType: 'MANY_PER_CLICK', primaryForGoal: false, includeInConversionsMetric: false },
];

export interface AdsGoalSnapshot {
  goal: string;
  biddable: boolean;
}

export const ADS_GOAL_BACKUP: AdsGoalSnapshot[] = [
  { goal: 'PURCHASE ~ WEBSITE', biddable: true },
  { goal: 'ADD_TO_CART ~ WEBSITE', biddable: true },
  { goal: 'BEGIN_CHECKOUT ~ WEBSITE', biddable: true },
  { goal: 'PHONE_CALL_LEAD ~ CALL_FROM_ADS', biddable: true },
  { goal: 'CONTACT ~ CALL_FROM_ADS', biddable: true },
  { goal: 'DOWNLOAD ~ APP', biddable: true },
  { goal: 'PURCHASE ~ CALL_FROM_ADS', biddable: false },
  { goal: 'GET_DIRECTIONS ~ GOOGLE_HOSTED', biddable: false },
  { goal: 'CONTACT ~ GOOGLE_HOSTED', biddable: false },
];

/** Campaign state at snapshot time — nothing here is changed by the clean-up. */
export const ADS_CAMPAIGN_BACKUP = {
  id: '24058542701',
  name: 'Performance Max',
  status: 'ENABLED',
  dailyBudgetGbp: 51,
  biddingStrategy: 'MAXIMIZE_CONVERSION_VALUE',
  startDate: '2026-07-22',
} as const;
