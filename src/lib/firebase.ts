// Firebase Configuration
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken as getAppCheckToken, type AppCheck } from 'firebase/app-check';

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  sendPasswordResetEmail,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  User as FirebaseUser,
} from 'firebase/auth';
import { checkLockout, recordFailure, clearFailures, formatRemaining } from '@/lib/login-lockout';
import { getStorage, ref as storageRef, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata } from 'firebase/storage';
import { logAuthEvent, logAuthFailure } from '@/lib/auth-events';
import { clearStoreCachesForNewBuild } from '@/lib/build-cache';
// Email template builders are dynamically imported inside their send-helpers
// (sendWelcomeEmail / sendOrderStatusEmail / processReferralReward) so the
// large HTML template strings don't ship in the home/PDP bundles.
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  getDocsFromServer,
  orderBy,
  limit,
  Timestamp,
  deleteDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB5sWYCTkzeFFup0mqyg3PzCIzjP2oGJdM",
  // Custom auth domain — phlabs.co.uk jest proxy'owane przez Cloudflare
  // Worker do prohealthpeptides-a0808.firebaseapp.com (zob. src/server.ts).
  // Mimo proxy, domena MUSI być dodana w Firebase Console → Authentication →
  // Settings → Authorized domains. W Google Cloud OAuth 2.0 Client dodaj
  // https://phlabs.co.uk jako Authorized JavaScript origin oraz
  // https://phlabs.co.uk/__/auth/handler jako redirect URI.
  authDomain: "phlabs.co.uk",
  projectId: "prohealthpeptides-a0808",
  storageBucket: "prohealthpeptides-a0808.firebasestorage.app",
  messagingSenderId: "1070409753291",
  appId: "1:1070409753291:web:8bf1e58130fbe23e66f14e",
  measurementId: "G-L8X0591XKB"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// App Check — reCAPTCHA Enterprise provider
// Debug token only injected in DEV builds when explicitly provided via
// VITE_APPCHECK_DEBUG_TOKEN (.env.local). Never hardcode tokens in source.
if (import.meta.env.DEV && typeof self !== 'undefined') {
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  if (debugToken) {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
}

let appCheckInitialised = false;
let appCheckInstance: AppCheck | null = null;
let appCheckTokenPromise: Promise<void> | null = null;
const appCheckReadyCallbacks: Array<() => void> = [];

const initAppCheck = () => {
  if (appCheckInitialised) return;
  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider('6LfsNictAAAAAP7R0Whd51frVgUToe9G1RaQ4h84'),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialised = true;
    appCheckReadyCallbacks.forEach(cb => cb());
    appCheckReadyCallbacks.length = 0;
  } catch { /* already initialised on HMR reload */ }
};

// Lazy init — App Check is ONLY required for sensitive writes (auth, orders,
// mail) where Firestore rules check App Check tokens. Catalogue / product /
// policy pages read with `allow read: if true` and do not need App Check.
// Loading reCAPTCHA Enterprise (~375KB script + iframe) was the single biggest
// blocker of FCP across the site, so we now defer it until ensureAppCheck()
// is explicitly called from Register/Login/Checkout/Contact flows.
export function ensureAppCheck() {
  if (typeof window === 'undefined') return;
  if (!appCheckInitialised) initAppCheck();
}

/**
 * Await App Check until it has actually fetched a token from reCAPTCHA
 * Enterprise. MUST be awaited before any Firebase Auth / Firestore write
 * that goes through App Check enforcement — otherwise the very first call
 * after init races the reCAPTCHA script load and is sent without a token,
 * which Firebase rejects with `auth/firebase-app-check-token-is-invalid`
 * (or `permission-denied` for Firestore).
 *
 * Safe to call repeatedly — the underlying token fetch is memoised.
 */
export async function ensureAppCheckReady(): Promise<void> {
  if (typeof window === 'undefined') return;
  try { ensureAppCheck(); } catch (e) { console.warn('[AppCheck] init failed:', e); return; }
  if (!appCheckInstance) return;
  if (!appCheckTokenPromise) {
    appCheckTokenPromise = getAppCheckToken(appCheckInstance, /* forceRefresh */ false)
      .then(() => undefined)
      .catch((e) => {
        appCheckTokenPromise = null;
        console.warn('[AppCheck] initial token fetch failed:', e);
      });
  }
  // Never block auth/login longer than 4s — if reCAPTCHA Enterprise is blocked
  // by CSP / network / ad-blocker, the user must still be able to sign in.
  // Firebase Auth + Firestore rules still validate the request.
  await Promise.race([
    appCheckTokenPromise,
    new Promise<void>((resolve) => setTimeout(() => {
      console.warn('[AppCheck] token fetch timed out after 4s — proceeding without token');
      resolve();
    }, 4000)),
  ]);
}

export function onAppCheckReady(cb: () => void) {
  if (appCheckInitialised) { cb(); return; }
  appCheckReadyCallbacks.push(cb);
  // Auto-init when someone subscribes so existing callers still get a token.
  ensureAppCheck();
}


export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

const normaliseAuthEmail = (email: string) => email.trim().toLowerCase();


// ==================== TYPES ====================

export interface User {
  uid: string;
  email: string;
  createdAt?: Timestamp;
  displayName?: string;
  isAdmin?: boolean;
  role?: string;
  shippingAddress?: string;
  billingAddress?: string;
  loyaltyCredits?: number;
  isActive?: boolean;
  lastLoginAt?: Timestamp;
  totalSpend?: number;
  totalOrders?: number;
  // ── Referral Programme ──────────────────────────────
  referralCode?: string;       // unique code, e.g. REF-ABC123
  referredBy?: string;         // referralCode of the person who invited this user
  referralBalance?: number;    // £ earned from referrals (default 0)
  referralRewardClaimed?: boolean; // true once the new user's own £5 welcome bonus is granted
  referralCount?: number;      // how many people signed up using this user's code
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  variantId?: string;
  variantName?: string;
  sku?: string;
}

