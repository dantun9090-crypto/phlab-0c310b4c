import { useEffect, useState, type FormEvent } from "react";
import { sendPublicMail } from "@/lib/sendPublicMail";
import { useSEO } from "@/hooks/useSEO";
import { trackEvent } from "@/lib/analytics";

const CATALOGUE_PDF_URL = "/PH-Labs-Research-Catalogue.pdf";

/**
 * /request-catalog — gated catalogue request flow.
 *
 * Qualified researchers submit institution + contact details. We email the
 * catalogue link via the same secured server endpoint used by /contact, and
 * also reveal an instant download link to the PDF after submission.
 */
export default function RequestCatalog() {
  const [form, setForm] = useState({
    name: "",
    institution: "",
    role: "",
    email: "",
    purpose: "",
    qualified: false,
    consent: false,
  });
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useSEO("request-catalog", {
    title: "Request Full Research Catalogue | PH Labs UK",
    metaDescription:
      "Qualified researchers and laboratories can request the full PH Labs research catalogue — HPLC-verified compounds, per-batch documentation, UK dispatch.",
    canonical: "https://phlabs.co.uk/request-catalog",
  });

  useEffect(() => {
    trackEvent("view_request_catalog", { location: "request_catalog_page" });
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.qualified) {
      setStatus("error");
      setErrorMsg("Please confirm you are a qualified researcher or institution.");
      return;
    }
    if (!form.consent) {
      setStatus("error");
      setErrorMsg("Please accept the GDPR consent to receive the catalogue.");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    trackEvent("submit_request_catalog", { location: "request_catalog_page" });
    try {
      const ok = await sendPublicMail({
        template: "contact",
        name: form.name,
        email: form.email,
        subject: `Catalogue Request — ${form.institution || "Independent Researcher"}`,
        message:
          `Catalogue request via /request-catalog\n\n` +
          `Institution: ${form.institution || "—"}\n` +
          `Role: ${form.role || "—"}\n` +
          `Research purpose: ${form.purpose || "—"}\n\n` +
          `Catalogue link sent: https://phlabs.co.uk${CATALOGUE_PDF_URL}`,
      });
      if (!ok) throw new Error("Mail delivery failed");
      setStatus("ok");
      trackEvent("request_catalog_success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error
          ? `We couldn't send your request: ${err.message}. You can still download the catalogue below.`
          : "We couldn't send your request. You can still download the catalogue below.",
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#060b18] text-white">
      <section className="border-b border-white/10 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.55em] text-[#c9a44c]">PH Labs · Catalogue</p>
          <h1 className="mt-6 text-[2.4rem] sm:text-5xl font-light leading-[1.1]" style={{ fontFamily: "'Cormorant Garamond',serif" }}>
            Request the Full <span className="italic text-[#c9a44c]">Research Catalogue</span>
          </h1>
          <div className="mx-auto mt-8 h-px w-16 bg-[#c9a44c]" />
          <p className="mt-8 text-white/70 leading-[1.75]">
            Qualified researchers and accredited laboratories can request our
            full catalogue with HPLC-verified compounds, per-batch
            documentation and current UK pricing. Submit your details and
            we'll email the catalogue plus give you an instant download link.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-24 bg-[#080e1f]">
        <div className="mx-auto max-w-3xl px-6">
          {status === "ok" ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 sm:p-12 text-center">
              <h2 className="text-2xl font-light mb-3" style={{ fontFamily: "'Cormorant Garamond',serif" }}>
                Catalogue on its way
              </h2>
              <p className="text-white/80 mb-8">
                We've emailed the catalogue to <strong>{form.email}</strong>.
                You can also download it instantly below.
              </p>
              <a
                href={CATALOGUE_PDF_URL}
                download
                onClick={() => trackEvent("download_catalog_pdf", { location: "request_catalog_success" })}
                className="inline-flex items-center justify-center px-10 py-4 rounded-full bg-[#c9a44c] text-[#060b18] text-[12px] tracking-[0.2em] uppercase font-semibold hover:brightness-110 transition-all"
              >
                Download Catalogue (PDF) →
              </a>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="rounded-2xl border border-white/[0.09] bg-[#060b18] p-8 sm:p-12 space-y-6"
              noValidate
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="Full Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required maxLength={120} placeholder="Dr. Jane Smith" />
                <Field label="Institution / Company *" value={form.institution} onChange={(v) => setForm({ ...form, institution: v })} required maxLength={200} placeholder="University / Laboratory" />
                <Field label="Role / Title" value={form.role} onChange={(v) => setForm({ ...form, role: v })} maxLength={120} placeholder="Principal Investigator" />
                <Field label="Email *" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required maxLength={320} placeholder="researcher@institution.ac.uk" />
              </div>
              <label className="block">
                <span className="block text-[11px] uppercase tracking-[0.3em] text-[#c9a44c] mb-2.5">Research purpose (optional)</span>
                <textarea
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  rows={4}
                  maxLength={1500}
                  placeholder="Briefly describe the intended laboratory or analytical research application."
                  className="w-full rounded-lg border-2 border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors resize-y min-h-[48px]"
                />
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.qualified}
                  onChange={(e) => setForm({ ...form, qualified: e.target.checked })}
                  className="mt-1 h-5 w-5 rounded border-2 border-slate-600 bg-slate-800 accent-[#c9a44c] flex-shrink-0"
                  required
                />
                <span className="text-sm text-white/75 leading-[1.7]">
                  I confirm I am a <strong>qualified researcher</strong> or
                  representative of an accredited laboratory / institution,
                  aged 18+, and that any materials supplied are for{" "}
                  <strong className="text-[#c9a44c]">research use only</strong>
                  {" "}— not for human consumption or any non-research application.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                  className="mt-1 h-5 w-5 rounded border-2 border-slate-600 bg-slate-800 accent-[#c9a44c] flex-shrink-0"
                  required
                />
                <span className="text-sm text-white/75 leading-[1.7]">
                  I consent to PH Labs processing my details to send the
                  catalogue, in line with the{" "}
                  <a href="/privacy-policy" className="text-[#c9a44c] underline underline-offset-4">Privacy Policy</a>.
                </span>
              </label>

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full sm:w-auto inline-flex items-center justify-center px-12 py-4 rounded-full bg-[#c9a44c] text-[#060b18] text-[12px] tracking-[0.2em] uppercase font-semibold hover:brightness-110 disabled:opacity-60 transition-all"
              >
                {status === "sending" ? "Sending…" : "Send me the catalogue →"}
              </button>

              {status === "error" && (
                <div role="alert" className="text-sm text-rose-200 border border-rose-500/40 bg-rose-500/10 rounded-lg px-5 py-4">
                  {errorMsg}
                  <div className="mt-3">
                    <a
                      href={CATALOGUE_PDF_URL}
                      download
                      onClick={() => trackEvent("download_catalog_pdf", { location: "request_catalog_error_fallback" })}
                      className="inline-flex items-center text-[#c9a44c] underline underline-offset-4"
                    >
                      Download catalogue directly
                    </a>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({
  label, value, onChange, required, maxLength, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; maxLength?: number; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.3em] text-[#c9a44c] mb-2.5">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 px-4 text-white placeholder-white/30 focus:border-[#c9a44c] focus:outline-none transition-colors"
      />
    </label>
  );
}
