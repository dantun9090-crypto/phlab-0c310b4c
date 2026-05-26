import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Loader } from 'lucide-react';
import { db, auth, doc, getDoc, onAuthStateChanged } from '@/lib/firebase';

const DAILY_RESET_KEY = 'php_payment_fallback_date';

function markFallbackToday() {
  localStorage.setItem(DAILY_RESET_KEY, new Date().toISOString());
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-order' }
  | { kind: 'unauthorised' }
  | { kind: 'not-found' }
  | { kind: 'forbidden' }
  | { kind: 'paid' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      orderId: string;
      amount: number;
      reference: string;
      customerName: string;
      customerEmail: string;
    };

export default function PaymentPage() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: 'loading' | 'success' | 'error' } | null>(null);
  const [showBankFallback, setShowBankFallback] = useState(false);

  // Daily reset
  useEffect(() => {
    const stored = localStorage.getItem(DAILY_RESET_KEY);
    if (stored) {
      const storedDate = new Date(stored).toDateString();
      const today = new Date().toDateString();
      if (storedDate !== today) localStorage.removeItem(DAILY_RESET_KEY);
    }
  }, []);

  // Load order from Firestore by ?orderId= AFTER auth state resolves.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const orderId = params.get('orderId') || params.get('order') || '';

    if (!orderId) {
      setLoadState({ kind: 'no-order' });
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;
      if (!user) {
        setLoadState({ kind: 'unauthorised' });
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'orders', orderId));
        if (cancelled) return;
        if (!snap.exists()) {
          setLoadState({ kind: 'not-found' });
          return;
        }
        const data = snap.data() as any;
        // Authorisation: order must belong to current user
        if (data.userId && data.userId !== user.uid) {
          setLoadState({ kind: 'forbidden' });
          return;
        }
        // Block re-paying a settled order
        const settled = ['paid', 'completed', 'shipped', 'fulfilled', 'cancelled', 'refunded'];
        if (data.status && settled.includes(String(data.status).toLowerCase())) {
          setLoadState({ kind: 'paid' });
          return;
        }
        const amount = Number(data.totalAmount ?? data.total ?? 0);
        if (!amount || amount <= 0) {
          setLoadState({ kind: 'error', message: 'This order has no payable amount.' });
          return;
        }
        setLoadState({
          kind: 'ready',
          orderId,
          amount: +amount.toFixed(2),
          reference: data.orderNumber || orderId,
          customerName: data.customerName || `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || '',
          customerEmail: data.customerEmail || data.email || user.email || '',
        });
      } catch (err: any) {
        if (cancelled) return;
        setLoadState({ kind: 'error', message: err?.message || 'Failed to load order.' });
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const initiatePayment = async () => {
    if (loadState.kind !== 'ready') return;

    setIsLoading(true);
    setStatus({ message: 'Connecting to TrueLayer...', type: 'loading' });

    const API_URL = 'https://v0-truelayerpaymentgatewayfinal-caz5-mudhax92t.vercel.app/api/payment';

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Backend MUST look up the order by orderId in Firestore and use the
          // server-side totalAmount. The amount sent here is for display only
          // and must NOT be trusted by the payment gateway.
          orderId: loadState.orderId,
          amount: loadState.amount,
          currency: 'GBP',
          reference: loadState.reference,
          user_name: loadState.customerName,
          user_email: loadState.customerEmail,
          user_id: auth.currentUser?.uid || '',
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Payment failed' }));
        throw new Error(err.message || 'Payment failed');
      }

      const data = await response.json();

      if (data.success && data.hpp_url) {
        setStatus({ message: 'Redirecting to bank...', type: 'success' });
        window.location.href = data.hpp_url;
      } else {
        throw new Error(data.error || 'Payment failed');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      markFallbackToday();
      setShowBankFallback(true);
      setStatus(null);
      setIsLoading(false);
    }
  };

  const displayAmount = loadState.kind === 'ready' ? loadState.amount : 0;
  const reference = loadState.kind === 'ready' ? loadState.reference : '';
  const userName = loadState.kind === 'ready' ? loadState.customerName : '';
  const userEmail = loadState.kind === 'ready' ? loadState.customerEmail : '';

  // ----- Gate screens -----
  const renderGate = () => {
    const wrap = (title: string, msg: React.ReactNode) => (
      <div
        className="p-6 rounded-[20px] text-center"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          border: '1px solid rgba(233, 69, 96, 0.2)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          color: '#f0f6ff',
        }}
      >
        <h1 className="text-xl font-bold mb-3" style={{ color: '#e94560' }}>{title}</h1>
        <div className="text-sm" style={{ color: '#a0a0a0' }}>{msg}</div>
      </div>
    );

    switch (loadState.kind) {
      case 'loading':
        return wrap('Loading order…', <Loader className="w-5 h-5 animate-spin mx-auto mt-2" />);
      case 'no-order':
        return wrap(
          'No order selected',
          <>
            This payment page can only be opened from a checkout link that includes an order reference.
            Please return to <a href="/checkout" style={{ color: '#e94560' }}>checkout</a> or contact{' '}
            <a href="mailto:info@prohealthpeptides.co.uk" style={{ color: '#e94560' }}>info@prohealthpeptides.co.uk</a>.
          </>,
        );
      case 'unauthorised':
        return wrap(
          'Sign in required',
          <>
            Please <a href="/login" style={{ color: '#e94560' }}>sign in</a> with the account used to place this order.
          </>,
        );
      case 'not-found':
        return wrap('Order not found', <>We couldn't find that order. Please check your link or contact support.</>);
      case 'forbidden':
        return wrap('Not your order', <>This order belongs to a different account.</>);
      case 'paid':
        return wrap('Already settled', <>This order is no longer open for payment.</>);
      case 'error':
        return wrap('Something went wrong', loadState.message);
      default:
        return null;
    }
  };

  return (
    <>
      <Helmet>
        <title>Payment — Pro Health Peptides</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#060f1e' }}>
        <div className="w-full max-w-[420px]">

          {showBankFallback ? (
            <div
              className="p-6 rounded-[20px]"
              style={{
                background: 'linear-gradient(135deg, #0b1a30 0%, #0d1f38 100%)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              <div className="text-center mb-5">
                <div className="text-3xl mb-2">🏦</div>
                <h2 className="text-xl font-bold" style={{ color: '#10b981' }}>Complete via Bank Transfer</h2>
                <p className="text-sm mt-1" style={{ color: '#9cb8d9' }}>
                  Online payment is temporarily unavailable. Please send your payment directly to our bank account below.
                </p>
              </div>

              <div
                className="rounded-[12px] p-4 mb-4 space-y-2"
                style={{ background: 'rgba(16, 185, 129, 0.07)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
              >
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#9cb8d9' }}>Account Name</span>
                  <span className="font-semibold" style={{ color: '#f0f6ff' }}>Pro Health Peptides Ltd</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#9cb8d9' }}>Sort Code</span>
                  <span className="font-semibold font-mono" style={{ color: '#f0f6ff' }}>XX-XX-XX</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#9cb8d9' }}>Account Number</span>
                  <span className="font-semibold font-mono" style={{ color: '#f0f6ff' }}>XXXXXXXX</span>
                </div>
                {reference && (
                  <div className="flex justify-between text-sm pt-1 border-t" style={{ borderColor: 'rgba(16,185,129,0.15)' }}>
                    <span style={{ color: '#9cb8d9' }}>Reference</span>
                    <span className="font-semibold font-mono" style={{ color: '#10b981' }}>{reference}</span>
                  </div>
                )}
                {displayAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: '#9cb8d9' }}>Amount</span>
                    <span className="font-bold" style={{ color: '#f0f6ff' }}>£{displayAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-center mb-4" style={{ color: '#3a5a82' }}>
                Once payment is sent, email your receipt to{' '}
                <a href="mailto:info@prohealthpeptides.co.uk" style={{ color: '#10b981' }}>
                  info@prohealthpeptides.co.uk
                </a>{' '}
                with your order reference.
              </p>

              <button
                onClick={() => { setShowBankFallback(false); setStatus(null); }}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}
              >
                Try Online Payment Again
              </button>
            </div>
          ) : loadState.kind !== 'ready' ? (
            renderGate()
          ) : (

          <div
            className="p-6 rounded-[20px]"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              border: '1px solid rgba(233, 69, 96, 0.2)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
            }}
          >
            <h1
              className="text-center font-bold mb-6"
              style={{ color: '#e94560', fontSize: '22px', letterSpacing: '1px' }}
            >
              🔬 PH LABS Payment
            </h1>

            <div
              className="text-center p-5 rounded-[14px] mb-6"
              style={{
                background: 'linear-gradient(135deg, rgba(15, 52, 96, 0.6) 0%, rgba(233, 69, 96, 0.1) 100%)',
                border: '1px solid rgba(233, 69, 96, 0.2)',
              }}
            >
              <div className="text-xs uppercase mb-1.5" style={{ color: '#a0a0a0', letterSpacing: '2px' }}>GBP</div>
              <div className="font-bold" style={{ color: '#e94560', fontSize: '36px' }}>
                £{displayAmount.toFixed(2)}
              </div>
              <div className="text-[11px] mt-2" style={{ color: '#9cb8d9' }}>
                Amount locked to order — cannot be edited
              </div>
            </div>

            {/* Order summary (read-only) */}
            <div className="mb-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: '#a0a0a0' }}>Reference</span>
                <span className="font-mono" style={{ color: '#f0f6ff' }}>{reference}</span>
              </div>
              {userName && (
                <div className="flex justify-between">
                  <span style={{ color: '#a0a0a0' }}>Name</span>
                  <span style={{ color: '#f0f6ff' }}>{userName}</span>
                </div>
              )}
              {userEmail && (
                <div className="flex justify-between">
                  <span style={{ color: '#a0a0a0' }}>Email</span>
                  <span style={{ color: '#f0f6ff' }}>{userEmail}</span>
                </div>
              )}
            </div>

            <button
              onClick={initiatePayment}
              disabled={isLoading}
              className="w-full py-4 rounded-xl text-white text-base font-bold transition-all"
              style={{
                background: isLoading ? 'rgba(233, 69, 96, 0.6)' : 'linear-gradient(135deg, #e94560 0%, #c73e54 100%)',
                letterSpacing: '0.5px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                border: '1px solid transparent',
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                '💳 Pay with Bank Transfer'
              )}
            </button>

            {status && (
              <div
                className="mt-4 p-3.5 rounded-[10px] text-center text-sm font-medium"
                style={{
                  background:
                    status.type === 'loading' ? 'rgba(15, 52, 96, 0.6)'
                      : status.type === 'success' ? 'rgba(34, 197, 94, 0.1)'
                      : 'rgba(239, 68, 68, 0.1)',
                  color:
                    status.type === 'loading' ? '#e94560'
                      : status.type === 'success' ? '#22c55e'
                      : '#f87171',
                  border:
                    status.type === 'loading' ? '1px solid rgba(233, 69, 96, 0.3)'
                      : status.type === 'success' ? '1px solid rgba(34, 197, 94, 0.3)'
                      : '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                {status.message}
              </div>
            )}

            <div className="mt-4 text-center text-[11px]" style={{ color: '#666' }}>
              Powered by{' '}
              <a href="https://truelayer.com" target="_blank" rel="noopener noreferrer" style={{ color: '#e94560', textDecoration: 'none' }}>
                TrueLayer
              </a>{' '}
              | Secure bank transfer
            </div>
          </div>
          )}
        </div>
      </div>
    </>
  );
}
