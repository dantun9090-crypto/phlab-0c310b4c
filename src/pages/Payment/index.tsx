import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Loader } from 'lucide-react';

const DAILY_RESET_KEY = 'php_payment_fallback_date';

function markFallbackToday() {
  localStorage.setItem(DAILY_RESET_KEY, new Date().toISOString());
}

export default function PaymentPage() {
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: 'loading' | 'success' | 'error' } | null>(null);
  const [showBankFallback, setShowBankFallback] = useState(false);

  useEffect(() => {
    // Daily reset: if fallback was shown today, clear it for a fresh attempt
    const stored = localStorage.getItem(DAILY_RESET_KEY);
    if (stored) {
      const storedDate = new Date(stored).toDateString();
      const today = new Date().toDateString();
      if (storedDate !== today) {
        localStorage.removeItem(DAILY_RESET_KEY);
      }
    }
    // Generate user ID if not exists
    if (!userId) {
      const newUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      setUserId(newUserId);
    }
  }, [userId]);

  const displayAmount = parseFloat(amount) || 0;

  const initiatePayment = async () => {
    const amountNum = parseFloat(amount);
    
    if (!amountNum || amountNum <= 0) {
      setStatus({ message: 'Please enter a valid amount', type: 'error' });
      return;
    }

    setIsLoading(true);
    setStatus({ message: 'Connecting to TrueLayer...', type: 'loading' });

    const API_URL = 'https://v0-truelayerpaymentgatewayfinal-caz5-mudhax92t.vercel.app/api/payment';

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          currency: 'GBP',
          reference: reference || 'PH-LABS-' + Date.now(),
          user_name: userName,
          user_email: userEmail,
          user_id: userId,
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
      // Show friendly fallback instead of raw error
      markFallbackToday();
      setShowBankFallback(true);
      setStatus(null);
      setIsLoading(false);
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

          {/* Bank Transfer Fallback */}
          {showBankFallback ? (
            <div
              className="p-6 rounded-[20px] shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #0b1a30 0%, #0d1f38 100%)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              <div className="text-center mb-5">
                <div className="text-3xl mb-2">🏦</div>
                <h2 className="text-xl font-bold" style={{ color: '#10b981' }}>Complete via Bank Transfer</h2>
                <p className="text-sm mt-1" style={{ color: '#6b8fba' }}>
                  Online payment is temporarily unavailable. Please send your payment directly to our bank account below.
                </p>
              </div>

              <div
                className="rounded-[12px] p-4 mb-4 space-y-2"
                style={{ background: 'rgba(16, 185, 129, 0.07)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
              >
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#6b8fba' }}>Account Name</span>
                  <span className="font-semibold" style={{ color: '#f0f6ff' }}>Pro Health Peptides Ltd</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#6b8fba' }}>Sort Code</span>
                  <span className="font-semibold font-mono" style={{ color: '#f0f6ff' }}>XX-XX-XX</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#6b8fba' }}>Account Number</span>
                  <span className="font-semibold font-mono" style={{ color: '#f0f6ff' }}>XXXXXXXX</span>
                </div>
                {reference && (
                  <div className="flex justify-between text-sm pt-1 border-t" style={{ borderColor: 'rgba(16,185,129,0.15)' }}>
                    <span style={{ color: '#6b8fba' }}>Reference</span>
                    <span className="font-semibold font-mono" style={{ color: '#10b981' }}>{reference}</span>
                  </div>
                )}
                {amount && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: '#6b8fba' }}>Amount</span>
                    <span className="font-bold" style={{ color: '#f0f6ff' }}>£{parseFloat(amount).toFixed(2)}</span>
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
          ) : (

          /* Payment Container */
          <div
            className="p-6 rounded-[20px] shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              border: '1px solid rgba(233, 69, 96, 0.2)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
            }}
          >
            {/* Title */}
            <h1
              className="text-center font-bold mb-6"
              style={{
                color: '#e94560',
                fontSize: '22px',
                letterSpacing: '1px',
              }}
            >
              🔬 PH LABS Payment
            </h1>

            {/* Amount Display */}
            <div
              className="text-center p-5 rounded-[14px] mb-6"
              style={{
                background: 'linear-gradient(135deg, rgba(15, 52, 96, 0.6) 0%, rgba(233, 69, 96, 0.1) 100%)',
                border: '1px solid rgba(233, 69, 96, 0.2)',
              }}
            >
              <div
                className="text-xs uppercase mb-1.5"
                style={{
                  color: '#a0a0a0',
                  letterSpacing: '2px',
                }}
              >
                GBP
              </div>
              <div
                className="font-bold"
                style={{
                  color: '#e94560',
                  fontSize: '36px',
                }}
              >
                £{displayAmount.toFixed(2)}
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label
                className="block text-[11px] uppercase font-semibold mb-2"
                style={{
                  color: '#a0a0a0',
                  letterSpacing: '1.5px',
                }}
              >
                Amount (£)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0.01"
                className="w-full px-4 py-3.5 rounded-xl text-white text-base transition-all outline-none"
                style={{
                  background: 'rgba(15, 52, 96, 0.4)',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#e94560';
                  e.target.style.outline = '3px solid rgba(233, 69, 96, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.outline = 'none';
                }}
              />
            </div>

            {/* Reference */}
            <div className="mb-4">
              <label
                className="block text-[11px] uppercase font-semibold mb-2"
                style={{
                  color: '#a0a0a0',
                  letterSpacing: '1.5px',
                }}
              >
                Reference
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Order-123"
                className="w-full px-4 py-3.5 rounded-xl text-white text-base transition-all outline-none"
                style={{
                  background: 'rgba(15, 52, 96, 0.4)',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#e94560';
                  e.target.style.outline = '3px solid rgba(233, 69, 96, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.outline = 'none';
                }}
              />
            </div>

            {/* Your Name */}
            <div className="mb-4">
              <label
                className="block text-[11px] uppercase font-semibold mb-2"
                style={{
                  color: '#a0a0a0',
                  letterSpacing: '1.5px',
                }}
              >
                Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-3.5 rounded-xl text-white text-base transition-all outline-none"
                style={{
                  background: 'rgba(15, 52, 96, 0.4)',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#e94560';
                  e.target.style.outline = '3px solid rgba(233, 69, 96, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.outline = 'none';
                }}
              />
            </div>

            {/* Email */}
            <div className="mb-4">
              <label
                className="block text-[11px] uppercase font-semibold mb-2"
                style={{
                  color: '#a0a0a0',
                  letterSpacing: '1.5px',
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full px-4 py-3.5 rounded-xl text-white text-base transition-all outline-none"
                style={{
                  background: 'rgba(15, 52, 96, 0.4)',
                  border: '2px solid rgba(255, 255, 255, 0.1)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#e94560';
                  e.target.style.outline = '3px solid rgba(233, 69, 96, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.outline = 'none';
                }}
              />
            </div>

            {/* Pay Button */}
            <button
              onClick={initiatePayment}
              disabled={isLoading}
              className="w-full py-4 rounded-xl text-white text-base font-bold transition-all"
              style={{
                background: isLoading ? 'rgba(233, 69, 96, 0.6)' : 'linear-gradient(135deg, #e94560 0%, #c73e54 100%)',
                letterSpacing: '0.5px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.18)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.border = '1px solid transparent';
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

            {/* Status */}
            {status && (
              <div
                className="mt-4 p-3.5 rounded-[10px] text-center text-sm font-medium"
                style={{
                  background:
                    status.type === 'loading'
                      ? 'rgba(15, 52, 96, 0.6)'
                      : status.type === 'success'
                      ? 'rgba(34, 197, 94, 0.1)'
                      : 'rgba(239, 68, 68, 0.1)',
                  color:
                    status.type === 'loading'
                      ? '#e94560'
                      : status.type === 'success'
                      ? '#22c55e'
                      : '#f87171',
                  border:
                    status.type === 'loading'
                      ? '1px solid rgba(233, 69, 96, 0.3)'
                      : status.type === 'success'
                      ? '1px solid rgba(34, 197, 94, 0.3)'
                      : '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                {status.message}
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 text-center text-[11px]" style={{ color: '#666' }}>
              Powered by{' '}
              <a href="https://truelayer.com" target="_blank" rel="noopener noreferrer" style={{ color: '#e94560', textDecoration: 'none' }}>
                TrueLayer
              </a>{' '}
              | Secure bank transfer
            </div>
          </div>
          )} {/* end conditional */}
        </div>
      </div>
    </>
  );
}
