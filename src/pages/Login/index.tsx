import { useState, useEffect, useRef } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginUser, resetPassword, signInWithGoogle, setAuthPersistence, db, doc, getDoc } from '@/lib/firebase';
import { formatRemaining } from '@/lib/login-lockout';
import { logSecurityEvent } from '@/lib/security-events';

import { motion, AnimatePresence } from 'framer-motion';

interface SiteSettings {
  whatsappNumber?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  twitterUrl?: string;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [lockoutMs, setLockoutMs] = useState(0);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Noindex for SEO
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    meta.id = 'noindex-login';
    document.head.appendChild(meta);
    return () => document.getElementById('noindex-login')?.remove();
  }, []);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [settings, setSettings] = useState<SiteSettings>({});
  const redirectTarget = (() => {
    const value = new URLSearchParams(location.search).get('redirect') || '/account';
    return value.startsWith('/') && !value.startsWith('//') ? value : '/account';
  })();

  useEffect(() => {
    getDoc(doc(db, 'settings', 'siteSettings')).then(snap => {
      if (snap.exists()) setSettings(snap.data() as SiteSettings);
    }).catch(() => {});
  }, []);


  // Tick lockout countdown
  useEffect(() => {
    if (lockoutMs <= 0) {
      if (lockoutTimerRef.current) { clearInterval(lockoutTimerRef.current); lockoutTimerRef.current = null; }
      return;
    }
    lockoutTimerRef.current = setInterval(() => {
      setLockoutMs(ms => Math.max(0, ms - 1000));
    }, 1000);
    return () => { if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current); };
  }, [lockoutMs]);

  const isAdminTarget = redirectTarget.startsWith('/admin');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (lockoutMs > 0) return;
    setLoading(true);
    const startedAt = Date.now();
    try {
      // E: session persistence based on "Remember me"
      await setAuthPersistence(rememberMe);
      await loginUser(formData.email, formData.password);
      navigate(redirectTarget);
    } catch (err: any) {
      // C: 3-second artificial delay for /admin login failures
      if (isAdminTarget) {
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, 3000 - elapsed);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        // Admin audit log (item 10)
        logSecurityEvent({
          type: 'admin_login_failure',
          route: '/admin/login',
          message: err?.code || err?.message || 'unknown',
          meta: { email: formData.email },
        });
      }
      if (err?.code === 'auth/account-locked') {
        const remaining = (err as any).remainingMs ?? 0;
        setLockoutMs(remaining);
        setError(`Account locked. Try again in ${formatRemaining(remaining)}.`);
        logSecurityEvent({ type: 'login_lockout', message: 'lockout', meta: { email: formData.email } });
      } else if (err?.code === 'auth/user-not-found') setError('No account found with this email.');
      else if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') setError('Incorrect email or password.');
      else setError(err?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await setAuthPersistence(rememberMe);
      await signInWithGoogle();
      navigate(redirectTarget);
    } catch (err: any) {
      console.error('Google sign-in error:', err?.code, err?.message);
      if (err?.code === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setError('Sign-in window was closed. Please try again.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorised for Google sign-in. Please use email/password login instead.');
      } else {
        setError(err?.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      await resetPassword(resetEmail);
      setResetSent(true);
    } catch (err: any) {
      setResetError(err.code === 'auth/user-not-found' ? 'No account found with this email.' : (err.message || 'Failed to send reset email.'));
    } finally {
      setResetLoading(false);
    }
  };

  const shareUrl = encodeURIComponent(window.location.origin);
  const shareText = encodeURIComponent('PH Labs — Premium research-grade peptides. Check it out!');
  const whatsappHref = settings.whatsappNumber
    ? `https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}`
    : null;

  return (
    <div className="min-h-screen bg-[#030812] flex">
      {/* Left panel — decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/25 via-gray-950 to-teal-900/20" />
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-emerald-500/8 rounded-full" />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full" />
        {/* Floating DNA-like circles — CSS-only, GPU composited */}
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full border border-blue-500/20"
            style={{
              width: 60 + i * 70,
              height: 60 + i * 70,
              animation: `loginOrbit ${20 + i * 5}s linear infinite`,
              animationDirection: i % 2 === 0 ? 'normal' : 'reverse',
            }}
          />
        ))}
        <div className="relative z-10 text-center px-12">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/25">
            <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              <path d="M8 12h8M12 8v8" strokeLinecap="round"/>
            </svg>
          </div>
          <p className="text-3xl font-bold text-white mb-3">PH Labs</p>
          <p className="text-[#9cb8d9] text-sm leading-relaxed max-w-xs mx-auto">
            Premium research-grade peptides, HPLC-tested before every dispatch.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {['HPLC Tested', 'Batch Documented', 'UK Based', 'Fast Shipping'].map(tag => (
              <span key={tag} className="px-3 py-1 bg-white/5 border border-white/[0.08] rounded-full text-xs text-gray-300">{tag}</span>
            ))}
          </div>

          {/* Social links on panel */}
          <div className="mt-10 flex items-center justify-center gap-4">
            {settings.facebookUrl && (
              <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-emerald-600/25 border border-white/[0.08] hover:border-emerald-500/40 flex items-center justify-center transition-all">
                <svg className="w-4 h-4 text-[#9cb8d9] hover:text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
                </svg>
              </a>
            )}
            {settings.instagramUrl && (
              <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-pink-600/30 border border-white/[0.08] hover:border-pink-500/40 flex items-center justify-center transition-all">
                <svg className="w-4 h-4 text-[#9cb8d9]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
                </svg>
              </a>
            )}
            {settings.twitterUrl && (
              <a href={settings.twitterUrl} target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-sky-600/30 border border-white/[0.08] hover:border-sky-500/40 flex items-center justify-center transition-all">
                <svg className="w-4 h-4 text-[#9cb8d9]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
            )}
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-green-600/30 border border-white/[0.08] hover:border-green-500/40 flex items-center justify-center transition-all">
                <svg className="w-4 h-4 text-[#9cb8d9]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Back to shop link */}
          <Link to="/products" className="inline-flex items-center gap-1.5 text-[#9cb8d9] hover:text-white text-sm mb-8 transition-colors group">
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Back to shop
          </Link>
          <AnimatePresence mode="wait">
            {mode === 'login' ? (
              <motion.div key="login" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }}>
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-white">Welcome back</h1>
                  <p className="text-[#9cb8d9] mt-1.5 text-sm">Sign in to your account to continue</p>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="mb-5 flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
                      <AlertIcon />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Google */}
                <button onClick={handleGoogle} disabled={googleLoading || loading}
                  className="w-full flex items-center justify-center gap-3 py-3 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-900 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-white/5 mb-5">
                  {googleLoading ? <Loader2 className="w-4 h-4 animate-spin text-[#3a5a82]" /> : <GoogleIcon />}
                  {googleLoading ? 'Signing in...' : 'Continue with Google'}
                </button>

                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px bg-white/8" />
                  <span className="text-gray-600 text-xs tracking-wide">or sign in with email</span>
                  <div className="flex-1 h-px bg-white/8" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="login-email" className="block text-[#9cb8d9] text-xs font-medium mb-1.5 tracking-wide">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a5a82] pointer-events-none z-10" />
                      <input id="login-email" type="email" value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="you@example.com" required autoComplete="email"
                        style={{ background: '#0d1f38', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', width: '100%', borderRadius: '12px', padding: '12px 16px 12px 40px', fontSize: '14px', outline: 'none', display: 'block' }}
                        onFocus={e => (e.target.style.borderColor = '#3b82f6')}
                        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.25)')}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="login-password" className="text-[#9cb8d9] text-xs font-medium tracking-wide">Password</label>
                      <button type="button" onClick={() => { setMode('forgot'); setResetEmail(formData.email); }}
                        className="text-blue-400 hover:text-blue-300 text-xs transition-colors">Forgot password?</button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a5a82] pointer-events-none z-10" />
                      <input id="login-password" type={showPassword ? 'text' : 'password'} value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Your password" required autoComplete="current-password"
                        style={{ background: '#0d1f38', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', width: '100%', borderRadius: '12px', padding: '12px 44px 12px 40px', fontSize: '14px', outline: 'none', display: 'block' }}
                        onFocus={e => (e.target.style.borderColor = '#3b82f6')}
                        onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.25)')}
                      />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#3a5a82] hover:text-white transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-[#9cb8d9] text-xs mt-1 select-none cursor-pointer">
                    <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-[#0d1f38] accent-emerald-500" />
                    Remember me on this device
                  </label>

                  {lockoutMs > 0 && (
                    <div className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                      Account temporarily locked. Try again in {formatRemaining(lockoutMs)}.
                    </div>
                  )}

                  <button type="submit" disabled={loading || googleLoading || lockoutMs > 0}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 mt-1">
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {lockoutMs > 0 ? `Locked (${formatRemaining(lockoutMs)})` : (loading ? 'Signing in...' : 'Sign In')}
                  </button>
                </form>

                <p className="text-center text-[#3a5a82] text-sm mt-6">
                  Don't have an account?{' '}
                  <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">Create one free</Link>
                </p>

                {/* Social share row */}
                <div className="mt-8 pt-6 border-t border-white/5">
                  <p className="text-gray-600 text-xs text-center mb-3">Share with colleagues</p>
                  <div className="flex items-center justify-center gap-3">
                    {/* WhatsApp share */}
                    <a href={`https://wa.me/?text=${shareText}%20${shareUrl}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/15 hover:bg-green-600/25 border border-green-600/30 text-green-400 rounded-lg text-xs font-medium transition-all">
                      <WhatsAppIcon className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                    {/* Facebook share */}
                    <a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700/15 hover:bg-emerald-700/25 border border-emerald-700/30 text-emerald-400 rounded-lg text-xs font-medium transition-all">
                      <FacebookIcon className="w-3.5 h-3.5" /> Facebook
                    </a>
                    {/* X/Twitter share */}
                    <a href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b1a30] hover:bg-[#0f2040] border border-white/[0.08] text-gray-300 rounded-lg text-xs font-medium transition-all">
                      <XIcon className="w-3.5 h-3.5" /> Share
                    </a>
                  </div>
                </div>

                {/* WhatsApp contact button if set */}
                {whatsappHref && (
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-green-600/10 hover:bg-green-600/20 border border-green-600/20 text-green-400 rounded-xl text-sm font-medium transition-all">
                    <WhatsAppIcon className="w-4 h-4" />
                    Chat with us on WhatsApp
                  </a>
                )}
              </motion.div>
            ) : (
              <motion.div key="forgot" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }}>
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-white">{resetSent ? 'Check your inbox' : 'Reset password'}</h1>
                  <p className="text-[#9cb8d9] mt-1.5 text-sm">{resetSent ? 'A reset link is on its way.' : "We'll email you a reset link."}</p>
                </div>

                {resetSent ? (
                  <div className="text-center py-6 space-y-4">
                    <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-10 h-10 text-green-400" />
                    </div>
                    <p className="text-[#9cb8d9] text-sm">Reset link sent to <span className="text-white font-medium">{resetEmail}</span>. Check your spam folder too.</p>
                    <button onClick={() => { setMode('login'); setResetSent(false); }}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors mt-2">
                      Back to Sign In
                    </button>
                  </div>
                ) : (
                  <>
                    {resetError && (
                      <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{resetError}</div>
                    )}
                    <form onSubmit={handleReset} className="space-y-4">
                      <div>
                        <label htmlFor="reset-email" className="block text-[#9cb8d9] text-xs font-medium mb-1.5">Email address</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3a5a82]" />
                          <input id="reset-email" type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                            placeholder="you@example.com" required
                            className="w-full bg-[#060f1e] border border-white/[0.08] hover:border-white/20 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-gray-600 outline-none transition-colors" />
                        </div>
                      </div>
                      <button type="submit" disabled={resetLoading}
                        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2">
                        {resetLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {resetLoading ? 'Sending...' : 'Send Reset Link'}
                      </button>
                    </form>
                    <button onClick={() => setMode('login')}
                      className="w-full mt-4 text-[#3a5a82] hover:text-white text-sm transition-colors text-center">
                      ← Back to Sign In
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Inline SVG icon helpers ───────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}
function WhatsAppIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function FacebookIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
    </svg>
  );
}
function XIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
