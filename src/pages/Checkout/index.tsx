import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User as UserIcon, Mail, Phone, MapPin,
  Lock, AlertTriangle, Check, ChevronLeft, Truck,
  Landmark, BadgeCheck, ShoppingCart, Trash2, Plus, Minus,
  CheckCircle2, ChevronRight, Tag, X
} from 'lucide-react';
import {
  auth, signInAnonymously, doc, getDoc,
  updateDoc, db, validateCoupon, redeemCoupon,
  onAuthStateChanged, FirebaseUser, registerUser
} from '@/lib/firebase';
import type { Coupon } from '@/lib/firebase';
import { validateCartPrices } from '@/lib/cart-validation.functions';
import { createOrder } from '@/lib/create-order.functions';
import { createGatewayPaymentLink, getCheckoutPaymentOptions } from '@/lib/payment-gateways.functions';
import type { CheckoutPaymentOptions } from '@/lib/payments/types';
import { migrateStoredCart } from '@/lib/cart-migration';
import { sendPublicMail } from '@/lib/sendPublicMail';
import type { CartItem } from '@/components/Layout';
import UkBankBadges from '@/components/UkBankBadges';
import PaymentMethodOptions from '@/components/PaymentMethodOptions';


interface CheckoutForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  paymentMethod: 'bank_transfer' | 'pay_by_bank';
  acceptedTerms: boolean;
  ageVerified: boolean;
  createAccount: boolean;
  password: string;
  shippingMethod: 'standard' | 'express';
}

const SHIPPING_OPTIONS = [
  { id: 'standard' as const, label: 'Standard Delivery', desc: '3–5 working days', price: 4.99 },
  { id: 'express' as const, label: 'Express Delivery', desc: 'Next working day (order before 2pm)', price: 9.99 },
] as const;

const FREE_SHIPPING_THRESHOLD = 50;

type Step = 1 | 2 | 3;

const STEPS = [
  { id: 1 as Step, label: 'Your Details', icon: UserIcon },
  { id: 2 as Step, label: 'Delivery', icon: Truck },
  { id: 3 as Step, label: 'Payment', icon: Landmark },
];

const inputStyle = (hasError?: boolean): React.CSSProperties => ({
  background: '#0d1f38',
  border: hasError ? '1.5px solid #ef4444' : '1.5px solid rgba(255,255,255,0.25)',
  color: '#f0f6ff',
  borderRadius: '10px',
  padding: '11px 14px',
  fontSize: '14px',
  outline: 'none',
  display: 'block',
  width: '100%',
  transition: 'border-color 0.15s',
});