export interface Order {
  id: string;
  orderId: string;
  userId: string | null;
  userEmail?: string;
  userName?: string;
  customer?: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    postcode: string;
    country: string;
  };
  items: OrderItem[];
  subtotal?: number;
  discount?: number;
  shippingCost?: number;
  shippingMethod?: string;
  shippingLabel?: string;
  total: number;
  totalAmount: number;
  paymentMethod?: string;
  status: 'pending' | 'pending_payment' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  orderDate: Timestamp;
  createdAt?: Timestamp;
  shippingAddress?: string;
  billingAddress?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  courier?: string;
  notes?: string;
  couponCode?: string;
  discountAmount?: number;
  bankTransferReference?: string;
}

export interface Product {
  id: string;
  slug?: string;
  name: string;
  description: string;
  // price stored as number internally; DB may have string "£57.99" — normalise on read
  price: number;
  category?: string;
  sku?: string;
  // stock as number; DB legacy field 'inStock' (boolean) is normalised on read
  stock: number;
  lowStockThreshold?: number;
  // primary image — maps to DB field 'imageUrl'
  imageUrl?: string;
  // also support array form for future multi-image
  images?: string[];
  // dosage string, e.g. "10 mg"
  dosage?: string;
  tags?: string[];
  isActive?: boolean;
  visibility?: 'active' | 'hidden' | 'out_of_stock';
  displayOrder?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  supplierEmail?: string;
  variants?: ProductVariant[];
  weight?: number;
  purity?: string;
  // Product manual PDF (uploaded to Firebase Storage)
  productManualUrl?: string;
  productManualName?: string;
  // Product promo banner image (uploaded to Firebase Storage)
  bannerImageUrl?: string;
  // Mark product as popular — shows badge on product cards
  popular?: boolean;
  // Research confirmation gate — show modal before add-to-cart on this product
  requiresResearchGate?: boolean;
  // SEO — exclude this product from sitemap.xml
  excludeFromSitemap?: boolean;
  // Manual merchant-feed controls used by Google/Bing feed generation.
  includeInMerchantFeed?: boolean;
  excludeFromMerchantFeed?: boolean;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price?: number;
  imageIndex?: number; // 0-based index into product.images[] — which photo this variant shows
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minOrderValue?: number;
  // Support both naming conventions
  maxUses?: number;
  maxUsage?: number;
  usedCount?: number;
  usageCount?: number;
  expiryDate: Timestamp;
  isActive: boolean;
  createdAt: Timestamp;
  description?: string;
}

export interface ActivityEvent {
  id: string;
  type: 'order' | 'signup' | 'review' | 'stock_alert' | 'coupon_used';
  message: string;
  timestamp: Timestamp;
  userId?: string;
  orderId?: string;
  productId?: string;
  metadata?: Record<string, any>;
}

// ==================== AUTH ====================

// ==================== EMAIL HELPERS ====================

/** Send any transactional email via Firebase Trigger Email extension (mail collection) */
export const sendTransactionalEmail = async (to: string, subject: string, html: string, text?: string) => {
  try {
    await addDoc(collection(db, 'mail'), {
      to,
      message: {
        subject,
        html,
        text: text || subject,
      },
      createdAt: Timestamp.now(),
    });
  } catch (e) {
    console.error('Email send failed:', e);
  }
};

/** Welcome email on account creation */
export const sendWelcomeEmail = async (email: string, firstName: string) => {
  const { buildWelcomeEmail } = await import('@/templates/welcomeEmail');
  const html = buildWelcomeEmail({ firstName, email });
  await sendTransactionalEmail(email, 'Welcome to PH Labs — Your Account is Ready', html);
};

/** Order status update email */
export const sendOrderStatusEmail = async (
  email: string,
  firstName: string,
  orderId: string,
  status: string,
  trackingNumber?: string,
  trackingUrl?: string,
  courierName?: string,
  estimatedDelivery?: string,
  items?: Array<{ name: string; variantName?: string; quantity: number; priceNum: number }>,
  totalAmount?: number,
) => {
  const validStatus = status as 'processing' | 'shipped' | 'delivered' | 'canceled' | 'paid' | 'refunded';
  const { buildOrderStatusEmail } = await import('@/templates/orderStatusEmail');
  const html = buildOrderStatusEmail({
    firstName,
    email,
    orderId,
    status: validStatus,
    trackingNumber,
    trackingUrl,
    courierName,
    estimatedDelivery,
    items,
    totalAmount,
  });
  const shortId = orderId.slice(-8).toUpperCase();
  const subjects: Record<string, string> = {
    processing: `Order #${shortId} — Now Being Processed`,
    shipped: `Order #${shortId} — On Its Way!`,
    delivered: `Order #${shortId} — Delivered`,
    canceled: `Order #${shortId} — Cancelled`,
    paid: `Order #${shortId} — Payment Confirmed`,
    refunded: `Order #${shortId} — Refund Processed`,
  };
  const subject = subjects[status] || `Order #${shortId} — Status Update`;
  await sendTransactionalEmail(email, subject, html);
};

// ==================== AUTH ====================

// ── Referral Programme helpers ─────────────────────────────
/** Generates a unique referral code like REF-X4K9M2 */
const generateReferralCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'REF-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

/** Look up a customer document by their referralCode field */
export const getCustomerByReferralCode = async (code: string): Promise<{ id: string; data: User } | null> => {
  try {
    const q = query(collection(db, 'customers'), where('referralCode', '==', code));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, data: snap.docs[0].data() as User };
  } catch {
    return null;
  }
};

/** Returns the referral code stored in localStorage (set during registration) */
export const getStoredReferralCode = (): string | null =>
  typeof localStorage !== 'undefined' ? localStorage.getItem('referrer_code') : null;

export const clearStoredReferralCode = (): void => {
  if (typeof localStorage !== 'undefined') localStorage.removeItem('referrer_code');
};

