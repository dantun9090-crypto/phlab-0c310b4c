import { useState, useEffect, useRef } from 'react';
import {
  User, Package, MapPin, LogOut, ShoppingBag, Loader2, Edit2, Save, X,
  Trash2, CheckCircle2, Clock, Truck, Check, AlertCircle, ChevronRight,
  RotateCcw, Bell, ShieldAlert, FileText, Download, RefreshCw,
  Gift, Copy, Share2, Users, TrendingUp, Tag, CheckCheck, Crown,
  FlaskConical, Upload, Eye
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  auth, db, storage, getUserOrders, logoutUser, Order, redeemReferralBalance,
  doc, getDoc, updateDoc, deleteDoc, onAuthStateChanged, FirebaseUser,
  deleteUser, EmailAuthProvider, reauthenticateWithCredential, updatePassword,
  sendEmailVerification, collection, addDoc, getDocs, query, where, orderBy,
  storageRef, uploadBytes, getDownloadURL, deleteObject,
} from '@/lib/firebase';
import { serverTimestamp } from 'firebase/firestore';
import { revokeMyRefreshTokens } from '@/lib/revoke-refresh-tokens.functions';
import { logSecurityEvent } from '@/lib/security-events';
import { OrderTrackingBar } from '@/components/OrderTrackingBar';
import { PayAgainCTA } from '@/components/PayAgainCTA';
import { getDisplayStatus } from '@/lib/order-payment-retry';

import { motion, AnimatePresence } from 'framer-motion';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string | null;
  createdAt: any;
  phone?: string;
  address?: string;
  city?: string;
  postcode?: string;
  loyaltyCredits?: number;
  totalOrders?: number;
  totalSpend?: number;
  referralCode?: string;
  referralBalance?: number;
  referralRewardClaimed?: boolean;
  referralCount?: number;
  referredBy?: string;
}

