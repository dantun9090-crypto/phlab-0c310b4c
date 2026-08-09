import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthResult = { redirect_url?: string; redirect_to?: string; client?: { name?: string } | null };

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
};

function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the session lives in localStorage, absent during SSR.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    if (!authorizationId) throw new Error("Missing authorization_id");

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { needsSignIn: true as const, details: null };

    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);

    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });

    return { needsSignIn: false as const, details: data };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border-2 border-slate-700 bg-slate-900 p-6">
        <h1 className="text-lg font-semibold mb-2">Could not load this authorisation request</h1>
        <p className="text-slate-300 text-sm">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border-2 border-slate-700 bg-slate-900 p-6 space-y-4">{children}</div>
    </main>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function magicLink() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.href },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) {
      setBusy(false);
      setError(error.message);
    }
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Sign in to continue</h1>
      <p className="text-sm text-slate-300">
        An application is requesting access to PH Labs tools on your behalf. Sign in to review the request.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={google}
        disabled={busy}
        className="w-full min-h-[48px] rounded-lg bg-emerald-500 font-medium text-slate-950 disabled:opacity-60"
      >
        Continue with Google
      </button>
      {sent ? (
        <p className="text-sm text-emerald-400">Check your inbox for a sign-in link, then return to this page.</p>
      ) : (
        <div className="space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 px-3 text-white placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={magicLink}
            disabled={busy || !email.trim()}
            className="w-full min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 font-medium text-white disabled:opacity-60"
          >
            Email me a sign-in link
          </button>
        </div>
      )}
    </Shell>
  );
}

function Consent() {
  const data = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data.needsSignIn) return <SignIn />;

  const clientName = data.details?.client?.name ?? "an application";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data: result, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = result?.redirect_url ?? result?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorisation server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Connect {clientName} to PH Labs</h1>
      <p className="text-sm text-slate-300">
        This lets {clientName} use the PH Labs MCP tools as you. It does not bypass this site&apos;s permissions or
        backend policies.
      </p>
      <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
        <li>Browse the public research peptide catalogue</li>
        <li>Read public pages on phlabs.co.uk</li>
      </ul>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className="flex-1 min-h-[48px] rounded-lg bg-emerald-500 font-medium text-slate-950 disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(false)}
          className="flex-1 min-h-[48px] rounded-lg border-2 border-slate-600 bg-slate-800 font-medium text-white disabled:opacity-60"
        >
          Cancel connection
        </button>
      </div>
    </Shell>
  );
}