/**
 * processReferralReward — called after every completed order.
 * Rules:
 *   1. If the buyer has NOT yet claimed their welcome £5 AND has a referredBy code
 *      AND their totalSpend >= 50 → grant buyer £5 and mark referralRewardClaimed
 *   2. Always credit the referrer £5 when the buyer's first eligible order completes.
 *      (Uses referralRewardClaimed as sentinel — referrer gets credited exactly once per referral)
 */
export const processReferralReward = async (
  buyerUid: string,
  newTotalSpend: number
): Promise<void> => {
  try {
    const buyerRef = doc(db, 'customers', buyerUid);
    const buyerSnap = await getDoc(buyerRef);
    if (!buyerSnap.exists()) return;
    const buyer = buyerSnap.data() as User;

    const hasReferrer  = !!buyer.referredBy;
    const alreadyClaimed = buyer.referralRewardClaimed === true;
    const thresholdMet = newTotalSpend >= 50;

    if (!hasReferrer || alreadyClaimed || !thresholdMet) return;

    // Mark as claimed (sentinel — prevents double processing)
    await updateDoc(buyerRef, { referralRewardClaimed: true });

    // ── Credit the REFERRER with £5 ───────────────────────────
    const referrerResult = await getCustomerByReferralCode(buyer.referredBy!);
    if (referrerResult) {
      const referrerRef = doc(db, 'customers', referrerResult.id);
      const referrerData = referrerResult.data;
      await updateDoc(referrerRef, {
        referralBalance: (referrerData.referralBalance || 0) + 5,
        referralCount: (referrerData.referralCount || 0) + 1,
      });

      // Notify referrer by email
      if (referrerData.email) {
        const referrerFirstName = referrerData.displayName?.split(' ')[0] || 'there';
        const { buildReferralRewardEmail } = await import('@/templates/referralRewardEmail');
        const html = buildReferralRewardEmail({
          firstName: referrerFirstName,
          newReferralBalance: (referrerData.referralBalance || 0) + 5,
          referralCount: (referrerData.referralCount || 0) + 1,
        });
        await sendTransactionalEmail(
          referrerData.email,
          'You earned GBP5 — someone you referred just made their first purchase!',
          html
        ).catch(console.error);
      }
    }
  } catch (e) {
    console.error('processReferralReward error:', e);
  }
};

export const registerUser = async (
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  referredByCode?: string,
  phone?: string,
  tcAccepted?: boolean,
) => {
  await ensureAppCheckReady();
  const cleanEmail = normaliseAuthEmail(email);
  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  } catch (err) {
    
    logAuthFailure('register_failure', err, { email: cleanEmail });
    throw err;
  }

  const user = userCredential.user;
  const referralCode = generateReferralCode();
  const now = Timestamp.now();
  await setDoc(doc(db, 'customers', user.uid), {
    uid: user.uid,
    email: cleanEmail,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    ...(phone ? { phone } : {}),
    termsAccepted: tcAccepted ?? false,
    termsAcceptedAt: tcAccepted ? now : null,
    createdAt: now,
    isActive: true,
    loyaltyCredits: 0,
    totalSpend: 0,
    totalOrders: 0,
    referralCode,
    referralBalance: 0,
    referralRewardClaimed: false,
    referralCount: 0,
    ...(referredByCode ? { referredBy: referredByCode } : {}),
  });
  // Send welcome email
  await sendWelcomeEmail(cleanEmail, firstName).catch(console.error);
  // Send email verification
  await sendEmailVerification(user);
  await logActivity({ type: 'signup', message: `New user registered: ${cleanEmail}`, userId: user.uid });
  
  logAuthEvent({ type: 'register_success', email: cleanEmail, uid: user.uid });
  return userCredential;
};

export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
    
    logAuthEvent({ type: 'password_reset_request', email });
  } catch (err) {
    
    logAuthFailure('password_reset_failure', err, { email });
    throw err;
  }
};


export class LockoutError extends Error {
  remainingMs: number;
  constructor(remainingMs: number) {
    super(`Account locked. Try again in ${formatRemaining(remainingMs)}`);
    this.name = 'LockoutError';
    this.remainingMs = remainingMs;
    (this as any).code = 'auth/account-locked';
  }
}

export const loginUser = async (email: string, password: string) => {
  const cleanEmail = normaliseAuthEmail(email);

  // Pre-check lockout (item B)
  const lock = await checkLockout(cleanEmail);
  if (lock.locked) {
    logAuthFailure('login_failure', { code: 'auth/account-locked', message: 'locked' }, { email: cleanEmail });
    throw new LockoutError(lock.remainingMs);
  }

  let userCredential;
  try {
    userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
  } catch (err: any) {
    if (
      err?.code === 'auth/wrong-password' ||
      err?.code === 'auth/user-not-found' ||
      err?.code === 'auth/invalid-credential' ||
      err?.code === 'auth/invalid-login-credentials'
    ) {
      const state = await recordFailure(cleanEmail);
      if (state.locked) {
        logAuthFailure('login_failure', { code: 'auth/account-locked', message: 'locked-after-failure' }, { email: cleanEmail });
        throw new LockoutError(state.remainingMs);
      }
    }
    logAuthFailure('login_failure', err, { email: cleanEmail });
    throw err;
  }

  // Successful login — clear failure counter
  await clearFailures(cleanEmail);

  try {
    const customerRef = doc(db, 'customers', userCredential.user.uid);
    const snap = await getDoc(customerRef);
    if (snap.exists()) {
      await updateDoc(customerRef, { lastLoginAt: Timestamp.now() });
    } else {
      await setDoc(customerRef, {
        uid: userCredential.user.uid,
        email: userCredential.user.email || cleanEmail,
        firstName: '',
        lastName: '',
        displayName: userCredential.user.email || cleanEmail,
        createdAt: Timestamp.now(),
        lastLoginAt: Timestamp.now(),
        isActive: true,
        loyaltyCredits: 0,
        totalSpend: 0,
        totalOrders: 0,
        referralCode: generateReferralCode(),
        referralBalance: 0,
        referralRewardClaimed: false,
        referralCount: 0,
      });
    }
  } catch { /* doc may not exist yet */ }
  
  logAuthEvent({ type: 'login_success', email: cleanEmail, uid: userCredential.user.uid });
  return userCredential;
};