// ── 72h Payment Countdown ───────────────────────────────────────────────────
function PaymentCountdown({ createdAt }: { createdAt: any }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const getMs = () => {
      const created = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt || 0);
      const deadline = created.getTime() + 72 * 60 * 60 * 1000;
      return Math.max(0, deadline - Date.now());
    };
    setRemaining(getMs());
    const iv = setInterval(() => setRemaining(getMs()), 1000);
    return () => clearInterval(iv);
  }, [createdAt]);

  if (remaining === 0) return (
    <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      Payment deadline passed — order may be cancelled
    </div>
  );

  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const urgent = hours < 6;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${
      urgent
        ? 'bg-red-500/10 border-red-500/30 text-red-400'
        : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
    }`}>
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>Payment deadline:</span>
      <span className="font-mono font-bold">
        {String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
      {urgent && <span className="text-red-300 font-semibold">— Act now</span>}
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: string; glow: string; icon: any }> = {
  pending: { label: 'Pending', color: 'bg-amber-500/15 text-amber-300 border-amber-500/25', glow: 'shadow-amber-500/10', icon: Clock },
  pending_payment: { label: 'Awaiting Payment', color: 'bg-orange-500/15 text-orange-300 border-orange-500/25', glow: 'shadow-orange-500/10', icon: Clock },
  paid: { label: 'Paid', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25', glow: 'shadow-emerald-500/10', icon: CheckCircle2 },
  processing: { label: 'Processing', color: 'bg-blue-500/15 text-blue-300 border-blue-500/25', glow: 'shadow-blue-500/10', icon: RotateCcw },
  shipped: { label: 'Shipped', color: 'bg-violet-500/15 text-violet-300 border-violet-500/25', glow: 'shadow-violet-500/10', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25', glow: 'shadow-emerald-500/10', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/15 text-red-300 border-red-500/25', glow: 'shadow-red-500/10', icon: X },
  refunded: { label: 'Refunded', color: 'bg-orange-500/15 text-orange-300 border-orange-500/25', glow: 'shadow-orange-500/10', icon: X },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border tracking-wide ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// OrderTrackingBar lives in its own file so it can be DOM-tested without
// pulling in Firebase / framer-motion / react-router. See
// src/components/OrderTrackingBar.tsx and src/components/OrderTrackingBar.test.tsx.


// ── Luxury card styles ──
const cardBase = "relative bg-[#0b1829] border border-white/[0.07] rounded-2xl";
const sectionHeading = "text-xs font-semibold uppercase tracking-[0.15em] text-[#3a5a82] mb-4";
const luxuryInput = "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200";
const luxuryInputError = "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200";
const inputBaseStyle: React.CSSProperties = { background: '#0d1f38', border: '1.5px solid rgba(255,255,255,0.2)', color: '#ffffff', fontFamily: 'inherit' };
const inputErrorStyleBase: React.CSSProperties = { background: '#0d1f38', border: '1.5px solid rgba(239,68,68,0.6)', color: '#ffffff', fontFamily: 'inherit' };
const luxuryBtn = "inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold rounded-xl text-sm transition-all duration-200 shadow-[0_4px_20px_rgba(99,102,241,0.3)] hover:shadow-[0_4px_28px_rgba(99,102,241,0.45)] hover:-translate-y-px active:translate-y-0";
const ghostBtn = "inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.14] text-gray-300 hover:text-white font-medium rounded-xl text-sm transition-all duration-200";

export default function AccountPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'invoices' | 'lab-report' | 'referral' | 'profile' | 'security'>('overview');
  const [saveMsg, setSaveMsg] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Noindex for SEO
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    meta.id = 'noindex-account';
    document.head.appendChild(meta);
    return () => document.getElementById('noindex-account')?.remove();
  }, []);

  // Profile edit
  const [, setEditingProfile] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editPostcode, setEditPostcode] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; postcode?: string }>({});

  // Security
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Referral
  const [referralCopied, setReferralCopied] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ code: string; value: number } | null>(null);
  const [redeemError, setRedeemError] = useState('');
  const [redeemCopied, setRedeemCopied] = useState(false);

  // Email verification
  const [verifSending, setVerifSending] = useState(false);
  const [verifSent, setVerifSent] = useState(false);
  const [verifError, setVerifError] = useState('');
  const [verifCooldown, setVerifCooldown] = useState(0);

  // ── Lab Reports (PWA file_handlers target) ───────────────────────────────
  interface PendingReport { id: string; file: File; url: string; }
  interface SavedReport {
    id: string;
    name: string;
    size: number;
    url: string;
    storagePath: string;
    contentType?: string;
    createdAt?: any;
  }
  const [pendingReports, setPendingReports] = useState<PendingReport[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reportError, setReportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Accept PDFs from drag-drop, file picker, or PWA launchQueue
  const acceptFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files as ArrayLike<File>);
    const pdfs = arr.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (pdfs.length === 0) {
      if (arr.length) setReportError('Only PDF lab reports can be imported.');
      return;
    }
    setReportError('');
    const mapped: PendingReport[] = pdfs.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      url: URL.createObjectURL(f),
    }));
    setPendingReports(prev => [...mapped, ...prev]);
  };

  // PWA file_handlers entry point: window.launchQueue delivers the PDFs the
  // OS opened with the PH Labs app. Switches to the lab-report tab and shows
  // them in the importer.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lq = (window as any).launchQueue;
    if (!lq || typeof lq.setConsumer !== 'function') return;
    lq.setConsumer(async (launchParams: any) => {
      if (!launchParams?.files?.length) return;
      const files: File[] = [];
      for (const handle of launchParams.files) {
        try { files.push(await handle.getFile()); } catch { /* skip */ }
      }
      if (!files.length) return;
      acceptFiles(files);
      setActiveTab('lab-report');
    });
  }, []);

  // Honour ?import=lab-report (the file_handlers action URL) and ?tab=...
  useEffect(() => {
    const importParam = searchParams.get('import');
    const tabParam = searchParams.get('tab');
    if (importParam === 'lab-report' || tabParam === 'lab-report') {
      setActiveTab('lab-report');
    } else if (tabParam === 'orders') {
      setActiveTab('orders');
    }
  }, [searchParams]);

  // Revoke blob URLs on unmount to avoid leaks
  useEffect(() => {
    return () => {
      pendingReports.forEach(r => URL.revokeObjectURL(r.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'customers', u.uid));
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            setProfile(data);
            setEditFirstName(data.firstName || '');
            setEditLastName(data.lastName || '');
            setEditPhone(data.phone || '');
            setEditAddress(data.address || '');
            setEditCity(data.city || '');
            setEditPostcode(data.postcode || '');
          }
          const userOrders = await getUserOrders(u.uid);
          setOrders(userOrders);
          await loadSavedReports(u.uid);
        } catch (e) {
          console.error(e);
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const loadSavedReports = async (uid: string) => {
    setReportsLoading(true);
    try {
      const q = query(
        collection(db, 'lab_reports'),
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      const rows: SavedReport[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setSavedReports(rows);
    } catch (e) {
      console.error('[account] failed to load lab reports', e);
    } finally {
      setReportsLoading(false);
    }
  };

  const handleSaveReport = async (pending: PendingReport) => {
    if (!user) return;
    if (pending.file.size > 10 * 1024 * 1024) {
      setReportError('Lab report must be under 10 MB.');
      return;
    }
    setUploadingId(pending.id);
    setReportError('');
    try {
      const safeName = pending.file.name.replace(/[^\w.\-]+/g, '_').slice(0, 200);
      const storagePath = `users/${user.uid}/lab_reports/${Date.now()}-${safeName}`;
      const ref = storageRef(storage, storagePath);
      await uploadBytes(ref, pending.file, {
        contentType: pending.file.type || 'application/pdf',
      });
      const url = await getDownloadURL(ref);
      const docRef = await addDoc(collection(db, 'lab_reports'), {
        uid: user.uid,
        name: pending.file.name.slice(0, 255),
        size: pending.file.size,
        contentType: pending.file.type || 'application/pdf',
        storagePath,
        url,
        createdAt: serverTimestamp(),
      });
      setSavedReports(prev => [{
        id: docRef.id,
        uid: user.uid,
        name: pending.file.name,
        size: pending.file.size,
        contentType: pending.file.type || 'application/pdf',
        storagePath,
        url,
        createdAt: new Date(),
      } as SavedReport, ...prev]);
      URL.revokeObjectURL(pending.url);
      setPendingReports(prev => prev.filter(p => p.id !== pending.id));
    } catch (e: any) {
      console.error('[account] lab report save failed', e);
      setReportError(e?.message || 'Failed to save lab report. Please try again.');
    } finally {
      setUploadingId(null);
    }
  };

  const handleDiscardPending = (id: string) => {
    setPendingReports(prev => {
      const target = prev.find(p => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter(p => p.id !== id);
    });
  };

  const handleDeleteSavedReport = async (report: SavedReport) => {
    if (!user) return;
    if (!confirm(`Delete "${report.name}"? This cannot be undone.`)) return;
    try {
      try { await deleteObject(storageRef(storage, report.storagePath)); } catch { /* ignore */ }
      await deleteDoc(doc(db, 'lab_reports', report.id));
      setSavedReports(prev => prev.filter(r => r.id !== report.id));
    } catch (e: any) {
      setReportError(e?.message || 'Failed to delete report.');
    }
  };

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleLogout = async () => {
    await logoutUser();
    navigate('/');
  };



  const handleSaveProfile = async () => {
    if (!user) return;
    // Validate
    const errors: { phone?: string; postcode?: string } = {};
    if (editPhone && !/^(\+44\s?|0)[1-9]\d{8,10}$/.test(editPhone.replace(/\s/g, ''))) {
      errors.phone = 'Enter a valid UK phone number (e.g. +44 7700 900000)';
    }
    if (editPostcode && !/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(editPostcode.trim())) {
      errors.postcode = 'Enter a valid UK postcode (e.g. SW1A 1AA)';
    }
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'customers', user.uid), {
        firstName: editFirstName,
        lastName: editLastName,
        phone: editPhone,
        address: editAddress,
        city: editCity,
        postcode: editPostcode,
      });
      setProfile(prev => prev ? { ...prev, firstName: editFirstName, lastName: editLastName, phone: editPhone, address: editAddress, city: editCity, postcode: editPostcode } : prev);
      setEditingProfile(false);
      setSaveMsg('Profile updated successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveMsg('Failed to save profile');
      setTimeout(() => setSaveMsg(''), 3000);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
    if (!user?.email) return;
    setSavingPassword(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      // G: Revoke refresh tokens on every other device.
      try {
        const idToken = await user.getIdToken(/* forceRefresh */ true);
        await revokeMyRefreshTokens({ data: { idToken } });
        logSecurityEvent({ type: 'password_changed', meta: { uid: user.uid } });
        setPasswordSuccess('Password changed. All other sessions logged out.');
      } catch (revokeErr) {
        console.warn('[account] token revocation failed:', revokeErr);
        setPasswordSuccess('Password updated successfully');
      }
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setChangingPassword(false);
    } catch (e: any) {
      setPasswordError(e.code === 'auth/wrong-password' ? 'Current password is incorrect' : 'Failed to update password. Please try again.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.email || !deletePassword) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const cred = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(user, cred);
      await deleteDoc(doc(db, 'customers', user.uid));
      await deleteUser(user);
      navigate('/');
    } catch (e: any) {
      setDeleteError(e.code === 'auth/wrong-password' ? 'Incorrect password' : 'Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user || verifSending || verifCooldown > 0) return;
    setVerifSending(true);
    setVerifError('');
    setVerifSent(false);
    try {
      await sendEmailVerification(user);
      setVerifSent(true);
      setVerifCooldown(60);
      const interval = setInterval(() => {
        setVerifCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      if (err.code === 'auth/too-many-requests') {
        setVerifError('Too many attempts. Please wait a few minutes before trying again.');
      } else {
        setVerifError('Failed to send verification email. Please try again.');
      }
    } finally {
      setVerifSending(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping" />
            <div className="absolute inset-0 rounded-full border-t-2 border-blue-500 animate-spin" />
            <div className="absolute inset-2 rounded-full bg-blue-500/10 flex items-center justify-center">
              <User className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <p className="text-[#9cb8d9] text-sm tracking-wide">Loading your account…</p>
        </div>
      </div>
    );
  }

  // ── Not logged in ──
  if (!user) {
    return (
      <div className="min-h-screen bg-[#060f1e] pt-24 pb-20 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className={`${cardBase} p-10 text-center`}>
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-white/[0.08] flex items-center justify-center mx-auto mb-6">
              <User className="w-9 h-9 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Member Access Required</h1>
            <p className="text-[#9cb8d9] text-sm mb-8 leading-relaxed">Sign in to your account to access your dashboard, orders, and exclusive member benefits.</p>
            <div className="flex flex-col gap-3">
              <Link to="/login" className={luxuryBtn + ' w-full'}>
                Sign In
              </Link>
              <Link to="/register" className={ghostBtn + ' w-full'}>
                Create Account
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Crown },
    { id: 'orders', label: 'Orders', icon: Package, count: orders.length },
    { id: 'invoices', label: 'Receipts', icon: FileText },
    { id: 'referral', label: 'Referrals', icon: Gift },
    { id: 'profile', label: 'Profile', icon: Edit2 },
    { id: 'security', label: 'Security', icon: ShieldAlert },
  ] as const;

  const memberInitials = `${profile?.firstName?.[0] || ''}${profile?.lastName?.[0] || ''}`.toUpperCase() || user.email?.[0]?.toUpperCase() || 'M';

  return (
    <div className="min-h-screen bg-[#060f1e] pt-24 pb-20 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-600/[0.04] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-violet-600/[0.04] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 max-w-5xl relative">

        {/* ── Back to Shop ── */}
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-[#9cb8d9] hover:text-white text-sm mb-8 transition-colors group"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to shop
        </Link>

        {/* ── Page Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-10"
        >
          <div>
            <p className={sectionHeading}>Member Dashboard</p>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Welcome back{profile?.firstName ? `, ${profile.firstName}` : ''}
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className={`${ghostBtn} text-red-400/80 hover:text-red-300 border-red-500/20 hover:border-red-500/30 hover:bg-red-500/[0.06]`}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:block">Sign Out</span>
          </button>
        </motion.div>

        {/* ── Save message toast ── */}
        <AnimatePresence>
          {saveMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm border ${
                saveMsg.includes('success')
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/25 text-red-300'
              }`}
            >
              {saveMsg.includes('success') ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {saveMsg}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid md:grid-cols-4 gap-6">

          {/* ── Sidebar ── */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="md:col-span-1 space-y-4"
          >
            {/* Member card */}
            <div className={`${cardBase} p-6 overflow-hidden`}>
              {/* Top glow accent */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-24 h-24 bg-blue-500/10 rounded-full" />

              <div className="flex flex-col items-center text-center relative">
                {/* Avatar */}
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-700 flex items-center justify-center text-white font-bold text-xl shadow-[0_8px_24px_rgba(99,102,241,0.35)]">
                    {memberInitials}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#060f1e] flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>

                <p className="text-white font-bold text-base leading-tight">
                  {profile?.firstName} {profile?.lastName}
                </p>
                <p className="text-[#3a5a82] text-xs mt-1 truncate max-w-full">{user.email}</p>

                {/* Member since */}
                <div className="mt-3 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[#9cb8d9] text-xs">
                  Member since {formatDate(profile?.createdAt)}
                </div>
              </div>

              {/* Mini stats */}
              <div className="mt-5 grid grid-cols-2 gap-2">
                {[
                  { label: 'Orders', value: profile?.totalOrders || orders.length || 0 },
                  { label: 'Spent', value: `£${(profile?.totalSpend || 0).toFixed(0)}` },
                ].map(s => (
                  <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 text-center border border-white/[0.05]">
                    <p className="text-white font-bold text-lg leading-none">{s.value}</p>
                    <p className="text-[#3a5a82] text-[10px] mt-1 uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className={`${cardBase} p-2`}>
              <nav className="space-y-0.5">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600/20 to-violet-600/10 text-white border border-blue-500/20'
                          : 'text-[#9cb8d9] hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? 'text-blue-400' : 'text-[#3a5a82] group-hover:text-[#9cb8d9]'}`} />
                      <span className="flex-1 text-left">{tab.label}</span>
                      {'count' in tab && typeof tab.count === 'number' && tab.count > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-500/20 text-blue-300' : 'bg-white/[0.06] text-[#9cb8d9]'}`}>
                          {tab.count}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-3 h-3 text-blue-400/60 flex-shrink-0" />}
                    </button>
                  );
                })}
              </nav>
            </div>
          </motion.div>

          {/* ── Main Content ── */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="md:col-span-3"
          >
            <AnimatePresence mode="wait">

              {/* ── OVERVIEW ── */}
              {activeTab === 'overview' && (
                <motion.div key="overview" initial={{ y: 10 }} animate={{ y: 0 }} exit={{ y: -10 }} transition={{ duration: 0.25 }} className="space-y-5">

                  {/* Email verification banner */}
                  {!user.emailVerified && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25">
                      <Bell className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-amber-300 text-sm font-semibold">Email not verified</p>
                        <p className="text-amber-400/70 text-xs mt-0.5">Please verify your email to unlock all account features.</p>
                        {verifSent && <p className="text-emerald-400 text-xs mt-1">Verification email sent! Check your inbox.</p>}
                        {verifError && <p className="text-red-400 text-xs mt-1">{verifError}</p>}
                      </div>
                      <button
                        onClick={handleResendVerification}
                        disabled={verifSending || verifCooldown > 0}
                        className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/25 transition-colors disabled:opacity-50"
                      >
                        {verifSending ? 'Sending…' : verifCooldown > 0 ? `Wait ${verifCooldown}s` : 'Resend'}
                      </button>
                    </div>
                  )}

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Total Orders', value: profile?.totalOrders || orders.length || 0, icon: ShoppingBag, color: 'blue' },
                      { label: 'Total Spend', value: `£${(profile?.totalSpend || 0).toFixed(2)}`, icon: TrendingUp, color: 'violet' },
                      { label: 'Referral Balance', value: `£${(profile?.referralBalance || 0).toFixed(2)}`, icon: Gift, color: 'emerald' },
                    ].map(stat => {
                      const Icon = stat.icon;
                      const colors: Record<string, string> = {
                        blue: 'from-blue-600/20 to-blue-600/5 border-blue-500/20 text-blue-400',
                        violet: 'from-violet-600/20 to-violet-600/5 border-violet-500/20 text-violet-400',
                        emerald: 'from-emerald-600/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
                      };
                      return (
                        <div key={stat.label} className={`relative rounded-2xl bg-gradient-to-b border p-5 overflow-hidden ${colors[stat.color]}`}>
                          <div className="absolute top-3 right-3 opacity-20">
                            <Icon className="w-8 h-8" />
                          </div>
                          <Icon className={`w-5 h-5 mb-3`} />
                          <p className="text-white font-bold text-xl leading-none">{stat.value}</p>
                          <p className="text-white/50 text-xs mt-1.5 uppercase tracking-wider">{stat.label}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Recent Orders */}
                  <div className={`${cardBase} overflow-hidden`}>
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                    <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/[0.06]">
                      <h2 className="text-white font-bold text-base">Recent Orders</h2>
                      {orders.length > 0 && (
                        <button onClick={() => setActiveTab('orders')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          View all →
                        </button>
                      )}
                    </div>
                    <div className="p-4">
                      {orders.length === 0 ? (
                        <div className="text-center py-10">
                          <ShoppingBag className="w-10 h-10 text-[#3a5a82] mx-auto mb-3 opacity-50" />
                          <p className="text-[#9cb8d9] text-sm mb-4">No orders yet</p>
                          <Link to="/products" className={luxuryBtn}>
                            Browse Products
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {orders.slice(0, 3).map(order => (
                            <div key={order.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/[0.07] transition-all">
                              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                <Package className="w-4 h-4 text-blue-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">
                                  {(order as any).bankTransferRef || `#${order.id.slice(0, 8).toUpperCase()}`}
                                </p>
                                <p className="text-[#3a5a82] text-xs">{formatDate(order.orderDate)}</p>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <StatusBadge status={getDisplayStatus(order as any)} />
                                <span className="text-white text-sm font-semibold">£{(order.totalAmount || 0).toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Loyalty + Address quick-view */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Referral snapshot */}
                    <div className={`${cardBase} p-5`}>
                      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
                      <div className="flex items-center gap-2 mb-4">
                        <Gift className="w-4 h-4 text-violet-400" />
                        <h3 className="text-white font-semibold text-sm">Referral Programme</h3>
                      </div>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-2xl font-bold text-white">£{(profile?.referralBalance || 0).toFixed(2)}</span>
                        <span className="text-[#3a5a82] text-xs">balance</span>
                      </div>
                      <p className="text-[#9cb8d9] text-xs mb-4">{profile?.referralCount || 0} successful referral{profile?.referralCount !== 1 ? 's' : ''}</p>
                      <button onClick={() => setActiveTab('referral')} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                        Manage referrals →
                      </button>
                    </div>

                    {/* Delivery address */}
                    <div className={`${cardBase} p-5`}>
                      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
                      <div className="flex items-center gap-2 mb-4">
                        <MapPin className="w-4 h-4 text-blue-400" />
                        <h3 className="text-white font-semibold text-sm">Delivery Address</h3>
                      </div>
                      {profile?.address ? (
                        <div className="space-y-1">
                          <p className="text-gray-300 text-sm">{profile.address}</p>
                          <p className="text-[#9cb8d9] text-sm">{[profile.city, profile.postcode].filter(Boolean).join(', ')}</p>
                        </div>
                      ) : (
                        <p className="text-[#3a5a82] text-sm">No address saved yet.</p>
                      )}
                      <button onClick={() => setActiveTab('profile')} className="mt-4 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                        {profile?.address ? 'Edit address →' : 'Add address →'}
                      </button>
                    </div>
                  </div>

                </motion.div>
              )}

              {/* ── ORDERS ── */}
              {activeTab === 'orders' && (
                <motion.div key="orders" initial={{ y: 10 }} animate={{ y: 0 }} exit={{ y: -10 }} transition={{ duration: 0.25 }}>
                  <div className={`${cardBase} overflow-hidden`}>
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                    <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
                      <h2 className="text-white font-bold text-base">Order History</h2>
                      <p className="text-[#3a5a82] text-xs mt-1">{orders.length} order{orders.length !== 1 ? 's' : ''} total</p>
                    </div>
                    <div className="p-4">
                      {orders.length === 0 ? (
                        <div className="text-center py-12">
                          <Package className="w-12 h-12 text-[#3a5a82] mx-auto mb-4 opacity-40" />
                          <p className="text-[#9cb8d9] mb-5">No orders found</p>
                          <Link to="/products" className={luxuryBtn}>
                            <ShoppingBag className="w-4 h-4" /> Shop Now
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {orders.map(order => {
                            const isExpanded = expandedOrder === order.id;
                            return (
                              <div key={order.id} className="rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.01]">
                                {/* Order header */}
                                <button
                                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                                  className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                      <Package className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <div>
                                      <p className="text-white font-semibold text-sm">
                                        {(order as any).bankTransferRef
                                          ? <span className="font-mono">{(order as any).bankTransferRef}</span>
                                          : `#${order.id.slice(0, 8).toUpperCase()}`}
                                      </p>
                                      <p className="text-[#3a5a82] text-xs">{formatDate(order.orderDate)} · £{(order.totalAmount || 0).toFixed(2)}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <StatusBadge status={getDisplayStatus(order as any)} />
                                    <ChevronRight className={`w-4 h-4 text-[#3a5a82] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                  </div>
                                </button>

                                {/* Order detail */}
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="px-4 pb-5 pt-4 border-t border-white/[0.06] space-y-4">
                                        {/* 72h payment countdown — only for pending bank transfer orders */}
                                        {order.status === 'pending' && (order as any).paymentMethod === 'bank_transfer' && (
                                          <PaymentCountdown createdAt={(order as any).createdAt || order.orderDate} />
                                        )}

                                        {/* Pay Again — for unpaid Pay-by-Bank / Fena orders (incl. cancelled-at-bank) */}
                                        <PayAgainCTA order={order as any} />

                                        {/* Tracking */}
                                        <div>
                                          <p className={sectionHeading}>Tracking</p>
                                          <OrderTrackingBar status={order.status} />
                                          {order.trackingNumber && (
                                            <p className="text-[#9cb8d9] text-xs mt-2.5">Tracking #: <span className="text-white font-mono">{order.trackingNumber}</span></p>
                                          )}
                                        </div>

                                        {/* Items */}
                                        <div>
                                          <p className={sectionHeading}>Items</p>
                                          <div className="space-y-2">
                                            {(order.items || []).map((item: any, i: number) => (
                                              <div key={i} className="flex items-center justify-between text-sm p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                                                <span className="text-gray-300">{item.productName || item.name}{item.variantName || item.dosage ? ` (${item.variantName || item.dosage})` : ''} × {item.quantity}</span>
                                                <span className="text-white font-medium">£{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        {/* Totals */}
                                        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4 space-y-2">
                                          {(order as any).discount > 0 && (
                                            <div className="flex justify-between text-sm">
                                              <span className="text-[#9cb8d9]">Discount</span>
                                              <span className="text-emerald-400">-£{((order as any).discount).toFixed(2)}</span>
                                            </div>
                                          )}
                                          {(order as any).shippingCost > 0 && (
                                            <div className="flex justify-between text-sm">
                                              <span className="text-[#9cb8d9]">Shipping</span>
                                              <span className="text-gray-300">£{((order as any).shippingCost).toFixed(2)}</span>
                                            </div>
                                          )}
                                          <div className="flex justify-between text-sm font-bold border-t border-white/[0.06] pt-2 mt-2">
                                            <span className="text-white">Total</span>
                                            <span className="text-white">£{(order.totalAmount || 0).toFixed(2)}</span>
                                          </div>
                                        </div>

                                        {/* Address */}
                                        {(order as any).shippingAddress && (
                                          <div>
                                            <p className={sectionHeading}>Shipping Address</p>
                                            <p className="text-gray-300 text-sm leading-relaxed">
                                              {(order as any).shippingAddress.address}<br />
                                              {(order as any).shippingAddress.city}{(order as any).shippingAddress.postcode ? `, ${(order as any).shippingAddress.postcode}` : ''}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── INVOICES / RECEIPTS ── */}
              {activeTab === 'invoices' && (
                <motion.div key="invoices" initial={{ y: 10 }} animate={{ y: 0 }} exit={{ y: -10 }} transition={{ duration: 0.25 }}>
                  <div className={`${cardBase} overflow-hidden`}>
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
                    <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
                      <h2 className="text-white font-bold text-base">Receipts</h2>
                      <p className="text-[#3a5a82] text-xs mt-1">Download receipts for your orders</p>
                    </div>
                    <div className="p-4">
                      {orders.length === 0 ? (
                        <div className="text-center py-12">
                          <FileText className="w-12 h-12 text-[#3a5a82] mx-auto mb-4 opacity-40" />
                          <p className="text-[#9cb8d9] text-sm">No receipts available yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {orders.map(order => {
                            const receiptRef = (order as any).bankTransferRef || `#${order.id.slice(0, 8).toUpperCase()}`;
                            return (
                              <div key={order.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/[0.08] transition-all">
                                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-4 h-4 text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-semibold font-mono">{receiptRef}</p>
                                  <p className="text-[#3a5a82] text-xs">{formatDate(order.orderDate)} · £{(order.totalAmount || 0).toFixed(2)}</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <StatusBadge status={getDisplayStatus(order as any)} />
                                  <button
                                    onClick={() => {
                                      const lines = [
                                        'PH LABS - ORDER RECEIPT',
                                        '====================================',
                                        `Order: ${receiptRef}`,
                                        `Date: ${formatDate(order.orderDate)}`,
                                        `Status: ${order.status}`,
                                        '',
                                        'ITEMS:',
                                        ...(order.items || []).map((i: any) => `  ${i.productName || i.name} x${i.quantity} - £${((i.price || 0) * (i.quantity || 1)).toFixed(2)}`),
                                        '',
                                        `TOTAL: £${(order.totalAmount || 0).toFixed(2)}`,
                                      ];
                                      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url; a.download = `receipt-${receiptRef}.txt`; a.click();
                                      URL.revokeObjectURL(url);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-medium transition-colors"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── REFERRAL ── */}
              {activeTab === 'referral' && (
                <motion.div key="referral" initial={{ y: 10 }} animate={{ y: 0 }} exit={{ y: -10 }} transition={{ duration: 0.25 }} className="space-y-5">

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Earnings Balance', value: `£${(profile?.referralBalance || 0).toFixed(2)}`, icon: TrendingUp, color: 'emerald' },
                      { label: 'Successful Referrals', value: profile?.referralCount || 0, icon: Users, color: 'violet' },
                    ].map(s => {
                      const Icon = s.icon;
                      const c: Record<string, string> = {
                        emerald: 'from-emerald-600/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
                        violet: 'from-violet-600/20 to-violet-600/5 border-violet-500/20 text-violet-400',
                      };
                      return (
                        <div key={s.label} className={`relative rounded-2xl bg-gradient-to-b border p-5 overflow-hidden ${c[s.color]}`}>
                          <div className="absolute top-3 right-3 opacity-15"><Icon className="w-10 h-10" /></div>
                          <Icon className="w-5 h-5 mb-3" />
                          <p className="text-white font-bold text-2xl leading-none">{s.value}</p>
                          <p className="text-white/50 text-xs mt-2 uppercase tracking-wider">{s.label}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Your referral link */}
                  <div className={`${cardBase} p-6`}>
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
                    <div className="flex items-center gap-2 mb-2">
                      <Share2 className="w-4 h-4 text-violet-400" />
                      <h2 className="text-white font-bold text-base">Your Referral Link</h2>
                    </div>
                    <p className="text-[#9cb8d9] text-sm mb-5">Share your unique link — earn £5 for every friend who registers and spends £50.</p>

                    {profile?.referralCode ? (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <div className="flex-1 bg-[#060f1e]/80 border border-white/[0.08] rounded-xl px-4 py-3 font-mono text-[#9cb8d9] text-sm truncate">
                            {`${window.location.origin}/register?ref=${profile.referralCode}`}
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/register?ref=${profile?.referralCode}`);
                              setReferralCopied(true);
                              setTimeout(() => setReferralCopied(false), 2500);
                            }}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${referralCopied ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-white/[0.05] hover:bg-white/[0.08] text-gray-300 border border-white/[0.08]'}`}
                          >
                            {referralCopied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {referralCopied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-[#3a5a82] text-xs">
                          Code: <span className="text-violet-400 font-mono font-semibold">{profile.referralCode}</span>
                        </p>
                      </div>
                    ) : (
                      <p className="text-[#9cb8d9] text-sm">Your referral link is being generated…</p>
                    )}
                  </div>

                  {/* Redeem */}
                  <div className={`${cardBase} p-6`}>
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent" />
                    <div className="flex items-center gap-2 mb-1">
                      <Tag className="w-4 h-4 text-emerald-400" />
                      <h2 className="text-white font-bold text-base">Redeem Earnings</h2>
                    </div>
                    <p className="text-[#9cb8d9] text-sm mb-5">Convert your balance into a discount code. Minimum balance of £30 required.</p>

                    {redeemResult ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        </div>
                        <p className="text-emerald-300 font-bold mb-1">Your discount code is ready!</p>
                        <p className="text-emerald-400/70 text-sm mb-4">Worth £{redeemResult.value.toFixed(2)} — apply at checkout</p>
                        <div className="bg-[#04101f] border border-emerald-500/20 rounded-xl px-5 py-3 font-mono text-emerald-300 text-lg font-bold tracking-widest break-all mb-4">
                          {redeemResult.code}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(redeemResult.code);
                            setRedeemCopied(true);
                            setTimeout(() => setRedeemCopied(false), 2500);
                          }}
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${redeemCopied ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 'bg-white/[0.05] hover:bg-white/[0.08] text-white border border-white/[0.08]'}`}
                        >
                          {redeemCopied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {redeemCopied ? 'Copied!' : 'Copy Code'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Progress bar */}
                        <div>
                          <div className="flex justify-between text-xs text-[#9cb8d9] mb-2">
                            <span>Balance</span>
                            <span>£{(profile?.referralBalance || 0).toFixed(2)} / £30.00</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                              style={{ width: `${Math.min(100, ((profile?.referralBalance || 0) / 30) * 100)}%` }}
                            />
                          </div>
                        </div>

                        {redeemError && (
                          <p className="text-red-400 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" /> {redeemError}
                          </p>
                        )}

                        <button
                          onClick={async () => {
                            if (!user) return;
                            setRedeemLoading(true);
                            setRedeemError('');
                            try {
                              const code = await redeemReferralBalance(user.uid);
                              const val = profile?.referralBalance || 0;
                              setRedeemResult({ code, value: val });
                              setProfile(prev => prev ? { ...prev, referralBalance: 0 } : prev);
                            } catch (e: any) {
                              setRedeemError(e.message || 'Failed to generate code');
                            } finally {
                              setRedeemLoading(false);
                            }
                          }}
                          disabled={(profile?.referralBalance || 0) < 30 || redeemLoading}
                          className={`w-full ${luxuryBtn} disabled:from-gray-700 disabled:to-gray-600 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0`}
                        >
                          {redeemLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
                          {redeemLoading ? 'Generating…' : 'Generate Discount Code'}
                        </button>

                        {(profile?.referralBalance || 0) < 30 && (
                          <p className="text-[#3a5a82] text-xs flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500/60 flex-shrink-0" />
                            Need £{(30 - (profile?.referralBalance || 0)).toFixed(2)} more to unlock a discount code
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* How it works */}
                  <div className={`${cardBase} p-6`}>
                    <h2 className="text-white font-bold text-base mb-5">How It Works</h2>
                    <div className="space-y-4">
                      {[
                        { step: '01', title: 'Share your link', desc: 'Copy your unique referral link and share it with friends, colleagues, or on social media.' },
                        { step: '02', title: 'They register & spend £50', desc: 'When someone creates an account via your link and their cumulative spend reaches £50, the reward triggers.' },
                        { step: '03', title: 'You earn £5', desc: '£5 is added to your earnings balance for every qualifying referral. No limits on how much you can earn.' },
                        { step: '04', title: 'Redeem at £30', desc: 'Once your balance reaches £30, generate a discount code worth the full balance — applied instantly at checkout.' },
                      ].map((item) => (
                        <div key={item.step} className="flex gap-4 group">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-black flex items-center justify-center font-mono">
                            {item.step}
                          </div>
                          <div className="pt-1">
                            <p className="text-white text-sm font-semibold">{item.title}</p>
                            <p className="text-[#9cb8d9] text-xs mt-1 leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </motion.div>
              )}

              {/* ── PROFILE ── */}
              {activeTab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ position: 'relative', zIndex: 1 }}>
                  <div className={cardBase}>
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent pointer-events-none" />
                    <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
                      <h2 className="text-white font-bold text-base">Personal Details</h2>
                      <p className="text-[#3a5a82] text-xs mt-1">Update your profile and delivery information</p>
                    </div>

                    <div className="p-6 space-y-6">
                      {/* Personal info */}
                      <div>
                        <p className={sectionHeading}>Personal Information</p>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="profileFirstName" className="block text-xs text-[#9cb8d9] mb-1.5">First Name</label>
                            <input
                              id="profileFirstName"
                              value={editFirstName}
                              onChange={e => setEditFirstName(e.target.value)}
                              className={luxuryInput}
                              style={inputBaseStyle}
                              placeholder="First name"
                            />
                          </div>
                          <div>
                            <label htmlFor="profileLastName" className="block text-xs text-[#9cb8d9] mb-1.5">Last Name</label>
                            <input
                              id="profileLastName"
                              value={editLastName}
                              onChange={e => setEditLastName(e.target.value)}
                              className={luxuryInput}
                              style={inputBaseStyle}
                              placeholder="Last name"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-[#9cb8d9] mb-1.5">Email</label>
                            <p className="text-[#9cb8d9] text-sm py-3 px-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                              <span>{user.email}</span>
                              {user.emailVerified
                                ? <span className="flex items-center gap-1.5 text-emerald-400 text-xs"><Check className="w-3 h-3" />Verified</span>
                                : <span className="text-amber-400 text-xs">Unverified</span>}
                            </p>
                          </div>
                          <div className="sm:col-span-2">
                            <label htmlFor="profilePhone" className="block text-xs text-[#9cb8d9] mb-1.5">Phone</label>
                            <input
                              id="profilePhone"
                              value={editPhone}
                              onChange={e => { setEditPhone(e.target.value); setFieldErrors(p => ({ ...p, phone: undefined })); }}
                              className={fieldErrors.phone ? luxuryInputError : luxuryInput}
                              style={fieldErrors.phone ? inputErrorStyleBase : inputBaseStyle}
                              placeholder="+44 7700 900000"
                            />
                            {fieldErrors.phone && <p className="mt-1.5 text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" />{fieldErrors.phone}</p>}
                          </div>
                        </div>
                      </div>

                      {/* Delivery address */}
                      <div>
                        <p className={sectionHeading}>Delivery Address</p>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2">
                            <label htmlFor="profileAddress" className="block text-xs text-[#9cb8d9] mb-1.5">Street Address</label>
                            <input
                              id="profileAddress"
                              value={editAddress}
                              onChange={e => setEditAddress(e.target.value)}
                              className={luxuryInput}
                              style={inputBaseStyle}
                              placeholder="123 Example Street"
                            />
                          </div>
                          <div>
                            <label htmlFor="profileCity" className="block text-xs text-[#9cb8d9] mb-1.5">City</label>
                            <input
                              id="profileCity"
                              value={editCity}
                              onChange={e => setEditCity(e.target.value)}
                              className={luxuryInput}
                              style={inputBaseStyle}
                              placeholder="London"
                            />
                          </div>
                          <div>
                            <label htmlFor="profilePostcode" className="block text-xs text-[#9cb8d9] mb-1.5">Postcode</label>
                            <input
                              id="profilePostcode"
                              value={editPostcode}
                              onChange={e => { setEditPostcode(e.target.value); setFieldErrors(p => ({ ...p, postcode: undefined })); }}
                              className={fieldErrors.postcode ? luxuryInputError : luxuryInput}
                              style={fieldErrors.postcode ? inputErrorStyleBase : inputBaseStyle}
                              placeholder="SW1A 1AA"
                            />
                            {fieldErrors.postcode && <p className="mt-1.5 text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" />{fieldErrors.postcode}</p>}
                          </div>
                        </div>
                      </div>

                      {/* Save profile */}
                      {saveMsg && (
                        <p className={`text-sm flex items-center gap-2 ${saveMsg.includes('success') ? 'text-emerald-400' : 'text-red-400'}`}>
                          {saveMsg.includes('success') ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                          {saveMsg}
                        </p>
                      )}
                      <button
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                        className={`${luxuryBtn} disabled:from-gray-700 disabled:to-gray-600 disabled:shadow-none disabled:cursor-not-allowed`}
                      >
                        {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {savingProfile ? 'Saving…' : 'Save Changes'}
                      </button>

                      {/* Change password inline */}
                      <div className="pt-4 border-t border-white/[0.06]">
                        <p className={sectionHeading}>Change Password</p>
                        {!changingPassword ? (
                          <button onClick={() => setChangingPassword(true)} className={ghostBtn}>
                            <Edit2 className="w-4 h-4" /> Change Password
                          </button>
                        ) : (
                          <div className="space-y-4">
                            <div>
                              <label htmlFor="currentPwd" className="block text-xs text-[#9cb8d9] mb-1.5">Current Password</label>
                              <input id="currentPwd" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={luxuryInput} style={inputBaseStyle} placeholder="Enter current password" />
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                              <div>
                                <label htmlFor="newPwd" className="block text-xs text-[#9cb8d9] mb-1.5">New Password</label>
                                <input id="newPwd" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={luxuryInput} style={inputBaseStyle} placeholder="Min. 8 characters" />
                              </div>
                              <div>
                                <label htmlFor="confirmPwd" className="block text-xs text-[#9cb8d9] mb-1.5">Confirm New Password</label>
                                <input id="confirmPwd" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={luxuryInput} style={inputBaseStyle} placeholder="Repeat new password" />
                              </div>
                            </div>
                            {passwordError && <p className="text-red-400 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {passwordError}</p>}
                            {passwordSuccess && <p className="text-emerald-400 text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> {passwordSuccess}</p>}
                            <div className="flex gap-3">
                              <button onClick={() => { setChangingPassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }} className={ghostBtn}>
                                Cancel
                              </button>
                              <button onClick={handleChangePassword} disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword} className={`${luxuryBtn} disabled:from-gray-700 disabled:to-gray-600 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0`}>
                                {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {savingPassword ? 'Updating…' : 'Update Password'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── SECURITY ── */}
              {activeTab === 'security' && (
                <motion.div key="security" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ position: 'relative', zIndex: 1 }} className="space-y-5">

                  {/* Change password */}
                  <div className={cardBase}>
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent pointer-events-none" />
                    <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
                      <h2 className="text-white font-bold text-base">Password</h2>
                      <p className="text-[#3a5a82] text-xs mt-1">Keep your account secure</p>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label htmlFor="secCurrentPwd" className="block text-xs text-[#9cb8d9] mb-1.5">Current Password</label>
                        <input id="secCurrentPwd" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={luxuryInput} style={inputBaseStyle} placeholder="Enter current password" />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="secNewPwd" className="block text-xs text-[#9cb8d9] mb-1.5">New Password</label>
                          <input id="secNewPwd" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={luxuryInput} style={inputBaseStyle} placeholder="Min. 8 characters" />
                        </div>
                        <div>
                          <label htmlFor="secConfirmPwd" className="block text-xs text-[#9cb8d9] mb-1.5">Confirm New Password</label>
                          <input id="secConfirmPwd" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={luxuryInput} style={inputBaseStyle} placeholder="Repeat new password" />
                        </div>
                      </div>
                      {passwordError && <p className="text-red-400 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {passwordError}</p>}
                      {passwordSuccess && <p className="text-emerald-400 text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" /> {passwordSuccess}</p>}
                      <button onClick={handleChangePassword} disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword} className={`${luxuryBtn} disabled:from-gray-700 disabled:to-gray-600 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0`}>
                        {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {savingPassword ? 'Updating…' : 'Update Password'}
                      </button>
                    </div>
                  </div>

                  {/* Email verification status */}
                  <div className={`${cardBase} p-6`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${user.emailVerified ? 'bg-emerald-500/15 border border-emerald-500/25' : 'bg-amber-500/15 border border-amber-500/25'}`}>
                        {user.emailVerified ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Bell className="w-5 h-5 text-amber-400" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-semibold text-sm">
                          Email {user.emailVerified ? 'Verified' : 'Not Verified'}
                        </p>
                        <p className="text-[#9cb8d9] text-xs mt-1">{user.email}</p>
                        {!user.emailVerified && (
                          <div className="mt-3">
                            {verifSent && <p className="text-emerald-400 text-xs mb-2">Verification email sent! Check your inbox.</p>}
                            {verifError && <p className="text-red-400 text-xs mb-2">{verifError}</p>}
                            <button
                              onClick={handleResendVerification}
                              disabled={verifSending || verifCooldown > 0}
                              className={`${ghostBtn} text-sm`}
                            >
                              {verifSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                              {verifSending ? 'Sending…' : verifCooldown > 0 ? `Resend in ${verifCooldown}s` : 'Resend Verification'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Danger zone */}
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04]">
                    <div className="px-6 py-4 border-b border-red-500/15">
                      <h2 className="text-red-400 font-bold text-sm uppercase tracking-widest">Danger Zone</h2>
                    </div>
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-white font-semibold text-sm">Delete Account</p>
                          <p className="text-[#9cb8d9] text-xs mt-1">Permanently remove your account and all associated data. This action cannot be undone.</p>
                        </div>
                        {!showDeleteConfirm && (
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 rounded-xl text-sm font-medium transition-colors"
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                        )}
                      </div>

                      <AnimatePresence>
                        {showDeleteConfirm && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-5 space-y-4">
                              <p className="text-amber-300 text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                Enter your password to confirm permanent account deletion.
                              </p>
                              <input
                                type="password"
                                value={deletePassword}
                                onChange={e => setDeletePassword(e.target.value)}
                                placeholder="Your password"
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors"
                                style={{ background: '#0d1f38', border: '1.5px solid rgba(239,68,68,0.5)', color: '#fff', fontFamily: 'inherit' }}
                              />
                              {deleteError && (
                                <p className="text-red-400 text-xs flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5" /> {deleteError}
                                </p>
                              )}
                              <div className="flex gap-3">
                                <button onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); }} className={`${ghostBtn} flex-1`}>
                                  Cancel
                                </button>
                                <button
                                  onClick={handleDeleteAccount}
                                  disabled={deleting || !deletePassword}
                                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  {deleting ? 'Deleting…' : 'Confirm Delete'}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                </motion.div>
              )}

            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
