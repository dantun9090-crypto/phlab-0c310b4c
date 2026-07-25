/**
 * Customer reviews — data model + Firestore helpers.
 *
 * Collection: `reviews`
 *   status: 'pending' | 'approved' | 'rejected'
 *
 * Public surfaces (product page, homepage testimonials) only ever read
 * `status == 'approved'`. Anyone can submit; nothing is published until an
 * admin approves it in Admin → Reviews.
 *
 * Compliance: review text is screened with the peptide compliance validator
 * before it is written, and again (visibly) in the admin panel, so no medical
 * claim can reach a public page.
 */
import {
  db,
  doc,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  Timestamp,
} from '@/lib/firebase';
import { validateContent } from '@/lib/peptide-compliance';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  id: string;
  name: string;
  /** Optional — never rendered publicly, admin contact only. */
  email: string | null;
  rating: number;
  title: string;
  body: string;
  productId: string | null;
  productName: string | null;
  status: ReviewStatus;
  createdAt: Timestamp | null;
  reviewedAt: Timestamp | null;
  reviewedBy: string | null;
}

export interface ReviewSubmission {
  name: string;
  email?: string | null;
  rating: number;
  title: string;
  body: string;
  productId?: string | null;
  productName?: string | null;
}

const COL = 'reviews';

export interface ReviewValidation {
  ok: boolean;
  message: string;
}

/** Client + admin shared validation (length limits + compliance screen). */
export function validateReview(input: ReviewSubmission): ReviewValidation {
  const name = (input.name || '').trim();
  const title = (input.title || '').trim();
  const body = (input.body || '').trim();
  const rating = Number(input.rating);

  if (name.length < 2 || name.length > 60) {
    return { ok: false, message: 'Please enter your name (2–60 characters).' };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, message: 'Please select a rating from 1 to 5.' };
  }
  if (title.length > 90) {
    return { ok: false, message: 'Title must be 90 characters or fewer.' };
  }
  if (body.length < 10 || body.length > 1000) {
    return { ok: false, message: 'Please write between 10 and 1000 characters.' };
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }

  const compliance = validateContent(`${title} ${body}`);
  if (!compliance.valid) {
    const first = compliance.violations[0];
    return {
      ok: false,
      message: `Reviews cannot contain medical or health claims${first ? ` — please remove "${first.match}"` : ''}.`,
    };
  }
  return { ok: true, message: '' };
}

function normalize(id: string, raw: Record<string, unknown>): Review {
  return {
    id,
    name: String(raw.name || 'Anonymous').slice(0, 60),
    email: raw.email ? String(raw.email).slice(0, 200) : null,
    rating: Math.min(5, Math.max(1, Number(raw.rating) || 5)),
    title: String(raw.title || '').slice(0, 90),
    body: String(raw.body || '').slice(0, 1000),
    productId: raw.productId ? String(raw.productId) : null,
    productName: raw.productName ? String(raw.productName) : null,
    status: (['pending', 'approved', 'rejected'] as const).includes(raw.status as ReviewStatus)
      ? (raw.status as ReviewStatus)
      : 'pending',
    createdAt: (raw.createdAt as Timestamp) ?? null,
    reviewedAt: (raw.reviewedAt as Timestamp) ?? null,
    reviewedBy: raw.reviewedBy ? String(raw.reviewedBy) : null,
  };
}

/** Submit a review. Always created as `pending`. */
export async function submitReview(input: ReviewSubmission): Promise<void> {
  const check = validateReview(input);
  if (!check.ok) throw new Error(check.message);

  await addDoc(collection(db, COL), {
    name: input.name.trim().slice(0, 60),
    email: input.email ? input.email.trim().slice(0, 200) : null,
    rating: Math.round(Number(input.rating)),
    title: (input.title || '').trim().slice(0, 90),
    body: input.body.trim().slice(0, 1000),
    productId: input.productId ?? null,
    productName: input.productName ?? null,
    status: 'pending' as ReviewStatus,
    createdAt: Timestamp.now(),
    reviewedAt: null,
    reviewedBy: null,
  });
}

/** Public: approved reviews, newest first. */
export async function listApprovedReviews(max = 12): Promise<Review[]> {
  try {
    const snap = await getDocs(
      query(collection(db, COL), where('status', '==', 'approved'), fbLimit(max * 3)),
    );
    const rows = snap.docs.map((d) => normalize(d.id, d.data() as Record<string, unknown>));
    // Sort client-side to avoid needing a composite index.
    rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    return rows.slice(0, max);
  } catch {
    return [];
  }
}

/** Public: approved reviews for one product. */
export async function listApprovedReviewsForProduct(productId: string, max = 20): Promise<Review[]> {
  const rows = await listApprovedReviews(200);
  return rows.filter((r) => r.productId === productId).slice(0, max);
}

/** Admin: every review, newest first. */
export async function listAllReviews(): Promise<Review[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => normalize(d.id, d.data() as Record<string, unknown>));
}

/** Admin: approve / reject. */
export async function setReviewStatus(
  id: string,
  status: ReviewStatus,
  adminUid: string,
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status,
    reviewedAt: Timestamp.now(),
    reviewedBy: adminUid || 'admin',
  });
}

/** Admin: hard delete. */
export async function deleteReview(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export function averageRating(rows: Review[]): number {
  if (!rows.length) return 0;
  return Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10;
}