/**
 * Session persistence helper (item E).
 * `remember=true` → browserLocalPersistence (survives tab close).
 * `remember=false` → browserSessionPersistence (cleared on tab close — default).
 * Call BEFORE signInWithEmailAndPassword / signInWithPopup / createUserWithEmailAndPassword.
 *
 * The user's choice is persisted in localStorage under `php_auth_remember`
 * so it survives full page reloads — otherwise the app-init default below
 * would silently downgrade a "Remember me" session back to session-only on
 * the next refresh, signing the user out as soon as they closed the tab.
 */
const REMEMBER_KEY = 'php_auth_remember';
export const setAuthPersistence = async (remember: boolean) => {
  try {
    if (typeof window !== 'undefined') {
      if (remember) window.localStorage.setItem(REMEMBER_KEY, '1');
      else window.localStorage.removeItem(REMEMBER_KEY);
    }
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  } catch (e) {
    console.warn('[auth] setPersistence failed:', e);
  }
};

// Apply the user's last "Remember me" choice on app init. Default is
// session-only when no prior choice exists. Without this, every page load
// would reset persistence to session-only and override a prior opt-in.
if (typeof window !== 'undefined') {
  const remembered = (() => {
    try { return window.localStorage.getItem(REMEMBER_KEY) === '1'; }
    catch { return false; }
  })();
  setPersistence(auth, remembered ? browserLocalPersistence : browserSessionPersistence).catch(() => {});
}

export const logoutUser = async () => {
  const current = auth.currentUser;
  try { window.localStorage.removeItem(REMEMBER_KEY); } catch { /* ignore */ }
  logAuthEvent({ type: 'logout', email: current?.email ?? null, uid: current?.uid ?? null });
  return signOut(auth);
};
export const onAuthChange = (callback: (user: FirebaseUser | null) => void) =>
  onAuthStateChanged(auth, callback);

// ── Google SSO ──────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Mobile / in-app browsers handle popups badly — use redirect instead.
const shouldUseRedirect = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua);
  const isInApp = /FBAN|FBAV|Instagram|Line|WeChat|MicroMessenger|TikTok|Snapchat/i.test(ua);
  const isSmall = window.innerWidth < 768;
  return isMobile || isInApp || isSmall;
};

// Upsert customer profile after Google sign-in (used by popup + redirect flow).
const upsertGoogleCustomer = async (user: FirebaseUser) => {
  const customerRef = doc(db, 'customers', user.uid);
  const snap = await getDoc(customerRef);
  if (!snap.exists()) {
    const nameParts = (user.displayName || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const referralCode = generateReferralCode();
    const storedRef = getStoredReferralCode();
    await setDoc(customerRef, {
      uid: user.uid,
      email: user.email || '',
      firstName,
      lastName,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      createdAt: Timestamp.now(),
      isActive: true,
      loyaltyCredits: 0,
      totalSpend: 0,
      totalOrders: 0,
      provider: 'google',
      referralCode,
      referralBalance: 0,
      referralRewardClaimed: false,
      referralCount: 0,
      ...(storedRef ? { referredBy: storedRef } : {}),
    });
    if (storedRef) clearStoredReferralCode();
    await sendWelcomeEmail(user.email || '', firstName).catch(console.error);
    await logActivity({ type: 'signup', message: `New Google user: ${user.email}`, userId: user.uid });
  } else {
    await updateDoc(customerRef, { lastLoginAt: Timestamp.now() });
  }
  logAuthEvent({ type: 'google_success', email: user.email ?? null, uid: user.uid });
};

export const signInWithGoogle = async () => {
  // Mobile → redirect flow (popups are unreliable / blocked on mobile browsers).
  if (shouldUseRedirect()) {
    try {
      sessionStorage.setItem('phlabs_google_redirect_pending', '1');
    } catch {}
    await signInWithRedirect(auth, googleProvider);
    // Page will navigate away; nothing more to do.
    return null as any;
  }

  let result;
  try {
    result = await signInWithPopup(auth, googleProvider);
  } catch (err) {
    logAuthFailure('google_failure', err);
    throw err;
  }
  await upsertGoogleCustomer(result.user);
  return result;
};

// Handle the redirect result on app load. Call once from app bootstrap.
export const completeGoogleRedirect = async (): Promise<FirebaseUser | null> => {
  try {
    const pending = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('phlabs_google_redirect_pending')
      : null;
    const result = await getRedirectResult(auth);
    if (result?.user) {
      try { sessionStorage.removeItem('phlabs_google_redirect_pending'); } catch {}
      await upsertGoogleCustomer(result.user);
      return result.user;
    }
    if (pending) {
      try { sessionStorage.removeItem('phlabs_google_redirect_pending'); } catch {}
    }
    return null;
  } catch (err) {
    try { sessionStorage.removeItem('phlabs_google_redirect_pending'); } catch {}
    logAuthFailure('google_failure', err);
    return null;
  }
};



export const getUserProfile = async (uid: string): Promise<User | null> => {
  const docSnap = await getDoc(doc(db, 'customers', uid));
  return docSnap.exists() ? ({ uid: docSnap.id, ...docSnap.data() } as User) : null;
};

// ==================== USERS (ADMIN) ====================

export const getAllUsers = async (): Promise<User[]> => {
  // No orderBy to avoid requiring Firestore composite index — sort client-side
  const snap = await getDocs(collection(db, 'customers'));
  const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as User));
  return users.sort((a: any, b: any) => (a.email || '').localeCompare(b.email || ''));
};

export const updateUserRole = async (uid: string, role: string) => {
  await updateDoc(doc(db, 'customers', uid), { role });
};

export const deactivateUser = async (uid: string) => {
  await updateDoc(doc(db, 'customers', uid), { isActive: false });
};

export const activateUser = async (uid: string) => {
  await updateDoc(doc(db, 'customers', uid), { isActive: true });
};

