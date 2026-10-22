import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User as UserIcon, Mail, Phone, MapPin,
  Lock, AlertTriangle, Check, ChevronLeft, Truck,
  Landmark, BadgeCheck, ShoppingCart, Trash2, Plus, Minus,
  CheckCircle2, ChevronRight, Tag, X, Package
} from 'lucide-react';
import {
  auth, doc, getDoc,
  db, validateCoupon,
  onAuthStateChanged, FirebaseUser, registerUser
} from '@/lib/firebase';
import type { Coupon } from '@/lib/firebase';
import { validateCartPrices } from '@/lib/cart-validation.functions';
import { computeBundleDiscount } from '@/lib/bundle-discount';
import { parseCartTransferParam } from '@/lib/legacy-host';
import { createOrder } from '@/lib/create-order.functions';
import { useCheckoutPaused } from '@/lib/checkout-pause';
import { getStoredAdClickIds } from '@/lib/gclid-capture';
import { createGatewayPaymentLink, getCheckoutPaymentOptions } from '@/lib/payment-gateways.functions';
import type { CheckoutPaymentOptions } from '@/lib/payments/types';
import { migrateStoredCart } from '@/lib/cart-migration';
import { logCartEvent, safeCartWrite } from '@/lib/cart-telemetry';
import { sendPublicMail } from '@/lib/sendPublicMail';
import type { CartItem } from '@/components/Layout';
import { useFreeGiftConfig, freeGiftApplies, eligibleGifts } from '@/lib/free-gift-config';
import FreeGiftPicker from '@/components/checkout/FreeGiftPicker';
import { trackAddPaymentInfo, trackBeginCheckout, trackViewCart, renderGoogleCustomerReviewsOptIn, type GaItem } from '@/lib/analytics';
import { merchantItemId } from '@/lib/merchant-item-id';
import { logCheckoutEvent } from '@/lib/checkoutTelemetry';
import { callPreflightWithRetry } from '@/lib/checkoutPreflightRetry';
import { toast, Toaster as SonnerToaster } from 'sonner';

import PaymentMethodOptions from '@/components/PaymentMethodOptions';
import { usePeptidePayEnabled } from '@/lib/peptidepay-toggle';
import { useBrokkrPayConfig } from '@/lib/brokkrpay-fx';
import { useNowPaymentsEnabled } from '@/lib/nowpayments-toggle';
import { useTideEnabled } from '@/lib/tide-toggle';
import TidePayPanel from '@/components/TidePayPanel';

import NoCacheHead from '@/components/NoCacheHead';
import PostcodeLookup from '@/components/checkout/PostcodeLookup';



interface CheckoutForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** House number or property name — captured separately for Royal Mail labels. */
  houseNumber: string;
  address: string;
  /** Shopper confirmed the property genuinely has no number (named property). */
  addressNoHouseNumber: boolean;
  city: string;
  postcode: string;
  country: string;
  paymentMethod: '' | 'bank_transfer' | 'pay_by_bank' | 'wallid' | 'peptidepay' | 'brokkrpay' | 'nowpayments' | 'tide';
  acceptedTerms: boolean;
  ageVerified: boolean;
  createAccount: boolean;
  password: string;
  shippingMethod: 'standard' | 'next_day_12' | '';
  customerNote: string;
}

import { checkNextDayEligibility, SHIPPING_CONFIG, formatLondonDate } from '@/lib/shipping/next-day';
import { formatShippingAddressInline, formatShippingAddressLines, shortPostcodeLabel } from '@/lib/format-address';
import { joinAddressLine, validateUkAddressLine, hasHouseNumber, HAS_HOUSE_NUMBER_OPTION_LABEL, HAS_HOUSE_NUMBER_OPTION_HINT, NO_HOUSE_NUMBER_OPTION_LABEL, NO_HOUSE_NUMBER_OPTION_HINT } from '@/lib/uk-address';
import { suggestEmailTypo } from '@/lib/email-typo';


