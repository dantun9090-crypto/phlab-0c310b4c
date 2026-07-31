/**
 * UK postcode → address helper shown under the postcode field at checkout.
 *
 * Free mode  (postcodes.io): fills City / County automatically.
 * Paid mode  (getAddress.io / Ideal Postcodes key present): shows a
 *            dropdown of full addresses; picking one fills the street line too.
 *
 * Every field stays editable — this is a convenience, never a gate.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, MapPin, Check } from 'lucide-react';
import { lookupPostcode, type PostcodeLookupResult } from '@/lib/postcode-lookup.functions';

interface PostcodeLookupProps {
  postcode: string;
  /** Called with the fields the customer picked / that were found. */
  onApply: (patch: { address?: string; city?: string }) => void;
  disabled?: boolean;
}

const UK_POSTCODE_RE = /^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/;
const normalise = (v: string) => v.replace(/[\s\u00a0\u2007\u202f-]+/g, '').toUpperCase();

export default function PostcodeLookup({ postcode, onApply, disabled }: PostcodeLookupProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PostcodeLookupResult | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [manual, setManual] = useState(false);
  const lastLookedUp = useRef('');

  const pc = normalise(postcode);
  const valid = UK_POSTCODE_RE.test(pc);

  const run = async (value: string) => {
    const target = normalise(value);
    if (!UK_POSTCODE_RE.test(target)) return;
    lastLookedUp.current = target;
    setLoading(true);
    setError('');
    try {
      const res = await lookupPostcode({ data: { postcode: target } });
      if (normalise(postcode) !== target && lastLookedUp.current !== target) return;
      if (!res.ok) {
        setResult(null);
        setError(res.message || 'We could not find that postcode.');
        return;
      }
      setResult(res);
      setSelected('');
      // Free mode has no street data — fill the town straight away.
      if (res.mode === 'outcode' && res.city) onApply({ city: res.city });
    } catch {
      setResult(null);
      setError('Address lookup is unavailable right now — please enter your address manually.');
    } finally {
      setLoading(false);
    }
  };

  // Debounced automatic lookup once the postcode looks valid.
  useEffect(() => {
    if (manual || disabled) return;
    if (!valid) {
      setResult(null);
      setError('');
      return;
    }
    if (lastLookedUp.current === pc) return;
    const t = setTimeout(() => { void run(pc); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc, valid, manual, disabled]);

  if (manual) {
    return (
      <button
        type="button"
        onClick={() => { setManual(false); lastLookedUp.current = ''; }}
        className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
      >
        Use postcode address lookup
      </button>
    );
  }

  return (
    <div className="space-y-2" data-testid="postcode-lookup">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => { lastLookedUp.current = ''; void run(postcode); }}
          disabled={!valid || loading || disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {loading ? 'Searching…' : 'Find address'}
        </button>
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-xs text-gray-400 hover:text-gray-300 underline underline-offset-2"
        >
          Enter address manually
        </button>
      </div>

      {error && <p className="text-amber-400 text-xs">{error}</p>}

      {result?.ok && result.mode === 'full' && result.addresses.length > 0 && (
        <div>
          <label htmlFor="postcode-address-select" className="block text-xs font-medium text-gray-300 mb-1">
            Select your address ({result.addresses.length} found)
          </label>
          <select
            id="postcode-address-select"
            value={selected}
            onChange={e => {
              const idx = Number(e.target.value);
              setSelected(e.target.value);
              const a = result.addresses[idx];
              if (a) onApply({ address: a.line1, city: a.city || result.city });
            }}
            className="w-full border-2 border-slate-600 bg-slate-800 text-white min-h-[48px] rounded-lg px-3 text-sm"
          >
            <option value="">Choose an address…</option>
            {result.addresses.map((a, i) => (
              <option key={`${a.line1}-${i}`} value={i}>{a.line1}</option>
            ))}
          </select>
        </div>
      )}

      {result?.ok && result.mode === 'outcode' && result.city && (
        <p className="text-xs text-gray-400 inline-flex items-start gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-400 mt-[1px] shrink-0" />
          <span>
            Found <span className="text-gray-200 font-medium">{result.city}</span>
            {result.county && result.county !== result.city ? `, ${result.county}` : ''} — city filled in.
            Please add your street and house number above.
          </span>
        </p>
      )}

      {!result && !error && !loading && !valid && postcode.trim() && (
        <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Enter a full UK postcode to find your address.
        </p>
      )}
    </div>
  );
}
