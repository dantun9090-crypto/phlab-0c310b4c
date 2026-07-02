/**
 * Sentry issues fetch — admin-only server function.
 * Uses SENTRY_AUTH_TOKEN (server-only secret) to query the Sentry REST API.
 * Auto-discovers org/project slug from the token so we don't hard-code them.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const IdTokenSchema = z.object({
  idToken: z.string().min(10).max(4096),
  statsPeriod: z.string().min(1).max(8).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

async function requireAdmin(idToken: string): Promise<void> {
  const { requireFirebaseAdmin } = await import("@/lib/server/firebase-auth-admin");
  await requireFirebaseAdmin(idToken);
}

// DSN project id → 4511662778286160 (from src/lib/sentry.ts)
const DEFAULT_PROJECT_ID = "4511662778286160";

async function sentryFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`https://sentry.io/api/0${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sentry ${res.status} on ${path}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const fetchSentryIssues = createServerFn({ method: "POST" })
  .validator((d) => IdTokenSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const token = process.env.SENTRY_AUTH_TOKEN;
    if (!token) {
      return { ok: false, error: "SENTRY_AUTH_TOKEN not configured on server." };
    }
    const statsPeriod = data.statsPeriod || "24h";
    const limit = data.limit || 25;

    // Discover org + project slug from token
    let orgSlug = "";
    let projectSlug = "";
    try {
      const projects: Array<{
        id: string;
        slug: string;
        organization?: { slug?: string };
      }> = await sentryFetch("/projects/", token);
      const match =
        projects.find((p) => String(p.id) === DEFAULT_PROJECT_ID) || projects[0];
      if (!match) {
        return { ok: false, error: "Sentry token has no accessible projects." };
      }
      orgSlug = match.organization?.slug || "";
      projectSlug = match.slug;
      if (!orgSlug) {
        return { ok: false, error: "Could not resolve Sentry organization slug." };
      }
    } catch (err) {
      return {
        ok: false,
        error: `Discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    try {
      const qs = new URLSearchParams({
        project: DEFAULT_PROJECT_ID,
        statsPeriod,
        limit: String(limit),
        query: "is:unresolved",
        sort: "freq",
      });
      const issues: any[] = await sentryFetch(
        `/organizations/${orgSlug}/issues/?${qs.toString()}`,
        token,
      );
      return {
        ok: true,
        orgSlug,
        projectSlug,
        statsPeriod,
        count: issues.length,
        issues: issues.map((i) => ({
          id: i.id,
          shortId: i.shortId,
          title: i.title,
          culprit: i.culprit,
          level: i.level,
          status: i.status,
          count: i.count,
          userCount: i.userCount,
          firstSeen: i.firstSeen,
          lastSeen: i.lastSeen,
          permalink: i.permalink,
          metadata: i.metadata,
        })),
      };
    } catch (err) {
      return {
        ok: false,
        error: `Issues fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
