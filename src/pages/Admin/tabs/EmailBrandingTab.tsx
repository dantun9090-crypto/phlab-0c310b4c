import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { render } from "@react-email/render";
import { db } from "@/lib/firebase";
import { logAdminAction } from "@/lib/auditLogger";
import {
  DEFAULT_EMAIL_BRAND,
  FONT_STACKS,
  withDefaults,
  type EmailBrandConfig,
} from "@/lib/email-templates/brand-config";
import { TEMPLATE_LIST, getTemplate } from "@/lib/email-templates/registry";

/**
 * Email Branding admin tab.
 *
 * Edits the Firestore doc `emailBrandConfig/default`. All rich HTML
 * campaign templates read from this doc at render time (both admin
 * live preview and the send-marketing server route). Preview is
 * rendered entirely client-side using @react-email/render → iframe
 * srcDoc, so it updates on every keystroke with zero network cost.
 */

const DOC_PATH = ["emailBrandConfig", "default"] as const;

type Device = "desktop" | "mobile";

const inputCls =
  "w-full border-2 border-slate-600 bg-slate-800 text-white min-h-[48px] rounded-lg px-3 outline-none focus:border-emerald-500";
const labelCls = "text-sm font-medium text-slate-300 mb-1 block";
const cardCls = "bg-slate-900 border border-slate-800 rounded-lg p-4";

const RADIUS_OPTIONS = [0, 8, 16] as const;