export const addLoyaltyCredits = async (uid: string, credits: number) => {
  const userRef = doc(db, 'customers', uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const current = snap.data().loyaltyCredits || 0;
    await updateDoc(userRef, { loyaltyCredits: current + credits });
  }
};

export const subscribeToUsers = (callback: (users: User[]) => void) => {
  return onSnapshot(collection(db, 'customers'), (snap) => {
    const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as User));
    callback(users.sort((a: any, b: any) => (a.email || '').localeCompare(b.email || '')));
  });
};

// ==================== PRODUCTS / INVENTORY ====================

// The real Firestore collection is 'product_stock'
const PRODUCTS_COL = 'product_stock';

function productNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()[\]]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Normalise a raw Firestore document to the Product type
function normaliseProduct(id: string, data: any): Product {
  // price may be stored as a string like "£57.99"
  let price = data.price;
  if (typeof price === 'string') {
    price = parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
  }

  // stock may be stored as boolean 'inStock' OR number 'stock'
  let stock: number;
  if (typeof data.stock === 'number') {
    stock = data.stock;
  } else if (typeof data.inStock === 'boolean') {
    stock = data.inStock ? 99 : 0;
  } else {
    stock = 0;
  }

  // imageUrl may be a string OR images[] array
  const imageUrl: string = data.imageUrl || data.images?.[0] || '';

  // Ensure images array is always populated from Firestore
  let images: string[] = [];
  if (Array.isArray(data.images) && data.images.length > 0) {
    images = data.images.filter((img: any) => typeof img === 'string' && img.trim());
  }
  // Fallback: if no images array but imageUrl exists, use it
  if (images.length === 0 && imageUrl) {
    images = [imageUrl];
  }

  // Build variants from dosage if no explicit variants array
  let variants: ProductVariant[] = data.variants || [];
  if (variants.length === 0 && data.dosage) {
    variants = [{ id: 'v1', name: data.dosage, sku: data.sku || id, stock, price }];
  } else if (variants.length === 0) {
    variants = [{ id: 'v1', name: 'Standard', sku: data.sku || id, stock, price }];
  }

  return {
    id,
    slug: data.slug || productNameToSlug(data.name || ''),
    name: data.name || '',
    description: data.description || '',
    price,
    stock,
    imageUrl,
    images,
    dosage: data.dosage || '',
    category: data.category || 'metabolic',
    sku: data.sku || id,
    purity: data.purity || '99%+',
    isActive: data.isActive !== false,
    visibility: data.visibility || (stock === 0 ? 'out_of_stock' : 'active'),
    displayOrder: data.displayOrder ?? 999,
    lowStockThreshold: data.lowStockThreshold ?? 10,
    variants,
    tags: data.tags || [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    includeInMerchantFeed: data.includeInMerchantFeed === true,
    excludeFromMerchantFeed: data.excludeFromMerchantFeed === true,
    
    bannerImageUrl: data.bannerImageUrl || '',
  };
}

const PRODUCTS_CACHE_KEY = 'php_products_cache_v1';
const PRODUCTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function readCachedProducts(): Product[] | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; products: Product[] };
    if (parsed && Date.now() - parsed.ts < PRODUCTS_CACHE_TTL && Array.isArray(parsed.products)) {
      return parsed.products;
    }
  } catch { /* ignore cache errors */ }
  return null;
}

function writeCachedProducts(products: Product[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), products }));
    }
  } catch { /* ignore quota errors */ }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getAllProducts = async (): Promise<Product[]> => {
  clearStoreCachesForNewBuild();
  const cachedFallback = readCachedProducts();
  const q = query(collection(db, PRODUCTS_COL), limit(300));

  // Firestore is authoritative on every page load. Do not return localStorage
  // first; stale product caches after publish caused "0 compounds" on staging.
  // getDocsFromServer bypasses the SDK's local persistence cache; if the first
  // backend read fails, retry once after 2s before falling back to saved data.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const snap = await getDocsFromServer(q);
      const products = snap.docs.map((d) => normaliseProduct(d.id, d.data()));
      if (products.length > 0) writeCachedProducts(products);
      return products;
    } catch (e) {
      if (attempt === 0) {
        await wait(2000);
        continue;
      }
      console.warn('getAllProducts error after retry:', e);
    }
  }

  return cachedFallback ?? [];
};

export const subscribeToProducts = (
  callback: (products: Product[]) => void,
  onError?: (err: Error) => void
) => {
  return onSnapshot(collection(db, PRODUCTS_COL), (snap) => {
    const products = snap.docs.map((d) => normaliseProduct(d.id, d.data()));
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), products }));
      }
    } catch { /* ignore quota errors */ }
    callback(products);
  }, (err) => {
    console.warn('subscribeToProducts error:', err);
    callback([]);
    onError?.(err);
  });
};

export const addProduct = async (product: Omit<Product, 'id'>) => {
  const data = {
    slug: product.slug || productNameToSlug(product.name),
    name: product.name,
    description: product.description,
    price: product.price,
    stock: product.stock,
    imageUrl: product.imageUrl || product.images?.[0] || '',
    images: product.images || [],
    dosage: product.dosage || '',
    category: product.category || 'metabolic',
    sku: product.sku || '',
    purity: product.purity || '99%+',
    isActive: product.isActive !== false,
    visibility: product.visibility || 'active',
    displayOrder: product.displayOrder ?? 999,
    lowStockThreshold: product.lowStockThreshold ?? 10,
    variants: product.variants || [],
    tags: product.tags || [],
    includeInMerchantFeed: product.includeInMerchantFeed === true,
    excludeFromMerchantFeed: product.excludeFromMerchantFeed === true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const ref = await addDoc(collection(db, PRODUCTS_COL), data);
  invalidateProductsCache();
  triggerCdnInvalidation({ slug: data.slug, category: data.category });

  return ref.id;
};


function invalidateProductsCache() {
  try {
    if (typeof window !== 'undefined') localStorage.removeItem(PRODUCTS_CACHE_KEY);
  } catch { /* ignore */ }
}

/**
 * Fire-and-forget: ping the server fn that purges Cloudflare cache and
 * recaches Prerender.io snapshots for product URLs. Never throws — cache
 * invalidation must never break a successful Firestore write.
 *
 * Dynamically imported so the server-fn RPC stub doesn't load on cold
 * customer-facing reads.
 */
function triggerCdnInvalidation(opts: { slug?: string; slugs?: string[]; category?: string } = {}) {
  if (typeof window === 'undefined') return;
  void (async () => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;
      const { invalidateProductCache } = await import('./cache-invalidate.functions');
      await invalidateProductCache({ data: { ...opts, idToken } }).catch((e) => {
        console.warn('[cache-invalidate] failed:', e);
      });
    } catch { /* ignore */ }
  })();
}

