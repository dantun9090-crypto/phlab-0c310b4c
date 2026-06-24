import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Gift, Sparkles, X } from "lucide-react";
import {
  submitSourceSurvey,
  skipSourceSurvey,
} from "@/lib/source-survey.functions";
import { auth } from "@/lib/firebase";

async function getOwnershipCreds(orderId: string): Promise<{
  idToken: string | null;
  paymentToken: string | null;
}> {
  let idToken: string | null = null;
  let paymentToken: string | null = null;
  try { idToken = (await auth.currentUser?.getIdToken()) ?? null; } catch { /* ignore */ }
  try { paymentToken = localStorage.getItem(`php_pt_${orderId}`); } catch { /* ignore */ }
  return { idToken, paymentToken };
}

/**
 * Inline post-purchase survey card shown at the bottom of the order
 * confirmation page. Completely optional — never blocks the user.
 *
 * Behaviour:
 *  - Skip → permanent dismiss for this session (sessionStorage)
 *  - Submit → flags order with answer, returns SAVE10 code IF this email
 *    has not already claimed it (server-enforced one-time per email).
 */

const SESSION_KEY_PREFIX = "php_survey_dismissed_";

const OPTIONS = [
  { id: "google_search", label: "Google Search" },
  { id: "advertisement", label: "Advertisement / Ad" },
  { id: "referral",      label: "From a friend / Referral" },
  { id: "social_media",  label: "Social Media" },
  { id: "other",         label: "Other" },
] as const;

type SourceId = (typeof OPTIONS)[number]["id"];
type Phase = "asking" | "submitting" | "thanks-with-code" | "thanks-no-code" | "skipped";

interface Props {
  orderId: string;
}

export default function SourceSurveyCard({ orderId }: Props) {
  const submit = useServerFn(submitSourceSurvey);
  const skip = useServerFn(skipSourceSurvey);

  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("asking");
  const [selected, setSelected] = useState<SourceId | null>(null);
  const [otherText, setOtherText] = useState("");
  const [rewardCode, setRewardCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // Honour per-session dismissal.
    try {
      if (sessionStorage.getItem(SESSION_KEY_PREFIX + orderId) === "1") {
        return;
      }
    } catch { /* ignore */ }
    setMounted(true);
    // Subtle 1.2s fade-in after payment success state is rendered.
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, [orderId]);

  if (!mounted || phase === "skipped") return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setPhase("submitting");
    setError("");
    try {
      const res = await submit({
        data: {
          orderId,
          source: selected,
          otherText: selected === "other" ? otherText : null,
        },
      });
      if (res.rewardCode) {
        setRewardCode(res.rewardCode);
        setPhase("thanks-with-code");
      } else {
        setPhase("thanks-no-code");
      }
    } catch (err: any) {
      setError(err?.message || "Could not submit. Please try again.");
      setPhase("asking");
    }
  }

  async function onSkip() {
    try {
      sessionStorage.setItem(SESSION_KEY_PREFIX + orderId, "1");
    } catch { /* ignore */ }
    // Fire and forget — survey is optional.
    skip({ data: { orderId } }).catch(() => { /* ignore */ });
    setPhase("skipped");
  }

  async function copyCode() {
    if (!rewardCode) return;
    try {
      await navigator.clipboard.writeText(rewardCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div
      className={`mt-8 transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur p-6 shadow-lg">
        {phase === "asking" || phase === "submitting" ? (
          <form onSubmit={onSubmit}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  How did you hear about PH LABS?
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Optional — takes 5 seconds and unlocks a reward.
                </p>
              </div>
              <button
                type="button"
                onClick={onSkip}
                aria-label="Skip survey"
                className="rounded-md p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {OPTIONS.map((opt) => {
                const active = selected === opt.id;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => setSelected(opt.id)}
                    className={`text-left rounded-lg border px-3 py-2.5 text-sm transition min-h-[44px] ${
                      active
                        ? "border-emerald-500 bg-emerald-500/10 text-white"
                        : "border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-600"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block w-3.5 h-3.5 rounded-full border ${
                          active ? "border-emerald-400 bg-emerald-500" : "border-slate-500"
                        }`}
                      />
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {selected === "other" && (
              <input
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value.slice(0, 200))}
                placeholder="Tell us more (optional)"
                className="mt-3 w-full rounded-lg border-2 border-slate-600 bg-slate-800 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none min-h-[44px]"
              />
            )}

            {error && (
              <p className="mt-3 text-xs text-rose-400">{error}</p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onSkip}
                className="text-xs text-slate-400 hover:text-slate-200 underline-offset-4 hover:underline"
              >
                No thanks
              </button>
              <button
                type="submit"
                disabled={!selected || phase === "submitting"}
                className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 px-4 py-2.5 text-sm font-semibold text-white transition min-h-[44px]"
              >
                {phase === "submitting" ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        ) : phase === "thanks-with-code" && rewardCode ? (
          <div className="text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="mt-3 text-lg font-semibold text-white">Thank you!</h2>
            <p className="mt-1 text-sm text-slate-300">
              Your reward — 10% off your next order.
            </p>
            <div className="relative mt-4 mx-auto max-w-xs">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/30 via-emerald-400/20 to-emerald-500/30 blur-md" />
              <div className="relative flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-slate-950/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono text-lg font-bold tracking-widest text-emerald-300">
                    {rewardCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500 hover:bg-emerald-400 px-2.5 py-1.5 text-xs font-semibold text-white transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              One use per customer. Apply at checkout on your next order.
            </p>
          </div>
        ) : (
          // thanks-no-code
          <div className="text-center py-2">
            <div className="mx-auto w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="mt-3 text-base font-semibold text-white">
              Thank you for your feedback!
            </h2>
          </div>
        )}
      </div>
    </div>
  );
}
