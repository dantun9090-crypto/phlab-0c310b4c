// Firebase Configuration
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
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
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  User as FirebaseUser,
} from 'firebase/auth';
import { getStorage, ref as storageRef, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata } from 'firebase/storage';
// Email template builders are dynamically imported inside their send-helpers
// (sendWelcomeEmail / sendOrderStatusEmail / processReferralReward) so the
// large HTML template strings don't ship in the home/PDP bundles.
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
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
  authDomain: "prohealthpeptides-a0808.firebaseapp.com",
  projectId: "prohealthpeptides-a0808",
  storageBucket: "prohealthpeptides-a0808.firebasestorage.app",
  messagingSenderId: "1070409753291",
  appId: "1:1070409753291:web:8bf1e58130fbe23e66f14e",
  measurementId: "G-L8X0591XKB"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// App Check — reCAPTCHA Enterprise provider
// Debug token only injected in DEV builds — never shipped to production users.
if (import.meta.env.DEV && typeof self !== 'undefined') {
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = '5D028939-E89D-41E9-8391-741947BCD274';
}

let appCheckInitialised = false;
const appCheckReadyCallbacks: Array<() => void> = [];

const initAppCheck = () => {
  if (appCheckInitialised) return;
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider('6LfOsvksAAAAAHfxMJ_DFedEq55DjUafI2w-Urq0'),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialised = true;
    appCheckReadyCallbacks.forEach(cb => cb());
    appCheckReadyCallbacks.length = 0;
  } catch { /* already initialised on HMR reload */ }
};

// Defer App Check init until the browser is idle so the reCAPTCHA Enterprise
// script (~365KB + iframe) doesn't block first paint. Firestore reads that
// need App Check tokens wait via `onAppCheckReady` below.
if (typeof window !== 'undefined') {
  const schedule: (cb: () => void) => void =
    typeof (window as any).requestIdleCallback === 'function'
      ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 2000 })
      : (cb) => setTimeout(cb, 1200);
  schedule(initAppCheck);
} else {
  initAppCheck();
}

export function onAppCheckReady(cb: () => void) {
  if (appCheckInitialised) { cb(); return; }
  appCheckReadyCallbacks.push(cb);
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);


// ==================== TYPES ====================

export interface User {
  uid: string;
  email: string;
  createdAt?: Timestamp;
  displayName?: string;
  isAdmin?: boolean;
  stripeId?: string;
  stripeLink?: string;
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
  status: 'pending' | 'pending_payment' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
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
  // Stripe Price ID — used by Firebase Stripe Extension for checkout
  stripePrice?: string;
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
  await sendTransactionalEmail(email, 'Welcome to Pro Health Peptides — Your Account is Ready', html);
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
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  const referralCode = generateReferralCode();
  const now = Timestamp.now();
  await setDoc(doc(db, 'customers', user.uid), {
    uid: user.uid,
    email,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    ...(phone ? { phone } : {}),
    termsAccepted: tcAccepted ?? false,
    termsAcceptedAt: tcAccepted ? now : null,
    createdAt: now,
    isAdmin: false,
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
  await sendWelcomeEmail(email, firstName).catch(console.error);
  // Send email verification
  await sendEmailVerification(user);
  await logActivity({ type: 'signup', message: `New user registered: ${email}`, userId: user.uid });
  return userCredential;
};

export const resetPassword = async (email: string) => {
  await sendPasswordResetEmail(auth, email);
};

export const loginUser = async (email: string, password: string) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  try {
    await updateDoc(doc(db, 'customers', userCredential.user.uid), { lastLoginAt: Timestamp.now() });
  } catch { /* doc may not exist yet */ }
  return userCredential;
};

export const logoutUser = () => signOut(auth);
export const onAuthChange = (callback: (user: FirebaseUser | null) => void) =>
  onAuthStateChanged(auth, callback);

// ── Google SSO ──────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  // Upsert customer profile — create if first time, update lastLoginAt if returning
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
      isAdmin: false,
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
    // Send welcome email for new Google users
    await sendWelcomeEmail(user.email || '', firstName).catch(console.error);
    await logActivity({ type: 'signup', message: `New Google user: ${user.email}`, userId: user.uid });
  } else {
    await updateDoc(customerRef, { lastLoginAt: Timestamp.now() });
  }
  return result;
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
    stripePrice: data.stripePrice || '',
    bannerImageUrl: data.bannerImageUrl || '',
  };
}

const PRODUCTS_CACHE_KEY = 'php_products_cache_v1';
const PRODUCTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getAllProducts = async (): Promise<Product[]> => {
  // Serve from localStorage cache when fresh — avoids repeated Firestore reads
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts: number; products: Product[] };
        if (parsed && Date.now() - parsed.ts < PRODUCTS_CACHE_TTL && Array.isArray(parsed.products)) {
          return parsed.products;
        }
      }
    }
  } catch { /* ignore cache errors */ }

  try {
    // Cap at 50 products to keep payload small
    const q = query(collection(db, PRODUCTS_COL), limit(50));
    const snap = await getDocs(q);
    const products = snap.docs.map((d) => normaliseProduct(d.id, d.data()));
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), products }));
      }
    } catch { /* ignore quota errors */ }
    return products;
  } catch (e) {
    console.warn('getAllProducts error:', e);
    return [];
  }
};

export const subscribeToProducts = (
  callback: (products: Product[]) => void,
  onError?: (err: Error) => void
) => {
  return onSnapshot(collection(db, PRODUCTS_COL), (snap) => {
    callback(snap.docs.map((d) => normaliseProduct(d.id, d.data())));
  }, (err) => {
    console.warn('subscribeToProducts error:', err);
    callback([]);
    onError?.(err);
  });
};

export const addProduct = async (product: Omit<Product, 'id'>) => {
  const data = {
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
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const ref = await addDoc(collection(db, PRODUCTS_COL), data);
  invalidateProductsCache();
  return ref.id;
};

function invalidateProductsCache() {
  try {
    if (typeof window !== 'undefined') localStorage.removeItem(PRODUCTS_CACHE_KEY);
  } catch { /* ignore */ }
}

export const updateProduct = async (id: string, updates: Partial<Product>) => {
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
  
  // Ensure stripePrice is preserved
  if (updates.stripePrice !== undefined) {
    data.stripePrice = updates.stripePrice || '';
  }
  
  await updateDoc(doc(db, PRODUCTS_COL, id), data);
  invalidateProductsCache();
};

export const deleteProduct = async (id: string) => {
  await deleteDoc(doc(db, PRODUCTS_COL, id));
  invalidateProductsCache();
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

export { Timestamp, doc, getDoc, getDocs, collection, query, where, orderBy, limit, deleteDoc, updateDoc, onSnapshot, writeBatch, runTransaction, addDoc, setDoc, onAuthStateChanged, signInAnonymously, signOut, deleteUser, EmailAuthProvider, reauthenticateWithCredential, updatePassword, sendEmailVerification, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, storageRef, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata };
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
