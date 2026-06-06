import { useEffect, useState } from 'react';
import { Truck, Clock } from 'lucide-react';
import { checkNextDayEligibility, formatMinutesAsHHMM } from '@/lib/shipping/next-day';

/**
 * Live countdown to today's 11:30 GMT next-day-delivery cut-off.
 * Refreshes every 60s. Shows fallback copy on weekends/bank holidays/after cut-off.
 */
export default function NextDayCountdown() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const eligibility = checkNextDayEligibility();

  if (eligibility.qualifies) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/25">
        <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="text-[13px] text-emerald-200/90 leading-snug">
          Order within <span className="font-bold text-emerald-300 font-mono">{formatMinutesAsHHMM(eligibility.minutesUntilCutoff)}</span> for <span className="font-semibold text-emerald-300">Next Day delivery by 12 PM</span>
        </p>
        <span className="sr-only">{tick}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10">
      <Clock className="w-4 h-4 text-[#8caad4] shrink-0" />
      <p className="text-[12px] text-[#9cb8d9] leading-snug">
        Next Day by 12 PM available Monday–Friday before 11:30 AM (UK time, excl. bank holidays).
      </p>
      <span className="sr-only">{tick}</span>
    </div>
  );
}
