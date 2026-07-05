/**
 * Newsletter popup config — Firestore doc `newsletter_config/popup`.
 * Public read (for popup rendering), admin-only write.
 */
import { db, doc, getDoc, setDoc, Timestamp } from '@/lib/firebase';

export interface PopupConfig {
  labelText: string;
  headline: string;
  subheadline: string;
  finePrint: string;
  imageUrl: string | null;
  delaySeconds: number;
  cooldownDays: number;
  isEnabled: boolean;
  buttonText: string;
  popupBackground: string;
  popupPanel: string;
  accentColor: string;
  buttonColor: string;
  buttonTextColor: string;
  updatedAt?: unknown;
}

export const DEFAULT_POPUP_CONFIG: PopupConfig = {
  labelText: 'Newsletter',
  headline: 'Stay Ahead in Research',
  subheadline:
    'Get exclusive updates on new compounds, restocks, and lab insights — delivered to your inbox.',
  finePrint: 'No spam. Unsubscribe anytime.',
  imageUrl: null,
  delaySeconds: 4,
  cooldownDays: 7,
  isEnabled: true,
  buttonText: 'Subscribe',
  popupBackground: '#020617',
  popupPanel: '#0f172a',
  accentColor: '#10b981',
  buttonColor: '#059669',
  buttonTextColor: '#ffffff',
};

export async function getPopupConfig(): Promise<PopupConfig> {
  try {
    const snap = await getDoc(doc(db, 'newsletter_config', 'popup'));
    if (!snap.exists()) return DEFAULT_POPUP_CONFIG;
    const data = snap.data() as Partial<PopupConfig>;
    return { ...DEFAULT_POPUP_CONFIG, ...data };
  } catch (err) {
    console.warn('[newsletter-config] read failed, using defaults:', err);
    return DEFAULT_POPUP_CONFIG;
  }
}

export async function updatePopupConfig(data: Partial<PopupConfig>): Promise<void> {
  const payload = { ...data, updatedAt: Timestamp.now() };
  await setDoc(doc(db, 'newsletter_config', 'popup'), payload, { merge: true });
}