type ShippingOptionId = 'standard' | 'next_day_12';
interface ShippingOption { id: ShippingOptionId; label: string; desc: string; price: number; }

const SHIPPING_OPTIONS_ALL: ShippingOption[] = [
  { id: 'standard',     label: 'Standard 1–3 Day Delivery', desc: 'Dispatched within 1–3 working days', price: SHIPPING_CONFIG.standardPrice },
  { id: 'next_day_12',  label: 'Next Day by 12 PM',         desc: 'Order before 11:30 AM Mon–Fri',      price: SHIPPING_CONFIG.nextDayPrice },
];

const FREE_SHIPPING_THRESHOLD = SHIPPING_CONFIG.freeThreshold;

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
  const checkoutPaused = useCheckoutPaused();
  const [cart, setCart] = useState<CartItem[]>([]);
  const freeGiftCfg = useFreeGiftConfig();
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
    houseNumber: '',
    address: '',
    addressNoHouseNumber: false,
    city: '',
    postcode: '',
    country: 'United Kingdom',
    paymentMethod: '',
    acceptedTerms: false,
    ageVerified: false,
    createAccount: false,
    password: '',
    shippingMethod: '',
    customerNote: '',
  });

  // Canonical first address line sent to the order API / label / invoice.
  const addressLine1 = joinAddressLine(form.houseNumber, form.address);


  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPlacing, setIsPlacing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [bankTransferRef, setBankTransferRef] = useState('');
  // Reference reserved up-front so the Tide QR panel can show it before the
  // order exists; it is sent to createOrder so the stored order matches.
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
  const [wallidEnabled, setWallidEnabled] = useState<boolean>(false);
  const [manualTransferEnabled, setManualTransferEnabled] = useState<boolean>(true);
  const { enabled: peptidepayEnabled } = usePeptidePayEnabled();
  const { enabled: brokkrpayEnabled } = useBrokkrPayConfig();
  const { enabled: nowpaymentsEnabled } = useNowPaymentsEnabled();
  const { enabled: tideEnabled } = useTideEnabled();

  const [, setSummaryExpanded] = useState(false);
  const [paymentRecoveryVisible, setPaymentRecoveryVisible] = useState(false);
  const [pendingPaymentUrl, setPendingPaymentUrl] = useState<string | null>(null);
  // Desktop Pay-by-Bank waiting overlay: bank page opens in a NEW tab while
  // this tab polls /api/payments/status — bank apps often never redirect
  // back, so the user simply returns here and sees the confirmation.
  const [bankWaiting, setBankWaiting] = useState<{
    orderId: string;
    paymentUrl: string;
    paymentToken: string | null;
  } | null>(null);
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const paymentAttemptRef = useRef(0);
  const paymentAbortRef = useRef<AbortController | null>(null);
  const paymentRecoveryTimerRef = useRef<number | null>(null);
  const paymentWatchdogTimerRef = useRef<number | null>(null);

  const clearPaymentTimers = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (paymentRecoveryTimerRef.current !== null) {
      window.clearTimeout(paymentRecoveryTimerRef.current);
      paymentRecoveryTimerRef.current = null;
    }
    if (paymentWatchdogTimerRef.current !== null) {
      window.clearTimeout(paymentWatchdogTimerRef.current);
      paymentWatchdogTimerRef.current = null;
    }
  }, []);

  const startPaymentTimers = useCallback((attemptId: number) => {
    if (typeof window === 'undefined') return;
    clearPaymentTimers();
    setPaymentRecoveryVisible(false);
    setPendingPaymentUrl(null);
    paymentRecoveryTimerRef.current = window.setTimeout(() => {
      if (paymentAttemptRef.current === attemptId) setPaymentRecoveryVisible(true);
    }, 8000);
    // Watchdog: 45s covers register/anon sign-in + createOrder + gateway
    // link + URL parse on slow mobile networks. Once createOrder has
    // returned (order document written), the caller MUST clear the
    // watchdog with clearPaymentTimers() — cancelling after that point
    // strands the order and causes duplicates on ret