/**
 * Fire-and-forget content cache invalidation (banners, articles, policies,
 * landing pages, sitemap, robots). Always safe to call after any content
 * write — never throws. Pass site-relative paths affected by the change.
 */
export function triggerContentCdnInvalidation(paths: string[] = []) {
  if (typeof window === 'undefined') return;
  void (async () => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) return;
      const { invalidateContentCache } = await import('./cache-invalidate.functions');
      await invalidateContentCache({ data: { paths, idToken } }).catch((e) => {
        console.warn('[cache-invalidate content] failed:', e);
      });
    } catch { /* ignore */ }
  })();
}




export const updateProduct = async (id: string, updates: Partial<Product>) => {
  let existing: Product | null = null;
  try {
    const snap = await getDoc(doc(db, PRODUCTS_COL, id));
    if (snap.exists()) existing = normaliseProduct(id, snap.data());
  } catch { /* best-effort cache targeting */ }

  // Ensure images array is preserved and properly formatted
  const data: any = { ...updates, updatedAt: Timestamp.now() };

  // Validate and clean images array
  if (updates.images !== undefined) {
    data.images = (updates.images || []).filter((img: any) => typeof img === 'string' && img.trim());
  }

  // Keep imageUrl in sync with images array
  if (data.images && data.images.length > 0 && !updates.imageUrl) {
    data.imageUrl = data.images[0];
  }

  // Ensure variants are properly saved
  if (updates.variants !== undefined) {
    data.variants = updates.variants || [];
  }

  // Ensure bannerImageUrl is preserved
  if (updates.bannerImageUrl !== undefined) {
    data.bannerImageUrl = updates.bannerImageUrl || '';
  }


  // Firestore rejects `undefined` field values — strip them recursively so
  // partial updates (e.g. editing a single field) never explode.
  const stripUndefined = (val: any): any => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (Array.isArray(val)) {
      return val.map(stripUndefined).filter((v) => v !== undefined);
    }
    if (val && typeof val === 'object' && !(val instanceof Date) && typeof (val as any).toDate !== 'function') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        const cleaned = stripUndefined(v);
        if (cleaned !== undefined) out[k] = cleaned;
      }
      return out;
    }
    return val;
  };
  const cleanData = stripUndefined(data) ?? {};

  await updateDoc(doc(db, PRODUCTS_COL, id), cleanData);
  invalidateProductsCache();
  const nextSlug = (updates as any).slug || existing?.slug || (updates.name ? productNameToSlug(updates.name) : undefined);
  const nextCategory = (updates as any).category || existing?.category;
  const slugs = Array.from(new Set([existing?.slug, nextSlug].filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)));
  triggerCdnInvalidation({
    slug: nextSlug,
    slugs,
    category: nextCategory,
  });
};

export const deleteProduct = async (id: string) => {
  let existing: Product | null = null;
  try {
    const snap = await getDoc(doc(db, PRODUCTS_COL, id));
    if (snap.exists()) existing = normaliseProduct(id, snap.data());
  } catch { /* best-effort cache targeting */ }
  await deleteDoc(doc(db, PRODUCTS_COL, id));
  invalidateProductsCache();
  triggerCdnInvalidation({ slug: existing?.slug, category: existing?.category });
};

export const bulkUpdateProducts = async (updates: { id: string; stock?: number; price?: number }[]) => {
  const batch = writeBatch(db);
  updates.forEach(({ id, stock, price }) => {
    const ref = doc(db, PRODUCTS_COL, id);
    const data: any = { updatedAt: Timestamp.now() };
    if (stock !== undefined) data.stock = stock;
    if (price !== undefined) data.price = price;
    batch.update(ref, data);
  });
  await batch.commit();
  invalidateProductsCache();
  triggerCdnInvalidation();
};



export const getLowStockProducts = async (threshold?: number): Promise<Product[]> => {
  const products = await getAllProducts();
  return products.filter((p) => p.stock <= (threshold ?? p.lowStockThreshold ?? 10));
};

// ==================== ORDERS ====================

