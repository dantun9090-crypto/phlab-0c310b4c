import { useState, useEffect } from 'react';
import { User, Mail, Lock, Eye, EyeOff, CheckCircle2, Loader2, Gift, Phone } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { registerUser, signInWithGoogle, ensureAppCheck, setAuthPersistence } from '@/lib/firebase';
import { evaluatePassword, summarisePolicyErrors } from '@/lib/password-policy';


export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    acceptedTerms: false,
  });
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Noindex for SEO
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    meta.id = 'noindex-register';
    document.head.appendChild(meta);
    return () => document.getElementById('noindex-register')?.remove();
  }, []);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Capture ?ref= from URL and store in localStorage
  useEffect(() => {
    // Warm up App Check token before the user submits.
    ensureAppCheck();
    const refFromUrl = searchParams.get('ref');
    if (refFromUrl) {
      localStorage.setItem('referrer_code', refFromUrl);
      setReferralCode(refFromUrl);
    } else {
      const stored = localStorage.getItem('referrer_code');
      if (stored) setReferralCode(stored);
    }
  }, [searchParams]);


  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await setAuthPersistence(rememberMe);
      await signInWithGoogle();
      navigate('/account');
    } catch (err: any) {
      setError('Google sign-in failed. Please try again or use email registration below.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }
    const policy = evaluatePassword(formData.password);
    if (!policy.ok) {
      setError(summarisePolicyErrors(policy.errors));
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!formData.acceptedTerms) {
      setError('You must accept the Terms & Conditions to create an account');
      return;
    }

    setLoading(true);

    try {
      await setAuthPersistence(rememberMe);
      await registerUser(
        formData.email,
        formData.password,
        formData.firstName,
        formData.lastName,
        referralCode || undefined,
        formData.phone || undefined,
        formData.acceptedTerms,
      );
      setSuccess(true);
      setTimeout(() => {
        navigate('/account');
      }, 2000);
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.code === 'auth/email-already-in-use' || err.message?.includes('Email already registered')) {
        setError('An account with this email already exists. Please login instead.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please use at least 8 characters');
      } else if (err.code === 'auth/invalid-api-key') {
        setError('System configuration error. Please contact support.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060f1e] py-12">
      <div className="container mx-auto px-6">
        <div className="max-w-md mx-auto">
          {/* Back to shop link */}
          <Link to="/products" className="inline-flex items-center gap-1.5 text-[#9cb8d9] hover:text-white text-sm mb-8 transition-colors group">
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Back to shop
          </Link>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 mb-4">
              <User className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
            <p className="text-[#9cb8d9]">Join PH Labs for exclusive benefits</p>
          </div>

          {/* Form Card */}
          <div className="bg-[#04101f]/70 border border-white/[0.08] rounded-2xl p-6 md:p-8">

            {/* Referral banner */}
            {referralCode && !success && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 mb-6 flex items-start gap-3">
                <Gift className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-emerald-300 font-semibold text-sm">You were invited!</p>
                  <p className="text-emerald-400/80 text-xs mt-0.5">
                    You've been referred by a friend. Create your account and start shopping.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {success ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Account Created!</h2>
                <p className="text-[#9cb8d9]">Redirecting to your account...</p>
              </div>
            ) : (
              <>
                {/* Google SSO */}
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleLoading || loading}
                  className="w-full flex items-center justify-center gap-3 py-2.5 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-900 rounded-lg text-sm font-medium transition-colors mb-5"
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#3a5a82]" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  {googleLoading ? 'Signing up...' : 'Sign up with Google'}
                </button>

                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[#3a5a82] text-xs">or sign up with email</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-firstName" className="block text-sm font-medium text-[#9cb8d9] mb-2">First Name</label>
                    <input
                      id="reg-firstName"
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      style={{ background: '#0d1f38', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', width: '100%', borderRadius: '10px', padding: '12px 16px', fontSize: '14px', outline: 'none', display: 'block', boxSizing: 'border-box' }}
                      placeholder="John"
                      autoComplete="given-name"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-lastName" className="block text-sm font-medium text-[#9cb8d9] mb-2">Last Name</label>
                    <input
                      id="reg-lastName"
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      style={{ background: '#0d1f38', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', width: '100%', borderRadius: '10px', padding: '12px 16px', fontSize: '14px', outline: 'none', display: 'block', boxSizing: 'border-box' }}
                      placeholder="Doe"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="reg-email" className="block text-sm font-medium text-[#9cb8d9] mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a5a82] pointer-events-none z-10" />
                    <input
                      id="reg-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      style={{ background: '#0d1f38', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', width: '100%', borderRadius: '10px', padding: '12px 16px 12px 48px', fontSize: '14px', outline: 'none', display: 'block', boxSizing: 'border-box' }}
                      placeholder="john@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="reg-password" className="block text-sm font-medium text-[#9cb8d9] mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a5a82] pointer-events-none z-10" />
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      style={{ background: '#0d1f38', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', width: '100%', borderRadius: '10px', padding: '12px 48px', fontSize: '14px', outline: 'none', display: 'block', boxSizing: 'border-box' }}
                      placeholder="Min. 12 characters, 1 upper, 1 number, 1 symbol"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3a5a82] hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {formData.password && (() => {
                    const p = evaluatePassword(formData.password);
                    return (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[0,1,2,3,4].map(i => (
                            <div key={i} className={`h-1 flex-1 rounded-full ${i < p.score ? p.color : 'bg-white/10'}`} />
                          ))}
                        </div>
                        <p className={`text-xs ${p.ok ? 'text-emerald-400' : 'text-[#9cb8d9]'}`}>
                          {p.label}{!p.ok && p.errors.length > 0 ? ` — needs: ${p.errors.join(', ')}` : ''}
                        </p>
                      </div>
                    );
                  })()}
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="reg-confirmPassword" className="block text-sm font-medium text-[#9cb8d9] mb-2">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a5a82] pointer-events-none z-10" />
                    <input
                      id="reg-confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      style={{ background: '#0d1f38', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', width: '100%', borderRadius: '10px', padding: '12px 48px', fontSize: '14px', outline: 'none', display: 'block', boxSizing: 'border-box' }}
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3a5a82] hover:text-white"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Phone (optional) */}
                <div>
                  <label htmlFor="reg-phone" className="block text-sm font-medium text-[#9cb8d9] mb-2">Phone <span className="text-[#3a5a82] font-normal">(optional)</span></label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#3a5a82] pointer-events-none z-10" />
                    <input
                      id="reg-phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      style={{ background: '#0d1f38', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', width: '100%', borderRadius: '10px', padding: '12px 16px 12px 48px', fontSize: '14px', outline: 'none', display: 'block', boxSizing: 'border-box' }}
                      placeholder="+44 7700 000000"
                      autoComplete="tel"
                    />
                  </div>
                </div>

                {/* Terms & Conditions checkbox */}
                <div>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative mt-0.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={formData.acceptedTerms}
                        onChange={(e) => setFormData({ ...formData, acceptedTerms: e.target.checked })}
                        className="sr-only"
                        id="reg-terms"
                      />
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${formData.acceptedTerms ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent border-white/30 group-hover:border-white/50'}`}
                      >
                        {formData.acceptedTerms && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-[#9cb8d9] leading-snug">
                      I am 18+ and agree to the{' '}
                      <Link to="/terms-and-conditions" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noopener">Terms & Conditions</Link>
                      {' '}and{' '}
                      <Link to="/privacy-policy" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noopener">Privacy Policy</Link>.
                      I confirm these products are for laboratory research use only.
                    </span>
                  </label>
                </div>

                {/* Remember me */}
                <label className="flex items-center gap-2 text-[#9cb8d9] text-sm select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-[#0d1f38] accent-emerald-500"
                  />
                  Keep me signed in on this device
                </label>


                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </form>
              </>
            )}

            {/* Login Link */}
            {!success && (
              <div className="mt-6 text-center">
                <p className="text-[#9cb8d9]">
                  Already have an account?{' '}
                  <Link to="/account" className="text-blue-400 hover:text-blue-300 font-medium">
                    Sign in
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
