/**
 * Admin card: shows which UK postcode → address lookup provider is live
 * on checkout. Read-only status; no key values are ever returned.
 */
import { useEffect, useState } from 'react';
import { MapPin, Loader2, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { getPostcodeLookupStatus } from '@/lib/postcode-lookup.functions';

interface LookupStatus {
  provider: string;
  mode: string;
  health?: { ok: boolean; status?: number; reason?: string };
}

export default function PostcodeLookupCard() {
  const [status, setStatus] = useState<LookupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getPostcodeLookupStatus()
      .then(res => { if (alive) setStatus(res); })
      .catch(() => { if (alive) setStatus(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const isFull = status?.mode === 'full';
  const health = status?.health;
  const keyBroken = isFull && health && !health.ok;
  const providerLabel = status?.provider === 'getaddress'
    ? 'getAddress.io (paid)'
    : status?.provider === 'ideal'
      ? 'Ideal Postcodes (paid)'
      : 'postcodes.io (free)';


  return (
    <div className="bg-[#0b1a30] border border-white/[0.07] rounded-2xl p-5">
      <h2 className="text-white font-semibold flex items-center gap-2 text-sm">
        <MapPin className="w-4 h-4 text-emerald-400" />
        Checkout postcode lookup (UK)
      </h2>

      {loading ? (
        <p className="text-[#9cb8d9] text-sm mt-3 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking provider…
        </p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-[#9cb8d9] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Active provider: <span className="text-white font-medium">{providerLabel}</span>
          </p>
          <p className="text-[#9cb8d9]">
            Mode: <span className="text-white font-medium">
              {isFull ? 'Full addresses — customers pick their exact address' : 'City / county only — customers type the street line'}
            </span>
          </p>
          {isFull && health?.ok && (
            <p className="text-[#9cb8d9] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Key check: <span className="text-white font-medium">authorised — live test returned addresses</span>
            </p>
          )}
          {keyBroken && (
            <p className="text-amber-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-[2px] shrink-0" />
              <span>
                Key check failed{health?.status ? ` (HTTP ${health.status})` : ''}: {health?.reason}
                {' '}Checkout automatically falls back to the free city/county lookup until this is fixed.
              </span>
            </p>
          )}

          {!isFull && (
            <p className="text-[#8caad4] text-xs flex items-start gap-2 pt-1">
              <Info className="w-3.5 h-3.5 mt-[2px] shrink-0" />
              To switch to full address selection, add a <code className="text-emerald-300">GETADDRESS_API_KEY</code> (or
              <code className="text-emerald-300"> IDEAL_POSTCODES_API_KEY</code>) secret — the paid mode turns on
              automatically, no code change needed.
            </p>
          )}
          <p className="text-[#8caad4] text-xs">
            Lookup runs server-side and applies to United Kingdom addresses only. Germany, Poland, Ireland
            and Other keep manual entry.
          </p>
        </div>
      )}
    </div>
  );
}