const iconInputStyle = (hasError?: boolean): React.CSSProperties => ({
  ...inputStyle(hasError),
  paddingLeft: '42px',
});

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [siteSettings, setSiteSettings] = useState<any>({
    bankTransferEnabled: true,
    bankTransferName: '',
    bankTransferSortCode: '',
    bankTransferAccountNumber: '',
    bankTransferIBAN: '',
    bankTransferInstructions: '',
  });

  const [form, setForm] = useState<CheckoutForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postcode: '',
    country: 'United Kingdom',
    paymentMethod: 'bank_transfer',
    acceptedTerms: false,
    ageVerified: false,
    createAccount: false,
    password: '',
    shippingMethod: 'standard',
  });

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPlacing, setIsPlacing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [bankTransferRef, setBankTransferRef] = useState('');
  const [confirmedTotal, setConfirmedTotal] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  type FenaStep =
    | 'idle'
    | 'creating-order'
    | 'creating-link'
    | 'redirecting'
    | 'failed';
  const [fenaStep, setFenaStep] = useState<FenaStep>('idle');
  const [fenaOrderId, setFenaOrderId] = useState<string>('');
  const [paymentOptions, setPaymentOptions] = useState<CheckoutPaymentOptions | null>(null);
  const [, setSummaryExpanded] = useState(false);
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Banner state: set when the cart we loaded was in the legacy shape and
  // had to be rewritten (or when the server reports stale/missing products).
  const [cartStale, setCartStale] = useState(false);

  // Pre-flight server validation: surfaces price / availability / variantId
  // problems BEFORE the user clicks "Place order". Runs debounced whenever
  // the cart changes. Findings show up in `preflightIssues` and are rendered
  // inline next to the stale-cart banner.
  interface PreflightIssue {
    productId: string;
    variantId: string | null;
    cartPrice: number;
    serverPrice: number | null;
    message: string;
    kind: 'price_mismatch' | 'not_found' | 'out_of_stock' | 'variant_missing';
  }
  const [preflightIssues, setPreflightIssues] = useState<PreflightIssue[]>([]);
  const [preflightChecking, setPreflightChecking] = useState(false);
  const [preflightOk, setPreflightOk] = useState(false);
  const preflightRunId = useRef(0);

  useEffect(() => {
    if (cart.length === 0) {
      setPreflightIssues([]);
      setPreflightOk(false);
      return;
    }
    const runId = ++preflightRunId.current;
    const handle = setTimeout(async () => {
      setPreflightChecking(true);
      try {
        const idToken = auth.currentUser && !auth.currentUser.isAnonymous
          ? await auth.currentUser.getIdToken().catch(() => null)
          : null;
        const result = await validateCartPrices({
          data: {
            items: cart.map(item => ({
              productId: String(item.id),
              variantId: item.variantId ? String(item.variantId) : null,
              quantity: item.quantity,
            })),
            idToken,
          },
        });
        // Ignore late responses if cart changed again mid-flight.
        if (runId !== preflightRunId.current) return;

        const issues: PreflightIssue[] = [];

        // Map server lines back by (productId, variantId) to compare prices.
        const keyOf = (p: string, v: string | null) => `${p}::${v ?? ''}`;
        const serverByKey = new Map<string, typeof result.items[number]>();
        for (const line of result.items) {
          serverByKey.set(keyOf(line.productId, line.variantId), line);
        }

        for (const item of cart) {
          const sId = String(item.id);
          const sVid = item.variantId ? String(item.variantId) : null;
          const server = serverByKey.get(keyOf(sId, sVid));

          // Server might have resolved the line under a different productId
          // via the legacy fallback — try matching by variantId alone.
          const serverFallback = server
            ?? (sVid
              ? result.items.find(l => l.variantId === sVid)
              : undefined);

          if (!serverFallback) {
            issues.push({
              productId: sId,
              variantId: sVid,
              cartPrice: item.priceNum,
              serverPrice: null,
              kind: sVid ? 'variant_missing' : 'not_found',
              message: sVid
                ? `Variant "${sVid}" of "${item.name}" could not be found. Please re-select the size.`
                : `"${item.name}" is no longer available.`,
            });
            continue;
          }

          if (!serverFallback.inStock) {
            issues.push({
              productId: sId,
              variantId: sVid,
              cartPrice: item.priceNum,
              serverPrice: serverFallback.unitPrice,
              kind: 'out_of_stock',
              message: `"${item.name}"${sVid ? ` (${sVid})` : ''} is out of stock.`,
            });
          }

          // Price drift > 1p is treated as a mismatch the user must see.
          const cartPrice = Number(item.priceNum) || 0;
          const serverPrice = Number(serverFallback.unitPrice) || 0;
          if (Math.abs(cartPrice - serverPrice) > 0.01) {
            issues.push({
              productId: sId,
              variantId: sVid,
              cartPrice,
              serverPrice,
              kind: 'price_mismatch',
              message: `Price for "${item.name}"${sVid ? ` (${sVid})` : ''} changed from £${cartPrice.toFixed(2)} to £${serverPrice.toFixed(2)}.`,
            });
          }
        }

        setPreflightIssues(issues);
        setPreflightOk(issues.length === 0 && result.ok);
      } catch {
        // Network / server fault — surface a single soft issue, don't block.
        if (runId === preflightRunId.current) {
          setPreflightIssues([{
            productId: '',
            variantId: null,
            cartPrice: 0,
            serverPrice: null,
            kind: 'not_found',
            message: 'Could not verify cart prices right now. We will retry when you place the order.',
          }]);
          setPreflightOk(false);
        }
      } finally {
        if (runId === preflightRunId.current) setPreflightChecking(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [cart]);

  // Load cart from localStorage. Runs `migrateStoredCart` first so legacy
  // carts (concatenated `<productId>-<variantId>` ids) are rewritten in
  // place. If anything actually changed, raise the "outdated cart" banner.
  useEffect(() => {
    try {
      const before = localStorage.getItem('php_cart');
      const migrated = migrateStoredCart<CartItem>();
      const after = localStorage.getItem('php_cart');
      if (migrated && migrated.length > 0) {
        setCart(migrated);
        if (before && after && before !== after) setCartStale(true);
      } else {
        const stored = localStorage.getItem('php_cart');
        if (stored) setCart(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  // Listen for cart updates
  useEffect(() => {
    const onStorage = () => {
      try {
        const stored = localStorage.getItem('php_cart');
        if (stored) setCart(JSON.parse(stored));
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Auth listener — prefill form from 'customers' collection (same as Account page)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      if (u && !u.isAnonymous) {
        getDoc(doc(db, 'customers', u.uid)).then(snap => {
          const d = snap.exists() ? snap.data() : {};
          setForm(prev => ({
            ...prev,
            firstName: d.firstName || prev.firstName,
            lastName: d.lastName || prev.lastName,
            email: u.email || prev.email,
            phone: d.phone || prev.phone,
            address: d.address || prev.address,
            city: d.city || prev.city,
            postcode: d.postcode || prev.postcode,
          }));
        }).catch(() => {
          setForm(prev => ({ ...prev, email: u.email || prev.email }));
        });
      }
    });
    return unsub;
  }, []);

  // Load site settings
  useEffect(() => {
    try {
      const cached = localStorage.getItem('php_site_settings');
      if (cached) setSiteSettings((prev: any) => ({ ...prev, ...JSON.parse(cached) }));
    } catch { /* ignore */ }
    getDoc(doc(db, 'settings', 'siteSettings')).then(snap => {
      if (snap.exists()) setSiteSettings((prev: any) => ({ ...prev, ...snap.data() }));
    }).catch(() => {});
  }, []);

  // Load active payment gateways (dynamic Pay-by-Bank availability)
  useEffect(() => {
    let cancelled = false;
    getCheckoutPaymentOptions()
      .then((opts) => {
        if (cancelled) return;
        setPaymentOptions(opts);
        // If no online gateway is active, force manual bank transfer.
        if (!opts.primary && opts.backups.length === 0) {
          setForm((prev) => prev.paymentMethod === 'pay_by_bank'
            ? { ...prev, paymentMethod: 'bank_transfer' }
            : prev);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Fail safe: hide Pay-by-Bank, only manual fallback.
        setPaymentOptions({ primary: null, backups: [], manualFallback: true });
        setForm((prev) => prev.paymentMethod === 'pay_by_bank'
          ? { ...prev, paymentMethod: 'bank_transfer' }
          : prev);
      });
    return () => { cancelled = true; };
  }, []);

  // Calculations
  const subtotal = cart.reduce((s, i) => s + i.priceNum * i.quantity, 0);
  const discount = appliedCoupon ? (
    appliedCoupon.type === 'percentage'
      ? +(subtotal * appliedCoupon.value / 100).toFixed(2)
      : appliedCoupon.type === 'fixed'
        ? Math.min(appliedCoupon.value, subtotal)
        : 0
  ) : 0;
  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const baseShipping = isFreeShipping ? 0 : (SHIPPING_OPTIONS.find(o => o.id === form.shippingMethod)?.price ?? 4.99);
  const couponFreeShipping = appliedCoupon?.type === 'free_shipping';
  const shippingCost = couponFreeShipping ? 0 : baseShipping;
  const originalTotal = subtotal + baseShipping;
  const total = Math.max(0, subtotal - discount + shippingCost).toFixed(2);
  const hasDiscount = discount > 0 || couponFreeShipping;
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
  const hasItemsWithoutVariant = cart.some(item => !item.dosage || item.dosage === '');

  const updateQty = (key: string, delta: number) => {
    setCart(prev => {
      const next = prev
        .map(item => {
          const k = item.variantId ? `${item.id}-${item.variantId}` : String(item.id);
          return k === key ? { ...item, quantity: item.quantity + delta } : item;
        })
        .filter(item => item.quantity > 0);
      try { localStorage.setItem('php_cart', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const removeItem = (key: string) => {
    setCart(prev => {
      const next = prev.filter(item => {
        const k = item.variantId ? `${item.id}-${item.variantId}` : String(item.id);
        return k !== key;
      });
      try { localStorage.setItem('php_cart', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const coupon = await validateCoupon(couponCode.trim(), subtotal);
      if (!coupon) {
        setCouponError('Invalid or expired coupon code.');
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon(coupon);
      }
    } catch {
      setCouponError('Could not validate coupon. Try again.');
    } finally {
      setCouponLoading(false);
    }
  };

  const setField = useCallback(<K extends keyof CheckoutForm>(key: K, val: CheckoutForm[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  }, [errors]);

  const validateStep = (step: Step): Record<string, string> => {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (!form.firstName.trim()) e.firstName = 'Required';
      if (!form.lastName.trim()) e.lastName = 'Required';
      if (!form.email.trim()) e.email = 'Required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email';
      if (form.phone.trim()) {
        const digits = form.phone.replace(/[\s()\-+]/g, '');
        if (!/^(44)?0?[1-9]\d{8,9}$/.test(digits)) e.phone = 'Enter a valid UK phone number';
      }
      if (form.createAccount && !firebaseUser) {
        if (!form.password) e.password = 'Password is required';
        else if (form.password.length < 8) e.password = 'Min 8 characters';
      }
    }
    if (step === 2) {
      if (!form.address.trim()) e.address = 'Required';
      if (!form.city.trim()) e.city = 'Required';
      if (!form.postcode.trim()) e.postcode = 'Required';
      else if (!/^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i.test(form.postcode.trim())) e.postcode = 'Enter a valid UK postcode';
      if (!form.country.trim()) e.country = 'Required';
    }
    if (step === 3) {
      if (!form.ageVerified) e.age = 'You must confirm you are 18 or older to place this order';
      if (!form.acceptedTerms) e.terms = 'You must confirm Research Use Only and accept the Terms & Conditions';
    }
    return e;
  };

  const advanceStep = (from: Step) => {
    const stepErrors = validateStep(from);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setCompletedSteps(prev => new Set([...prev, from]));
    const next = Math.min(from + 1, 3) as Step;
    setCurrentStep(next);
    setTimeout(() => {
      stepRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const goToStep = (step: Step) => {
    if (step < currentStep || completedSteps.has(step) || step === currentStep) {
      setCurrentStep(step);
    }
  };

  const handleSubmit = async () => {
    const step3Errors = validateStep(3);
    if (Object.keys(step3Errors).length > 0) {
      setErrors(step3Errors);
      return;
    }
    if (hasItemsWithoutVariant) {
      setErrors(prev => ({ ...prev, stock: 'Please select a variant for all items in your cart' }));
      return;
    }
    if (cart.length === 0) {
      setErrors(prev => ({ ...prev, stock: 'Your cart is empty' }));
      return;
    }

    setIsPlacing(true);
    setLoginError('');
    if (form.paymentMethod === 'pay_by_bank') {
      setFenaStep('creating-order');
      setFenaOrderId('');
    } else {
      setFenaStep('idle');
    }

    try {
      let userId = firebaseUser?.uid;

      if (form.createAccount && !firebaseUser) {
        try {
          const newUser = await registerUser(form.email, form.password, form.firstName, form.lastName);
          userId = newUser.user.uid;
        } catch (error: any) {
          if (error.code === 'auth/email-already-in-use') {
            setLoginError('Email already registered. Please login or use a different email.');
          } else {
            setLoginError('Failed to create account: ' + error.message);
          }
          setIsPlacing(false);
          return;
        }
      }

      if (!userId) {
        try {
          const anon = await signInAnonymously(auth);
          userId = anon.user.uid;
        } catch {
          // Guest checkout — no auth needed, Firestore rules allow public create
          userId = undefined;
        }
      }

      // SECURITY: Order creation runs entirely server-side. The server
      // re-validates the cart against Firestore `product_stock`, recomputes
      // subtotal/discount/shipping/total from those authoritative prices,
      // and writes the order document via the service account (bypassing
      // client-writable rules). The client never supplies totalAmount.
      let serverResult: Awaited<ReturnType<typeof createOrder>>;
      try {
        const idToken = auth.currentUser && !auth.currentUser.isAnonymous
          ? await auth.currentUser.getIdToken().catch(() => null)
          : null;
        serverResult = await createOrder({
          data: {
            items: cart.map(item => ({
              productId: String(item.id),
              productName: item.name,
              variantId: item.variantId ? String(item.variantId) : null,
              variantName: item.variantName || item.dosage || null,
              quantity: item.quantity,
            })),
            customer: {
              firstName: form.firstName,
              lastName: form.lastName,
              email: form.email,
              phone: form.phone,
              address: form.address,
              city: form.city,
              postcode: form.postcode,
              country: form.country,
            },
            shippingMethod: form.shippingMethod,
            paymentMethod: form.paymentMethod,
            ageVerified: true,
            termsAccepted: true,
            couponCode: appliedCoupon?.code ?? null,
            idToken,
          },
        });
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (/no longer exists|could not verify price/i.test(msg)) setCartStale(true);
        setErrors(prev => ({
          ...prev,
          stock: msg || 'We could not place your order. Please refresh and try again.',
        }));
        setIsPlacing(false);
        return;
      }

      const orderId = serverResult.orderId;
      const btRef = serverResult.bankTransferReference;
      const totalAmount = serverResult.totalAmount;

      if (serverResult.couponCode && appliedCoupon) {
        try { await redeemCoupon(appliedCoupon.id); } catch { /* ignore */ }
      }

      for (const item of cart) {
        try {
          const pRef = doc(db, 'products', String(item.id));
          const snap = await getDoc(pRef);
          if (!snap.exists()) continue;
          const d = snap.data();
          if (d.variants?.length && item.variantId) {
            const variants = d.variants.map((v: any) =>
              v.id === item.variantId ? { ...v, stock: Math.max(0, (v.stock || 0) - item.quantity) } : v
            );
            await updateDoc(pRef, { variants });
          } else if (typeof d.stock === 'number') {
            await updateDoc(pRef, { stock: Math.max(0, d.stock - item.quantity) });
          }
        } catch { /* ignore */ }
      }

      setBankTransferRef(btRef);
      setConfirmedTotal(totalAmount.toFixed(2));

      // Pay by Bank (Open Banking via Fena, handled by our in-app server
      // function — same origin, no external Worker, no CORS).
      if (form.paymentMethod === 'pay_by_bank') {
        setFenaOrderId(orderId);
        setFenaStep('creating-link');
        try {
          let current = auth.currentUser;
          if (!current) {
            const anon = await signInAnonymously(auth);
            current = anon.user;
          }
          const idTokenForFena = await current.getIdToken();
          const { hppUrl, gateway } = await createGatewayPaymentLink({
            data: { orderId, idToken: idTokenForFena },
          });
          // Allowlist redirect hosts per gateway — defence-in-depth.
          let parsed: URL;
          try { parsed = new URL(hppUrl); } catch { throw new Error('Invalid payment redirect URL.'); }
          const host = parsed.hostname.toLowerCase();
          const fenaOk = host === 'fena.co' || host === 'fena.io' || host.endsWith('.fena.co') || host.endsWith('.fena.io');
          const tlOk = host === 'truelayer.com' || host.endsWith('.truelayer.com') || host.endsWith('.truelayer-sandbox.com');
          const yapilyOk = host === 'yapily.com' || host.endsWith('.yapily.com');
          const okHost =
            (gateway === 'fena' && fenaOk) ||
            (gateway === 'truelayer' && tlOk) ||
            (gateway === 'yapily' && yapilyOk);
          if (parsed.protocol !== 'https:' || !okHost) {
            throw new Error('Unexpected payment redirect host.');
          }
          setFenaStep('redirecting');
          localStorage.removeItem('php_cart');
          setCart([]);
          setTimeout(() => { window.location.href = parsed.toString(); }, 250);
          return;
        } catch (err: any) {
          setFenaStep('failed');
          setLoginError(err?.message || 'Could not start Pay by Bank. Please try again or use Manual Bank Transfer.');
          setIsPlacing(false);
          return;
        }
      }

      try {
        await sendPublicMail({
          template: 'order-confirmation',
          email: form.email,
          orderId,
          firstName: form.firstName,
          items: cart.map(item => ({
            name: item.name,
            variantName: item.variantName || item.dosage,
            quantity: item.quantity,
            priceNum: item.priceNum,
          })),
          subtotal: serverResult.subtotal,
          shipping: serverResult.shippingCost,
          discount: serverResult.discount,
          total: totalAmount,
          address: form.address,
          city: form.city,
          postcode: form.postcode,
          paymentMethod: 'bank_transfer',
          bankTransferRef: btRef,
          bankName: siteSettings.bankTransferName,
          bankSortCode: siteSettings.bankTransferSortCode,
          bankAccountNumber: siteSettings.bankTransferAccountNumber,
          bankIBAN: siteSettings.bankTransferIBAN,
          bankInstructions: siteSettings.bankTransferInstructions,
        });
      } catch { /* non-blocking */ }

      localStorage.removeItem('php_cart');
      setCart([]);
      setOrderPlaced(true);
    } catch (err: any) {
      setLoginError('Failed to place order. Please try again.');
      console.error(err);
    } finally {
      setIsPlacing(false);
    }
  };

  // ── Order Success ──
  if (orderPlaced) {
    return (
      <section id="checkout-success" className="min-h-screen bg-[#060f1e] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/25 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Order Confirmed</h1>
          <p className="text-emerald-400 font-medium mb-6">Order reserved — payment pending</p>

          {bankTransferRef && (
            <div className="bg-[#0b1a30] border border-white/10 rounded-2xl p-6 mb-6 text-left">
              <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Your Payment Reference
              </p>
              <div className="bg-[#060f1e] border border-white/10 rounded-xl px-4 py-4 text-center mb-4">
                <p className="text-white font-mono font-bold text-lg tracking-widest">{bankTransferRef}</p>
                <p className="text-gray-400 text-xs mt-1">Use this as your payment reference</p>
              </div>
              <div className="space-y-2 text-sm">
                {siteSettings.bankTransferName && (
                  <div className="flex justify-between"><span className="text-gray-400 text-xs">Account Name</span><span className="text-white text-xs font-medium">{siteSettings.bankTransferName}</span></div>
                )}
                {siteSettings.bankTransferSortCode && (
                  <div className="flex justify-between"><span className="text-gray-400 text-xs">Sort Code</span><span className="text-white font-mono text-xs">{siteSettings.bankTransferSortCode}</span></div>
                )}
                {siteSettings.bankTransferAccountNumber && (
                  <div className="flex justify-between"><span className="text-gray-400 text-xs">Account No.</span><span className="text-white font-mono text-xs">{siteSettings.bankTransferAccountNumber}</span></div>
                )}
              </div>
            </div>
          )}

          <div className="bg-[#0b1a30] border border-white/10 rounded-xl p-4 mb-6 text-left text-sm">
            <div className="flex justify-between mb-1"><span className="text-gray-400">Name</span><span className="text-white">{form.firstName} {form.lastName}</span></div>
            <div className="flex justify-between mb-1"><span className="text-gray-400">Email</span><span className="text-white break-all">{form.email}</span></div>
            <div className="flex justify-between border-t border-white/10 pt-2 mt-2"><span className="text-gray-400">Amount due</span><span className="text-amber-400 font-bold">£{confirmedTotal || total}</span></div>
          </div>

          <div className="space-y-3">
            <Link to="/products" className="block w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors text-center">
              Continue Shopping
            </Link>
            {firebaseUser && !firebaseUser.isAnonymous && (
              <Link to="/account" className="block w-full py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-medium transition-colors text-center border border-white/10">
                View My Orders
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── Step summary labels ──
  const step1Summary = form.firstName ? `${form.firstName} ${form.lastName} · ${form.email}` : null;
  const step2Summary = form.address ? `${form.address}, ${form.city} ${form.postcode}` : null;

  return (
    <section id="checkout" className="min-h-screen bg-[#060f1e] pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-white">Checkout</h1>
        </div>

        {/* Empty cart */}
        {cart.length === 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center mb-8">
            <ShoppingCart className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-amber-300 font-medium mb-4">Your cart is empty</p>
            <Link to="/products" className="inline-block px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
              Browse Products
            </Link>
          </div>
        )}

        {cart.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">

            {/* ── LEFT: Steps ── */}
            <div className="space-y-3">

              {/* Progress bar */}
              <div className="flex items-center gap-0 mb-6">
                {STEPS.map((step, i) => {
                  const done = completedSteps.has(step.id);
                  const active = currentStep === step.id;
                  return (
                    <div key={step.id} className="flex items-center flex-1">
                      <button
                        onClick={() => goToStep(step.id)}
                        className={`flex items-center gap-2 text-xs font-medium transition-colors ${active ? 'text-white' : done ? 'text-emerald-400 cursor-pointer' : 'text-gray-600 cursor-default'}`}
                        disabled={!done && !active && step.id > currentStep}
                        aria-label={`Go to step ${step.id}: ${step.label}`}
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${active ? 'bg-emerald-500 border-emerald-500 text-white' : done ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-white/15 text-gray-600'}`}>
                          {done ? <Check className="w-3 h-3" /> : step.id}
                        </span>
                        <span className="hidden sm:block">{step.label}</span>
                      </button>
                      {i < STEPS.length - 1 && (
                        <div className={`flex-1 h-px mx-3 transition-colors ${done ? 'bg-emerald-500/50' : 'bg-white/10'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Research disclaimer */}
              <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/25 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-amber-300/80 text-xs">
                  All compounds are sold strictly for research purposes only. Not for human consumption.
                </p>
              </div>

              {/* Outdated cart banner — shown when legacy ids were migrated
                  or when the server reports unknown/stale products. */}
              {cartStale && (
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/40 rounded-xl p-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-amber-200 text-sm font-medium">
                      Your cart was saved with outdated product data
                    </p>
                    <p className="text-amber-300/80 text-xs mt-1">
                      We've refreshed it with the latest prices and variants. Please review your items before placing the order, or reload your cart to pull the newest data.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => { window.location.reload(); }}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
                      >
                        Reload cart
                      </button>
                      <Link
                        to="/products"
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 transition-colors"
                      >
                        Back to shop
                      </Link>
                      <button
                        type="button"
                        onClick={() => setCartStale(false)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg text-amber-300/70 hover:text-amber-200 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Pre-flight validation findings (price drift / missing variants
                  / out of stock) — shown before the user reaches the pay step. */}
              {preflightIssues.length > 0 && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/40 rounded-xl p-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-red-300 text-sm font-medium">
                      We found {preflightIssues.length === 1 ? 'an issue' : `${preflightIssues.length} issues`} with your cart
                    </p>
                    <ul className="mt-1.5 space-y-1 text-red-300/85 text-xs list-disc pl-4">
                      {preflightIssues.map((issue, idx) => (
                        <li key={`${issue.productId}-${issue.variantId ?? ''}-${idx}`}>
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                    <p className="text-red-300/70 text-[11px] mt-2">
                      Please update your cart on the product page before placing the order.
                    </p>
                  </div>
                </div>
              )}

              {/* Subtle live indicator while pre-flight check runs */}
              {preflightChecking && preflightIssues.length === 0 && (
                <p className="text-slate-500 text-[11px]">Verifying live prices and stock…</p>
              )}
              {preflightOk && !preflightChecking && cart.length > 0 && (
                <p className="text-emerald-400/80 text-[11px] flex items-center gap-1.5">
                  <Check className="w-3 h-3" /> Prices and stock verified
                </p>
              )}


              {/* Stock errors */}
              {errors.stock && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{errors.stock}</p>
                </div>
              )}

              {/* Login error */}
              {loginError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{loginError}</p>
                </div>
              )}

              {/* Pay by Bank (Fena) live status */}
              {form.paymentMethod === 'pay_by_bank' && fenaStep !== 'idle' && fenaStep !== 'failed' && (
                <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                  <div className="w-4 h-4 mt-0.5 shrink-0 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="text-emerald-300 font-medium">
                      {fenaStep === 'creating-order' && 'Creating your order…'}
                      {fenaStep === 'creating-link' && 'Order created. Generating secure Pay by Bank link…'}
                      {fenaStep === 'redirecting' && 'Redirecting you to your bank…'}
                    </p>
                    <p className="text-emerald-300/70 text-xs mt-0.5">
                      {fenaStep === 'creating-order' && 'Reserving stock and locking the total in £.'}
                      {fenaStep === 'creating-link' && (
                        <>Order ref <span className="font-mono">{fenaOrderId || '…'}</span>. Talking to Fena Open Banking.</>
                      )}
                      {fenaStep === 'redirecting' && (
                        <>After you approve in your banking app, you'll come back to <span className="font-mono">/payment/success</span> and we'll wait for the bank webhook to mark the order as paid.</>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Always-visible Discount Code ── */}
              <div className="rounded-2xl border border-emerald-500/20 bg-[#0b1a30] p-4">
                <label htmlFor="promoCodeTop" className="block text-xs font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-400" /> Discount Code
                </label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-emerald-400 text-sm font-semibold flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> {appliedCoupon.code} applied
                      </span>
                      <span className="text-emerald-300/80 text-[11px]">
                        {appliedCoupon.type === 'percentage' && `${appliedCoupon.value}% off subtotal`}
                        {appliedCoupon.type === 'fixed' && `£${appliedCoupon.value.toFixed(2)} off`}
                        {appliedCoupon.type === 'free_shipping' && 'Free shipping'}
                      </span>
                    </div>
                    <button
                      onClick={() => { setAppliedCoupon(null); setCouponCode(''); setCouponError(''); }}
                      aria-label="Remove discount code"
                      className="text-gray-400 hover:text-white transition-colors p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      id="promoCodeTop"
                      type="text"
                      value={couponCode}
                      onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                      placeholder="Enter code"
                      style={{ ...inputStyle(!!couponError), flex: 1, padding: '10px 14px' }}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="px-5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-[10px] transition-colors shrink-0"
                    >
                      {couponLoading ? '...' : 'Apply'}
                    </button>
                  </div>
                )}
                {couponError && <p className="text-red-400 text-xs mt-1.5">{couponError}</p>}
              </div>

              {/* ── STEP 1: Personal Details ── */}
              <div
                ref={el => { stepRefs.current[1] = el; }}
                className={`rounded-2xl border transition-all overflow-hidden ${currentStep === 1 ? 'border-emerald-500/30 bg-[#0b1a30]' : completedSteps.has(1) ? 'border-white/[0.07] bg-[#0b1a30]' : 'border-white/[0.05] bg-[#080f1e]'}`}
              >
                {/* Step header */}
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  onClick={() => goToStep(1)}
                  aria-expanded={currentStep === 1}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${currentStep === 1 ? 'bg-emerald-500 border-emerald-500 text-white' : completedSteps.has(1) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-white/15 text-gray-400'}`}>
                      {completedSteps.has(1) ? <Check className="w-3.5 h-3.5" /> : '1'}
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${currentStep === 1 ? 'text-white' : completedSteps.has(1) ? 'text-gray-300' : 'text-gray-400'}`}>Your Details</p>
                      {completedSteps.has(1) && step1Summary && currentStep !== 1 && (
                        <p className="text-xs text-gray-400 truncate max-w-[240px]">{step1Summary}</p>
                      )}
                    </div>
                  </div>
                  {completedSteps.has(1) && currentStep !== 1 && (
                    <span className="text-xs text-emerald-400 font-medium">Edit</span>
                  )}
                </button>

                {/* Step body */}
                {currentStep === 1 && (
                  <div className="px-5 pb-5 space-y-4">
                    {!firebaseUser && (
                      <p className="text-xs text-gray-400">
                        Already have an account?{' '}
                        <Link to="/login" className="text-emerald-400 hover:text-emerald-300 underline">Sign in</Link>
                        {' '}for faster checkout.
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="firstName" className="block text-xs font-medium text-gray-300 mb-1">First Name <span className="text-red-400">*</span></label>
                        <input id="firstName" type="text" autoComplete="given-name" value={form.firstName} onChange={e => setField('firstName', e.target.value)} placeholder="James" style={inputStyle(!!errors.firstName)} />
                        {errors.firstName && <p className="text-red-400 text-xs mt-1">{errors.firstName}</p>}
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block text-xs font-medium text-gray-300 mb-1">Last Name <span className="text-red-400">*</span></label>
                        <input id="lastName" type="text" autoComplete="family-name" value={form.lastName} onChange={e => setField('lastName', e.target.value)} placeholder="Smith" style={inputStyle(!!errors.lastName)} />
                        {errors.lastName && <p className="text-red-400 text-xs mt-1">{errors.lastName}</p>}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-xs font-medium text-gray-300 mb-1">Email Address <span className="text-red-400">*</span></label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input id="email" type="email" autoComplete="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="james@example.com" style={iconInputStyle(!!errors.email)} />
                      </div>
                      {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-xs font-medium text-gray-300 mb-1">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="07911 123456" style={iconInputStyle(!!errors.phone)} />
                      </div>
                      {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
                    </div>

                    {/* Create account option */}
                    {!firebaseUser && (
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.createAccount}
                          onChange={e => setField('createAccount', e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500 focus:ring-1 cursor-pointer"
                        />
                        <span className="text-xs text-gray-300">Save details for faster checkout next time</span>
                      </label>
                    )}
                    {form.createAccount && !firebaseUser && (
                      <div>
                        <label htmlFor="password" className="block text-xs font-medium text-gray-300 mb-1">Create Password <span className="text-red-400">*</span></label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input id="password" type="password" autoComplete="new-password" value={form.password} onChange={e => setField('password', e.target.value)} placeholder="Min 8 characters" style={iconInputStyle(!!errors.password)} />
                        </div>
                        {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
                      </div>
                    )}

                    <button
                      onClick={() => advanceStep(1)}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      Continue to Delivery <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* ── STEP 2: Delivery ── */}
              <div
                ref={el => { stepRefs.current[2] = el; }}
                className={`rounded-2xl border transition-all overflow-hidden ${currentStep === 2 ? 'border-emerald-500/30 bg-[#0b1a30]' : completedSteps.has(2) ? 'border-white/[0.07] bg-[#0b1a30]' : 'border-white/[0.05] bg-[#080f1e]'}`}
              >
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  onClick={() => goToStep(2)}
                  aria-expanded={currentStep === 2}
                  disabled={!completedSteps.has(1) && currentStep < 2}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${currentStep === 2 ? 'bg-emerald-500 border-emerald-500 text-white' : completedSteps.has(2) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-white/15 text-gray-400'}`}>
                      {completedSteps.has(2) ? <Check className="w-3.5 h-3.5" /> : '2'}
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${currentStep === 2 ? 'text-white' : completedSteps.has(2) ? 'text-gray-300' : 'text-gray-400'}`}>Delivery Address</p>
                      {completedSteps.has(2) && step2Summary && currentStep !== 2 && (
                        <p className="text-xs text-gray-400 truncate max-w-[240px]">{step2Summary}</p>
                      )}
                    </div>
                  </div>
                  {completedSteps.has(2) && currentStep !== 2 && (
                    <span className="text-xs text-emerald-400 font-medium">Edit</span>
                  )}
                </button>

                {currentStep === 2 && (
                  <div className="px-5 pb-5 space-y-4">
                    <div>
                      <label htmlFor="address" className="block text-xs font-medium text-gray-300 mb-1">Street Address <span className="text-red-400">*</span></label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input id="address" type="text" autoComplete="street-address" value={form.address} onChange={e => setField('address', e.target.value)} placeholder="42 Baker Street, Flat 3" style={iconInputStyle(!!errors.address)} />
                      </div>
                      {errors.address && <p className="text-red-400 text-xs mt-1">{errors.address}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="city" className="block text-xs font-medium text-gray-300 mb-1">City / Town <span className="text-red-400">*</span></label>
                        <input id="city" type="text" autoComplete="address-level2" value={form.city} onChange={e => setField('city', e.target.value)} placeholder="London" style={inputStyle(!!errors.city)} />
                        {errors.city && <p className="text-red-400 text-xs mt-1">{errors.city}</p>}
                      </div>
                      <div>
                        <label htmlFor="postcode" className="block text-xs font-medium text-gray-300 mb-1">Postcode <span className="text-red-400">*</span></label>
                        <input id="postcode" type="text" autoComplete="postal-code" value={form.postcode} onChange={e => setField('postcode', e.target.value.toUpperCase())} placeholder="SW1A 1AA" style={inputStyle(!!errors.postcode)} />
                        {errors.postcode && <p className="text-red-400 text-xs mt-1">{errors.postcode}</p>}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="country" className="block text-xs font-medium text-gray-300 mb-1">Country <span className="text-red-400">*</span></label>
                      <select
                        id="country"
                        value={form.country}
                        onChange={e => setField('country', e.target.value)}
                        style={{ ...inputStyle(!!errors.country), appearance: 'none' }}
                      >
                        <option value="United Kingdom">United Kingdom</option>
                        <option value="Ireland">Ireland</option>
                        <option value="Other">Other</option>
                      </select>
                      {errors.country && <p className="text-red-400 text-xs mt-1">{errors.country}</p>}
                    </div>

                    {/* Shipping method */}
                    <div>
                      <p className="text-xs font-medium text-gray-300 mb-2">Shipping Method</p>
                      <div className="space-y-2">
                        {SHIPPING_OPTIONS.map(opt => {
                          const isSelected = form.shippingMethod === opt.id;
                          return (
                            <label
                              key={opt.id}
                              className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-200 ${isSelected ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'}`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name="shippingMethod"
                                  value={opt.id}
                                  checked={isSelected}
                                  onChange={() => setField('shippingMethod', opt.id)}
                                  className="sr-only"
                                />
                                {/* Custom radio */}
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-white/30 bg-white/5'}`}>
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                </div>
                                <div>
                                  <p className="text-sm text-white font-medium">{opt.label}</p>
                                  <p className="text-xs text-gray-400">{opt.desc}</p>
                                </div>
                              </div>
                              <span className={`text-sm font-semibold shrink-0 ${isFreeShipping && opt.id === 'standard' ? 'text-emerald-400' : 'text-white'}`}>
                                {isFreeShipping && opt.id === 'standard' ? 'FREE' : `£${opt.price.toFixed(2)}`}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {isFreeShipping && (
                        <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Free standard shipping on orders over £50
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => advanceStep(2)}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      Continue to Payment <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* ── STEP 3: Payment ── */}
              <div
                ref={el => { stepRefs.current[3] = el; }}
                className={`rounded-2xl border transition-all overflow-hidden ${currentStep === 3 ? 'border-emerald-500/30 bg-[#0b1a30]' : 'border-white/[0.05] bg-[#080f1e]'}`}
              >
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  onClick={() => goToStep(3)}
                  aria-expanded={currentStep === 3}
                  disabled={currentStep < 3 && !completedSteps.has(2)}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${currentStep === 3 ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/15 text-gray-400'}`}>
                      3
                    </span>
                    <p className={`text-sm font-semibold ${currentStep === 3 ? 'text-white' : 'text-gray-400'}`}>Payment</p>
                  </div>
                </button>

                {currentStep === 3 && (
                  <div className="px-5 pb-5 space-y-4">
                    {/* Payment method selector — Pay-by-Bank only when an Open Banking gateway is enabled */}
                    {paymentOptions && !paymentOptions.primary && paymentOptions.backups.length === 0 && (
                      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200">
                        Instant Pay-by-Bank is temporarily unavailable. Please complete your order via Manual Bank Transfer below — your order will be reserved for 48 hours.
                      </div>
                    )}
                    <div className={`grid grid-cols-1 ${paymentOptions && (paymentOptions.primary || paymentOptions.backups.length > 0) ? 'sm:grid-cols-2' : ''} gap-2`}>
                      {paymentOptions && (paymentOptions.primary || paymentOptions.backups.length > 0) && (
                        <button
                          type="button"
                          onClick={() => setField('paymentMethod', 'pay_by_bank')}
                          className={`flex items-start gap-3 text-left p-3 rounded-xl border transition-all ${
                            form.paymentMethod === 'pay_by_bank'
                              ? 'border-emerald-500/60 bg-emerald-500/10'
                              : 'border-white/10 bg-[#060f1e] hover:border-white/20'
                          }`}
                        >
                          <Landmark className={`w-5 h-5 mt-0.5 shrink-0 ${form.paymentMethod === 'pay_by_bank' ? 'text-emerald-400' : 'text-gray-400'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                              Pay by Bank
                              <span className="text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">Instant</span>
                            </p>
                            <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
                              Pay instantly from your UK bank account — no card needed, no chargebacks.
                            </p>
                            {paymentOptions.primary && (
                              <p className="text-[10px] text-emerald-300/80 mt-1">
                                via {paymentOptions.primary.name}
                                {paymentOptions.primary.sandbox && ' (sandbox)'}
                                {paymentOptions.backups.length > 0 && (
                                  <span className="text-gray-400">
                                    {' '}· auto-failover to {paymentOptions.backups.map((b) => b.name).join(', ')}
                                  </span>
                                )}
                              </p>
                            )}
                            <UkBankBadges className="mt-2" />
                          </div>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setField('paymentMethod', 'bank_transfer')}
                        className={`flex items-start gap-3 text-left p-3 rounded-xl border transition-all ${
                          form.paymentMethod === 'bank_transfer'
                            ? 'border-emerald-500/60 bg-emerald-500/10'
                            : 'border-white/10 bg-[#060f1e] hover:border-white/20'
                        }`}
                      >
                        <Landmark className={`w-5 h-5 mt-0.5 shrink-0 ${form.paymentMethod === 'bank_transfer' ? 'text-emerald-400' : 'text-gray-400'}`} />
                        <div>
                          <p className="text-sm font-semibold text-white">Manual Bank Transfer</p>
                          <p className="text-[11px] text-gray-400 leading-snug mt-0.5">Receive bank details by email and transfer manually within 48h.</p>
                        </div>
                      </button>
                    </div>

                    {/* Selected method info */}
                    {form.paymentMethod === 'pay_by_bank' ? (
                      <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <Landmark className="w-4 h-4 text-emerald-400" />
                            <p className="text-sm font-semibold text-white">Pay by Bank (Instant Bank Transfer)</p>
                          </div>
                          <UkBankBadges />
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          Pay instantly from your UK bank account — no card needed, no chargebacks. You'll be redirected to your bank to approve the payment, then back here to confirm your order.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Landmark className="w-4 h-4 text-blue-400" />
                          <p className="text-sm font-semibold text-white">Manual Bank Transfer</p>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          Your order will be reserved for <strong className="text-white">48 hours</strong>. After placing your order, transfer the exact amount using the reference provided. Confirmation email sent immediately.
                        </p>
                      </div>
                    )}

                    {/* Discount code */}
                    <div>
                      <label htmlFor="promoCode" className="block text-xs font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-emerald-400" /> Discount Code
                      </label>
                      {appliedCoupon ? (
                        <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5">
                          <div className="flex flex-col">
                            <span className="text-emerald-400 text-sm font-semibold flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5" /> {appliedCoupon.code} applied
                            </span>
                            <span className="text-emerald-300/80 text-[11px]">
                              {appliedCoupon.type === 'percentage' && `${appliedCoupon.value}% off subtotal`}
                              {appliedCoupon.type === 'fixed' && `£${appliedCoupon.value.toFixed(2)} off`}
                              {appliedCoupon.type === 'free_shipping' && 'Free shipping'}
                            </span>
                          </div>
                          <button
                            onClick={() => { setAppliedCoupon(null); setCouponCode(''); setCouponError(''); }}
                            aria-label="Remove discount code"
                            className="text-gray-400 hover:text-white transition-colors p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            id="promoCode"
                            type="text"
                            value={couponCode}
                            onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                            placeholder="Enter code"
                            style={{ ...inputStyle(!!couponError), flex: 1, padding: '10px 14px' }}
                          />
                          <button
                            type="button"
                            onClick={handleApplyCoupon}
                            disabled={couponLoading || !couponCode.trim()}
                            className="px-5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-[10px] transition-colors shrink-0"
                          >
                            {couponLoading ? '...' : 'Apply'}
                          </button>
                        </div>
                      )}
                      {couponError && <p className="text-red-400 text-xs mt-1.5">{couponError}</p>}
                    </div>

                    {/* Totals (with discount breakdown) */}
                    <div className="bg-[#060f1e] border border-white/[0.07] rounded-xl p-4 space-y-1.5 text-xs">
                      <div className="flex justify-between text-gray-400">
                        <span>Subtotal</span><span className="text-white">£{subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>Shipping</span>
                        <span className={shippingCost === 0 ? 'text-emerald-400' : 'text-white'}>
                          {shippingCost === 0 ? 'FREE' : `£${shippingCost.toFixed(2)}`}
                        </span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-emerald-400">
                          <span>Discount ({appliedCoupon?.code})</span>
                          <span>−£{discount.toFixed(2)}</span>
                        </div>
                      )}
                      {couponFreeShipping && baseShipping > 0 && (
                        <div className="flex justify-between text-emerald-400">
                          <span>Free shipping ({appliedCoupon?.code})</span>
                          <span>−£{baseShipping.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-white/10">
                        <span className="text-white font-semibold text-sm">Total</span>
                        <span className="flex items-baseline gap-2">
                          {hasDiscount && originalTotal.toFixed(2) !== total && (
                            <span className="text-gray-400 text-xs line-through">£{originalTotal.toFixed(2)}</span>
                          )}
                          <span className="text-white font-bold text-base">£{total}</span>
                        </span>
                      </div>
                    </div>


                    <div className="lg:hidden bg-[#060f1e] border border-white/[0.07] rounded-xl p-4">
                      <button
                        onClick={() => setSummaryExpanded(v => !v)}
                        className="w-full flex items-center justify-between text-sm font-semibold text-white"
                      >
                        <span>Order Summary ({totalItems} item{totalItems !== 1 ? 's' : ''})</span>
                        <span className="text-emerald-400">£{total}</span>
                      </button>
                    </div>

                    {/* Age verification 18+ — UK compliance */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center w-6 h-6 mt-0.5 shrink-0">
                        <input
                          type="checkbox"
                          id="ageVerified"
                          checked={form.ageVerified}
                          onChange={e => setField('ageVerified', e.target.checked)}
                          className="peer absolute w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-full h-full rounded-md bg-white/10 border-2 border-white/30 group-hover:border-emerald-400 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all duration-200 flex items-center justify-center shadow-sm">
                          <Check className={`w-4 h-4 text-white font-bold stroke-[3px] transition-all duration-200 ${form.ageVerified ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`} />
                        </div>
                      </div>
                      <span className="text-xs text-gray-300 leading-relaxed">
                        I confirm I am <strong className="text-white">18 years of age or older</strong> and legally permitted to purchase laboratory research reagents in my jurisdiction.
                      </span>
                    </label>
                    {errors.age && <p className="text-red-400 text-xs">{errors.age}</p>}

                    {/* Terms */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center w-6 h-6 mt-0.5 shrink-0">
                        <input
                          type="checkbox"
                          id="acceptedTerms"
                          checked={form.acceptedTerms}
                          onChange={e => setField('acceptedTerms', e.target.checked)}
                          className="peer absolute w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-full h-full rounded-md bg-white/10 border-2 border-white/30 group-hover:border-emerald-400 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all duration-200 flex items-center justify-center shadow-sm">
                          <Check className={`w-4 h-4 text-white font-bold stroke-[3px] transition-all duration-200 ${form.acceptedTerms ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`} />
                        </div>
                      </div>
                      <span className="text-xs text-gray-300 leading-relaxed">
                        I confirm I am a qualified researcher and that these products will be used for{' '}
                        <strong className="text-white">in-vitro laboratory research only</strong>.{' '}
                        I understand they are <strong className="text-white">Not For Human Or Veterinary Consumption</strong>,
                        are not drugs, food or supplements, and I agree to the{' '}
                        <Link to="/terms-of-service" target="_blank" className="text-emerald-400 hover:text-emerald-300 underline font-medium">Terms & Conditions</Link>{' '}
                        and{' '}
                        <Link to="/privacy-policy" target="_blank" className="text-emerald-400 hover:text-emerald-300 underline">Privacy Policy</Link>.
                      </span>
                    </label>
                    {errors.terms && <p className="text-red-400 text-xs">{errors.terms}</p>}

                    {/* Place order button */}
                    <button
                      onClick={handleSubmit}
                      disabled={isPlacing || preflightIssues.length > 0}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {isPlacing ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Placing Order...
                        </>
                      ) : preflightIssues.length > 0 ? (
                        <>
                          <AlertTriangle className="w-4 h-4" /> Resolve cart issues to continue
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" /> {form.paymentMethod === 'pay_by_bank' ? `Pay by Bank — £${total}` : `Place Order — £${total}`}
                        </>
                      )}
                    </button>

                    {/* Trust row */}
                    <div className="flex items-center justify-center gap-5 pt-1">
                      {[
                        { icon: Lock, label: 'SSL Secure', color: 'text-blue-400' },
                        { icon: BadgeCheck, label: '≥99% HPLC', color: 'text-emerald-400' },
                        { icon: Truck, label: 'UK Based', color: 'text-cyan-400' },
                      ].map(({ icon: Icon, label, color }) => (
                        <div key={label} className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Icon className={`w-3.5 h-3.5 ${color}`} />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* ── RIGHT: Order Summary ── */}
            <div className="hidden lg:block">
              <div className="sticky top-24 space-y-4">
                <div className="bg-[#0b1a30] border border-white/[0.07] rounded-2xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-gray-400" />
                    Order Summary
                    <span className="ml-auto text-gray-400 text-xs font-normal">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
                  </h2>

                  {/* Items */}
                  <div className="space-y-3 mb-4">
                    {cart.map(item => {
                      const key = item.variantId ? `${item.id}-${item.variantId}` : String(item.id);
                      return (
                        <div key={key} className="flex gap-3">
                          {item.image && (
                            <img src={item.image} alt={item.name} loading="lazy" className="w-11 h-11 rounded-lg object-cover border border-white/10 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium truncate">{item.name}</p>
                            {item.dosage && <p className="text-gray-400 text-xs">{item.dosage}</p>}
                            <div className="flex items-center gap-1.5 mt-1">
                              <button onClick={() => updateQty(key, -1)} aria-label="Decrease" className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                                <Minus className="w-2.5 h-2.5 text-gray-300" />
                              </button>
                              <span className="text-white text-xs w-4 text-center">{item.quantity}</span>
                              <button onClick={() => updateQty(key, 1)} aria-label="Increase" className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                                <Plus className="w-2.5 h-2.5 text-gray-300" />
                              </button>
                              <button onClick={() => removeItem(key)} aria-label="Remove" className="ml-1 w-5 h-5 rounded bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors">
                                <Trash2 className="w-2.5 h-2.5 text-red-400" />
                              </button>
                            </div>
                          </div>
                          <p className="text-white text-xs font-semibold shrink-0">£{(item.priceNum * item.quantity).toFixed(2)}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Coupon */}
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2 mb-3">
                      <span className="text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                        <Tag className="w-3 h-3" /> {appliedCoupon.code}
                      </span>
                      <button
                        onClick={() => { setAppliedCoupon(null); setCouponCode(''); }}
                        aria-label="Remove coupon"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                        placeholder="Coupon code"
                        style={{ background: '#060f1e', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', outline: 'none', flex: 1 }}
                      />
                      <button
                        onClick={handleApplyCoupon}
                        disabled={couponLoading}
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition-colors disabled:opacity-50 shrink-0"
                      >
                        {couponLoading ? '...' : 'Apply'}
                      </button>
                    </div>
                  )}
                  {couponError && <p className="text-red-400 text-xs mb-3">{couponError}</p>}

                  {/* Totals */}
                  <div className="space-y-2 text-xs border-t border-white/[0.07] pt-3">
                    <div className="flex justify-between text-gray-400">
                      <span>Subtotal</span><span className="text-white">£{subtotal.toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Discount</span><span>−£{discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-400">
                      <span>Shipping</span>
                      <span className={isFreeShipping ? 'text-emerald-400' : 'text-white'}>
                        {isFreeShipping ? 'FREE' : `£${shippingCost.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-sm border-t border-white/10 pt-2 mt-1">
                      <span className="text-white">Total</span>
                      <span className="text-white">£{total}</span>
                    </div>
                  </div>
                </div>

                {/* Free shipping progress */}
                {!isFreeShipping && (
                  <div className="bg-[#0b1a30] border border-white/[0.07] rounded-xl p-4">
                    <p className="text-xs text-gray-400 mb-2">
                      Add <strong className="text-white">£{(FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)}</strong> more for free shipping
                    </p>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </section>
  );
}