export const createOrder = async (
  userId: string,
  items: OrderItem[],
  shippingAddress: string,
  billingAddress: string
): Promise<string> => {
  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Atomic stock deduction
  await runTransaction(db, async (transaction) => {
    for (const item of items) {
      if (item.productId) {
        const productRef = doc(db, PRODUCTS_COL, item.productId);
        const productSnap = await transaction.get(productRef);
        if (productSnap.exists()) {
          const currentStock = productSnap.data().stock || 0;
          if (currentStock < item.quantity) {
            throw new Error(`Insufficient stock for ${item.productName}`);
          }
          transaction.update(productRef, { stock: currentStock - item.quantity });
        }
      }
    }
  });

  const userSnap = await getDoc(doc(db, 'customers', userId));
  const userData = userSnap.data();

  const orderRef = await addDoc(collection(db, 'orders'), {
    userId,
    userEmail: userData?.email || '',
    userName: userData?.displayName || `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim(),
    items,
    totalAmount,
    status: 'pending',
    orderDate: Timestamp.now(),
    shippingAddress,
    billingAddress,
  });

  // Update customer stats
  if (userSnap.exists()) {
    const current = userSnap.data();
    await updateDoc(doc(db, 'customers', userId), {
      totalSpend: (current.totalSpend || 0) + totalAmount,
      totalOrders: (current.totalOrders || 0) + 1,
    });
  }

  await logActivity({
    type: 'order',
    message: `New order placed: £${totalAmount.toFixed(2)}`,
    userId,
    orderId: orderRef.id,
  });

  return orderRef.id;
};

// Helper to sort orders client-side by any available date field
const sortOrdersByDate = (orders: Order[]): Order[] =>
  orders.sort((a: any, b: any) => {
    const aTime = a.orderDate?.seconds || a.createdAt?.seconds || 0;
    const bTime = b.orderDate?.seconds || b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

export const getAllOrders = async (): Promise<Order[]> => {
  try {
    const q = query(collection(db, 'orders'), orderBy('orderDate', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
  } catch {
    // Fallback: fetch all without sort (handles missing index or missing field)
    const snap = await getDocs(collection(db, 'orders'));
    return sortOrdersByDate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
  }
};

export const getUserOrders = async (userId: string): Promise<Order[]> => {
  try {
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', userId),
      orderBy('orderDate', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
  } catch {
    // Fallback: filter without sort (handles missing composite index)
    const q2 = query(collection(db, 'orders'), where('userId', '==', userId));
    const snap2 = await getDocs(q2);
    return sortOrdersByDate(snap2.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
  }
};

export const subscribeToOrders = (callback: (orders: Order[]) => void) => {
  try {
    const q = query(collection(db, 'orders'), orderBy('orderDate', 'desc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order)));
    });
  } catch {
    // Fallback snapshot without sort
    return onSnapshot(collection(db, 'orders'), (snap) => {
      callback(sortOrdersByDate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order))));
    });
  }
};

export const updateOrderStatus = async (orderId: string, status: Order['status'], extra?: Partial<Order>) => {
  await updateDoc(doc(db, 'orders', orderId), { status, ...(extra || {}) });
  await logActivity({ type: 'order', message: `Order #${orderId.slice(0, 8)} status → ${status}`, orderId });

  // Send order status email to customer
  try {
    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (orderSnap.exists()) {
      const order = orderSnap.data() as Order;
      const email = order.userEmail;
      const firstName = order.userName?.split(' ')[0] || 'Customer';
      if (email) {
        await sendOrderStatusEmail(
          email,
          firstName,
          orderId,
          status,
          extra?.trackingNumber || order.trackingNumber,
          extra?.trackingUrl || order.trackingUrl
        );
      }

      // ── Referral reward: trigger when order is delivered ──
      if (status === 'delivered' && order.userId) {
        const buyerSnap = await getDoc(doc(db, 'customers', order.userId));
        if (buyerSnap.exists()) {
          const newTotalSpend = buyerSnap.data().totalSpend || 0;
          await processReferralReward(order.userId, newTotalSpend);
        }
      }
    }
  } catch (e) {
    console.error('Status email failed:', e);
  }
};

export const bulkUpdateOrderStatus = async (orderIds: string[], status: Order['status']) => {
  const batch = writeBatch(db);
  orderIds.forEach((id) => batch.update(doc(db, 'orders', id), { status }));
  await batch.commit();
};

// ==================== COUPONS ====================

export const getAllCoupons = async (): Promise<Coupon[]> => {
  const q = query(collection(db, 'coupons'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Coupon));
};

export const subscribeToCoupons = (callback: (coupons: Coupon[]) => void) => {
  const q = query(collection(db, 'coupons'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Coupon)));
  });
};

/**
 * redeemReferralBalance — generates a one-time discount coupon worth the user's
 * referral balance (minimum £30), then resets their balance to 0.
 * Returns the coupon code string.
 */
export const redeemReferralBalance = async (userId: string): Promise<string> => {
  const userRef = doc(db, 'customers', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('User not found');
  const userData = userSnap.data() as User;
  const balance = userData.referralBalance || 0;
  if (balance < 30) throw new Error('Minimum balance of £30 required');

  // Generate unique coupon code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let couponCode = 'REFERRAL-';
  for (let i = 0; i < 8; i++) couponCode += chars[Math.floor(Math.random() * chars.length)];

  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);

  await addDoc(collection(db, 'coupons'), {
    code: couponCode,
    type: 'fixed' as const,
    value: balance,
    description: `Referral reward — £${balance.toFixed(2)} for ${userData.displayName || userData.email}`,
    isActive: true,
    maxUses: 1,
    usedCount: 0,
    minOrderValue: 0,
    expiryDate: Timestamp.fromDate(expiryDate),
    createdAt: Timestamp.now(),
    createdByUid: userId,
    isReferralRedemption: true,
  });

  // Reset the user's referral balance
  await updateDoc(userRef, { referralBalance: 0 });

  // Send email with the coupon code
  if (userData.email) {
    const firstName = userData.displayName?.split(' ')[0] || 'there';
    const { buildReferralRewardEmail } = await import('@/templates/referralRewardEmail');
    const html = buildReferralRewardEmail({
      firstName,
      newReferralBalance: 0,
      couponCode,
      couponValue: balance,
      isRedemption: true,
    });
    await sendTransactionalEmail(
      userData.email,
      `Your £${balance.toFixed(2)} referral discount code is ready`,
      html
    ).catch(console.error);
  }

  return couponCode;
};

export const createCoupon = async (coupon: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'>) => {
  await addDoc(collection(db, 'coupons'), {
    ...coupon,
    usedCount: 0,
    createdAt: Timestamp.now(),
  });
};

export const updateCoupon = async (id: string, updates: Partial<Coupon>) => {
  await updateDoc(doc(db, 'coupons', id), updates);
};

export const deleteCoupon = async (id: string) => {
  await deleteDoc(doc(db, 'coupons', id));
};

