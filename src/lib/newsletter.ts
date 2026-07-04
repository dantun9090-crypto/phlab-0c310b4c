/**
 * Newsletter subscriber service. Uses the existing `emailSubscribers`
 * collection (Firestore rules restrict fields to
 * email/subscribedAt/source/discountCode/timestamp).
 */
import { z } from 'zod';
import {
  db,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from '@/lib/firebase';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Please enter a valid email address')
  .max(254);

export type SubscriberStatus = 'active' | 'unsubscribed' | 'bounced';

export interface Subscriber {
  id: string;
  email: string;
  source?: string;
  status?: SubscriberStatus;
  subscribedAt?: Date | null;
}

export interface SubscribeResult {
  success: boolean;
  message: string;
  alreadySubscribed?: boolean;
}

/**
 * Idempotent subscribe. Writes to `emailSubscribers` with locked schema.
 * If the email exists with source='popup', returns success silently.
 */
export async function subscribeToNewsletter(
  rawEmail: string,
  source = 'popup',
): Promise<SubscribeResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Invalid email' };
  }
  const email = parsed.data;

  try {
    const dupSnap = await getDocs(
      query(
        collection(db, 'emailSubscribers'),
        where('email', '==', email),
        where('source', '==', source),
      ),
    );
    if (!dupSnap.empty) {
      return {
        success: true,
        alreadySubscribed: true,
        message: "You're already on the list — thanks!",
      };
    }
  } catch (err) {
    // Non-fatal — rules may block anonymous list reads. Fall through to create.
    console.warn('[newsletter] duplicate check skipped:', err);
  }

  try {
    await addDoc(collection(db, 'emailSubscribers'), {
      email,
      source,
      subscribedAt: Timestamp.now(),
      timestamp: new Date().toISOString(),
    });
    return { success: true, message: "You're subscribed! Check your inbox soon." };
  } catch (err) {
    console.error('[newsletter] subscribe failed:', err);
    return {
      success: false,
      message: 'Subscription failed. Please try again in a moment.',
    };
  }
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (v as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function getNewsletterSubscribers(): Promise<Subscriber[]> {
  const snap = await getDocs(
    query(collection(db, 'emailSubscribers'), orderBy('subscribedAt', 'desc')),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      email: String(data.email ?? ''),
      source: (data.source as string) ?? undefined,
      status: (data.status as SubscriberStatus) ?? 'active',
      subscribedAt: toDate(data.subscribedAt),
    };
  });
}

export async function updateSubscriberStatus(
  id: string,
  status: SubscriberStatus,
): Promise<void> {
  await updateDoc(doc(db, 'emailSubscribers', id), { status });
}

/** Hard delete — admin only. */
export async function deleteSubscriber(id: string): Promise<void> {
  await deleteDoc(doc(db, 'emailSubscribers', id));
}

export async function isEmailSubscribed(email: string): Promise<boolean> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return false;
  try {
    const snap = await getDocs(
      query(collection(db, 'emailSubscribers'), where('email', '==', parsed.data)),
    );
    return !snap.empty;
  } catch {
    return false;
  }
}