export default function EmailBrandingTab() {
  const [brand, setBrand] = useState<EmailBrandConfig>(DEFAULT_EMAIL_BRAND);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [templateId, setTemplateId] = useState<string>(TEMPLATE_LIST[0]?.id ?? "promo-sale");
  const [device, setDevice] = useState<Device>("desktop");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const renderTokenRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, ...DOC_PATH));
        if (snap.exists()) {
          setBrand(withDefaults(snap.data() as Partial<EmailBrandConfig>));
        }
      } catch (err) {
        console.warn("[EmailBrandingTab] load failed", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeTemplate = useMemo(() => getTemplate(templateId), [templateId]);

  // Debounced client-side render of the active template with current brand.
  useEffect(() => {
    if (!activeTemplate) return;
    const token = ++renderTokenRef.current;
    const handle = window.setTimeout(async () => {
      try {
        const element = activeTemplate.render({
          brand,
          content: activeTemplate.sample,
        });
        const html = await render(element);
        if (renderTokenRef.current === token) setPreviewHtml(html);
      } catch (err) {
        console.warn("[EmailBrandingTab] preview render failed", err);
      }
    }, 120);
    return () => window.clearTimeout(handle);
  }, [brand, activeTemplate]);

  const update = <K extends keyof EmailBrandConfig>(key: K, value: EmailBrandConfig[K]) => {
    setBrand((prev) => ({ ...prev, [key]: value }));
  };
  const updateSocial = (key: keyof EmailBrandConfig["socialLinks"], value: string) => {
    setBrand((prev) => ({
      ...prev,
      socialLinks: { ...(prev.socialLinks || {}), [key]: value },
    }));
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await setDoc(
        doc(db, ...DOC_PATH),
        { ...brand, updatedAt: serverTimestamp() },
        { merge: true },
      );
      await logAdminAction({
        action: "email.brand.update",
        target: `emailBrandConfig/default`,
        meta: { primaryColor: brand.primaryColor, fontFamily: brand.fontFamily },
      });
      setMsg({ type: "success", text: "Brand config saved. Future campaigns will use it." });
      setTimeout(() => setMsg(null), 6000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      setMsg({ type: "error", text: `Save failed: ${message}` });
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    if (!window.confirm("Reset all brand fields to defaults? (You still need to click Save.)")) return;
    setBrand({ ...DEFAULT_EMAIL_BRAND });
  };

  if (loading) {
    return <div className="p-6 text-slate-300">Loading brand config…</div>;
  }

  const previewWidth = device === "desktop" ? 640 : 380;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Email Branding</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure logo, colors, fonts and layout for every rich HTML campaign template. Changes apply
          to all future campaigns rendered from a template — nothing is sent from this page.
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            msg.type === "success"
              ? "bg-emerald-900/30 border border-emerald-700 text-emerald-200"
              : "bg-red-900/30 border border-red-700 text-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ---------- LEFT: form ---------- */}
        <div className="space-y-4">
          <div className={cardCls}>
            <h2 className="text-white font-semibold mb-3">Logo & Identity</h2>
            <label className={labelCls}>Logo URL</label>
            <input
              className={inputCls}
              value={brand.logoUrl}
              onChange={(e) => update("logoUrl", e.target.value)}
              placeholder="https://phlabs.co.uk/logo.png"
            />
            <label className={`${labelCls} mt-3`}>Tagline (optional)</label>
            <input
              className={inputCls}
              value={brand.tagline || ""}
              onChange={(e) => update("tagline", e.target.value)}
              placeholder="Research-Grade Peptides"
              maxLength={80}
            />
          </div>

          <div className={cardCls}>
            <h2 className="text-white font-semibold mb-3">Colors</h2>
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Primary" value={brand.primaryColor} onChange={(v) => update("primaryColor", v)} />
              <ColorField label="Secondary" value={brand.secondaryColor} onChange={(v) => update("secondaryColor", v)} />
              <ColorField label="Page background" value={brand.backgroundColor} onChange={(v) => update("backgroundColor", v)} />
              <ColorField label="Card surface" value={brand.surfaceColor} onChange={(v) => update("surfaceColor", v)} />
              <ColorField label="Body text" value={brand.textColor} onChange={(v) => update("textColor", v)} />
              <ColorField label="Muted text" value={brand.mutedTextColor} onChange={(v) => update("mutedTextColor", v)} />
            </div>
          </div>

          <div className={cardCls}>
            <h2 className="text-white font-semibold mb-3">Typography & Buttons</h2>
            <label className={labelCls}>Font family (email-safe stack)</label>
            <select
              className={inputCls}
              value={brand.fontFamily}
              onChange={(e) => update("fontFamily", e.target.value)}
            >
              {FONT_STACKS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <label className={`${labelCls} mt-3`}>Button style</label>
            <div className="flex gap-2">
              {(["filled", "outline"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("buttonStyle", s)}
                  className={`flex-1 min-h-[48px] rounded-lg border-2 ${
                    brand.buttonStyle === s
                      ? "border-emerald-500 bg-emerald-600/20 text-white"
                      : "border-slate-600 bg-slate-800 text-slate-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <label className={`${labelCls} mt-3`}>Border radius</label>
            <div className="flex gap-2">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => update("buttonRadius", r)}
                  className={`flex-1 min-h-[48px] rounded-lg border-2 ${
                    brand.buttonRadius === r
                      ? "border-emerald-500 bg-emerald-600/20 text-white"
                      : "border-slate-600 bg-slate-800 text-slate-300"
                  }`}
                >
                  {r}px
                </button>
              ))}
            </div>
          </div>

          <div className={cardCls}>
            <h2 className="text-white font-semibold mb-3">Social Links</h2>
            <div className="grid grid-cols-1 gap-3">
              {(["instagram", "twitter", "facebook", "linkedin"] as const).map((k) => (
                <div key={k}>
                  <label className={labelCls}>{k[0].toUpperCase() + k.slice(1)} URL</label>
                  <input
                    className={inputCls}
                    value={brand.socialLinks?.[k] || ""}
                    onChange={(e) => updateSocial(k, e.target.value)}
                    placeholder={`https://…`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={cardCls}>
            <h2 className="text-white font-semibold mb-3">Footer</h2>
            <label className={labelCls}>Footer text / legal disclaimer</label>
            <textarea
              className={`${inputCls} min-h-[100px] py-2`}
              value={brand.footerText}
              onChange={(e) => update("footerText", e.target.value)}
              maxLength={600}
            />
            <label className={`${labelCls} mt-3`}>Company address</label>
            <input
              className={inputCls}
              value={brand.companyAddress}
              onChange={(e) => update("companyAddress", e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 min-h-[48px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Brand Config"}
            </button>
            <button
              type="button"
              onClick={resetDefaults}
              className="min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 text-slate-200 px-4"
            >
              Reset defaults
            </button>
          </div>
        </div>

        {/* ---------- RIGHT: preview ---------- */}
        <div className="space-y-3">
          <div className={cardCls}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <label className={labelCls}>Preview template</label>
                <select
                  className={inputCls}
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  {TEMPLATE_LIST.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                {(["desktop", "mobile"] as Device[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    className={`min-h-[40px] px-4 rounded-lg border-2 ${
                      device === d
                        ? "border-emerald-500 bg-emerald-600/20 text-white"
                        : "border-slate-600 bg-slate-800 text-slate-300"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            {activeTemplate && (
              <p className="text-xs text-slate-400 mt-2">{activeTemplate.description}</p>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex justify-center">
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              style={{
                width: previewWidth,
                height: 820,
                border: "0",
                backgroundColor: "#ffffff",
                borderRadius: 8,
                maxWidth: "100%",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-[48px] w-14 rounded-lg border-2 border-slate-600 bg-slate-800 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
          maxLength={9}
        />
      </div>
    </div>
  );
}