export const validateCoupon = async (code: string, orderValue: number): Promise<Coupon | null> => {
  try {
    const q = query(collection(db, 'coupons'), where('code', '==', code.toUpperCase()), where('isActive', '==', true));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() } as Coupon;
    if (coupon.expiryDate?.toDate() < new Date()) return null;
    // Support both maxUses/usedCount AND maxUsage/usageCount naming
    const maxUses = coupon.maxUses ?? coupon.maxUsage;
    const usedCount = coupon.usedCount ?? coupon.usageCount ?? 0;
    if (maxUses && usedCount >= maxUses) return null;
    if (coupon.minOrderValue && orderValue < coupon.minOrderValue) return null;
    return coupon;
  } catch (e) {
    console.error('validateCoupon error:', e);
    return null;
  }
};

/**
 * Atomically increments the coupon usedCount inside a Firestore transaction.
 * Re-validates limits inside the transaction to prevent race conditions where
 * two simultaneous checkouts could both pass the initial validateCoupon check.
 * Returns true on success, false if the coupon is already at its usage limit.
 */
export const redeemCoupon = async (couponId: string): Promise<boolean> => {
  try {
    const couponRef = doc(db, 'coupons', couponId);
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(couponRef);
      if (!snap.exists()) return false;
      const data = snap.data() as Coupon;
      const maxUses = data.maxUses ?? data.maxUsage;
      const used = data.usedCount ?? data.usageCount ?? 0;
      // Re-check inside transaction — prevents race condition
      if (maxUses && used >= maxUses) return false;
      tx.update(couponRef, { usedCount: used + 1 });
      return true;
    });
  } catch (e) {
    console.error('redeemCoupon error:', e);
    return false;
  }
};

// ==================== ACTIVITY FEED ====================

export const logActivity = async (event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
  try {
    await addDoc(collection(db, 'activity'), {
      ...event,
      timestamp: Timestamp.now(),
    });
  } catch {
    // non-blocking
  }
};

export const subscribeToActivity = (callback: (events: ActivityEvent[]) => void, maxItems = 50) => {
  const q = query(collection(db, 'activity'), orderBy('timestamp', 'desc'), limit(maxItems));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityEvent)));
  });
};

// ==================== ANALYTICS ====================

export const getAdminAnalytics = async () => getDashboardAnalytics();

export const getDashboardAnalytics = async () => {
  const [orders, users, products] = await Promise.all([
    getAllOrders(),
    getAllUsers(),
    getAllProducts(),
  ]);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const completedOrders = orders.filter((o) => o.status !== 'cancelled');
  const gmv = completedOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const weeklyOrders = completedOrders.filter(
    (o) => o.orderDate?.toDate() >= weekAgo
  );
  const weeklyRevenue = weeklyOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const monthlyOrders = completedOrders.filter(
    (o) => o.orderDate?.toDate() >= monthAgo
  );
  const monthlyRevenue = monthlyOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const lowStockProducts = products.filter(
    (p) => p.stock <= (p.lowStockThreshold || 10)
  );

  // Category revenue
  const categoryMap: Record<string, { revenue: number; units: number }> = {};
  completedOrders.forEach((o) => {
    o.items?.forEach((item) => {
      if (!categoryMap[item.productName]) categoryMap[item.productName] = { revenue: 0, units: 0 };
      categoryMap[item.productName].revenue += item.price * item.quantity;
      categoryMap[item.productName].units += item.quantity;
    });
  });

  const bestCategory = Object.entries(categoryMap).sort((a, b) => b[1].revenue - a[1].revenue)[0];

  // Revenue by day (last 7 days)
  const revenueByDay = Array.from({ length: 7 }, (_, i) => {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() - (6 - i));
    const dayStr = dayDate.toLocaleDateString('en-GB', { weekday: 'short' });
    const dayStart = new Date(dayDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayDate);
    dayEnd.setHours(23, 59, 59, 999);
    const rev = completedOrders
      .filter((o) => {
        const d = o.orderDate?.toDate();
        return d && d >= dayStart && d <= dayEnd;
      })
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    return { label: dayStr, revenue: rev };
  });

  return {
    gmv,
    weeklyRevenue,
    monthlyRevenue,
    totalOrders: completedOrders.length,
    totalUsers: users.filter((u) => u.role === 'customer' || !u.role).length,
    pendingOrders: orders.filter((o) => o.status === 'pending').length,
    processingOrders: orders.filter((o) => o.status === 'processing').length,
    shippedOrders: orders.filter((o) => o.status === 'shipped').length,
    lowStockProducts,
    bestCategory: bestCategory ? { name: bestCategory[0], ...bestCategory[1] } : null,
    conversionRate:
      users.length > 0
        ? ((completedOrders.length / users.length) * 100).toFixed(1)
        : '0',
    avgOrderValue: completedOrders.length > 0 ? gmv / completedOrders.length : 0,
    revenueByDay,
    allProducts: products,
    allUsers: users,
  };
};

// Legacy function for backwards compatibility
export const saveOrder = async (userId: string, orderData: any) => {
  return createOrder(
    userId,
    orderData.items || [],
    orderData.shippingAddress,
    orderData.billingAddress
  );
};

export { Timestamp, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer, collection, query, where, orderBy, limit, deleteDoc, updateDoc, onSnapshot, writeBatch, runTransaction, addDoc, setDoc, onAuthStateChanged, signInAnonymously, signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendEmailVerification, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, storageRef, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata };
export type { FirebaseUser };

// ==================== FIREBASE STORAGE UPLOADS ====================

export type UploadProgress = { progress: number; url?: string; error?: string };

/**
 * Upload a file to Firebase Storage and return the download URL.
 * @param file        The File object from an <input type="file">
 * @param path        Storage path, e.g. "products/abc123/manual.pdf"
 * @param onProgress  Optional callback with 0–100 progress value
 */
export const uploadFile = (
  file: File,
  path: string,
  onProgress?: (pct: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const fileRef = storageRef(storage, path);
    const task = uploadBytesResumable(fileRef, file);
    task.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(pct);
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
};

/**
 * Delete a file from Firebase Storage by its full download URL.
 * Silently ignores errors (file may already be deleted).
 */
export const deleteStorageFile = async (url: string) => {
  try {
    const fileRef = storageRef(storage, url);
    await deleteObject(fileRef);
  } catch { /* non-blocking */ }
};
