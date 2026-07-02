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
  environment: z.string().min(1).max(64).optional(),
  release: z.string().min(1).max(200).optional(),
});

async function requireAdmin(idToken: string): Promise<void> {
  const { requireFirebaseAdmin } = await import("@/lib/server/firebase-auth-admin");
  await requireFirebaseAdmin(idToken);
}

// DSN project id → 4511662778286160 (from src/lib/sentry.ts)
const DEFAULT_PROJECT_ID = "4511662778286160";
const DEFAULT_PROJECT_SLUG = "javascript-react";

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

async function resolveOrgSlug(token: string): Promise<string> {
  // Prefer /organizations/ (works even when token lacks broad project:read).
  try {
    const orgs: Array<{ slug: string }> = await sentryFetch("/organizations/", token);
    if (Array.isArray(orgs) && orgs[0]?.slug) return orgs[0].slug;
  } catch {
    /* fall through */
  }
  // Fallback: derive from /projects/
  const projects: Array<{ id: string; organization?: { slug?: string } }> =
    await sentryFetch("/projects/", token);
  const match = projects.find((p) => String(p.id) === DEFAULT_PROJECT_ID) || projects[0];
  if (!match?.organization?.slug) throw new Error("Could not resolve Sentry organization slug.");
  return match.organization.slug;
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

    let orgSlug = "";
    const projectSlug = DEFAULT_PROJECT_SLUG;
    try {
      orgSlug = await resolveOrgSlug(token);
    } catch (err) {
      return {
        ok: false,
        error: `Org discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    try {
      const queryParts = ["is:unresolved"];
      if (data.release) queryParts.push(`release:"${data.release.replace(/"/g, '\\"')}"`);
      const qs = new URLSearchParams({
        project: DEFAULT_PROJECT_ID,
        statsPeriod,
        limit: String(limit),
        query: queryParts.join(" "),
        sort: "freq",
      });
      if (data.environment) qs.append("environment", data.environment);
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

const FiltersSchema = z.object({ idToken: z.string().min(10).max(4096) });

export const fetchSentryFilters = createServerFn({ method: "POST" })
  .validator((d) => FiltersSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const token = process.env.SENTRY_AUTH_TOKEN;
    if (!token) return { ok: false as const, error: "SENTRY_AUTH_TOKEN not configured on server." };

    try {
      const projects: Array<{ id: string; slug: string; organization?: { slug?: string } }> =
        await sentryFetch("/projects/", token);
      const match = projects.find((p) => String(p.id) === DEFAULT_PROJECT_ID) || projects[0];
      if (!match?.organization?.slug) {
        return { ok: false as const, error: "Could not resolve Sentry organization." };
      }
      const orgSlug = match.organization.slug;
      const projectSlug = match.slug;

      const [envs, releases] = await Promise.all([
        sentryFetch(`/projects/${orgSlug}/${projectSlug}/environments/`, token).catch(() => []),
        sentryFetch(
          `/organizations/${orgSlug}/releases/?project=${DEFAULT_PROJECT_ID}&per_page=25`,
          token,
        ).catch(() => []),
      ]);

      return {
        ok: true as const,
        environments: (Array.isArray(envs) ? envs : [])
          .map((e: any) => e?.name)
          .filter((n: any): n is string => typeof n === "string" && n.length > 0),
        releases: (Array.isArray(releases) ? releases : []).map((r: any) => ({
          version: String(r.version),
          shortVersion: String(r.shortVersion || r.version),
          dateCreated: r.dateCreated,
        })),
      };
    } catch (err) {
      return {
        ok: false as const,
        error: `Filters fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

const IssueDetailSchema = z.object({
  idToken: z.string().min(10).max(4096),
  issueId: z.string().min(1).max(64),
});

interface StackFrame {
  filename?: string;
  function?: string;
  lineNo?: number;
  colNo?: number;
  inApp?: boolean;
  context?: Array<[number, string]>;
}
interface ExceptionEntry {
  type?: string;
  value?: string;
  module?: string;
  frames: StackFrame[];
}

export const fetchSentryIssueDetails = createServerFn({ method: "POST" })
  .validator((d) => IssueDetailSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin(data.idToken);
    const token = process.env.SENTRY_AUTH_TOKEN;
    if (!token) return { ok: false as const, error: "SENTRY_AUTH_TOKEN not configured on server." };

    try {
      const [issue, event] = await Promise.all([
        sentryFetch(`/issues/${encodeURIComponent(data.issueId)}/`, token),
        sentryFetch(`/issues/${encodeURIComponent(data.issueId)}/events/latest/`, token),
      ]);

      const exceptions: ExceptionEntry[] = [];
      const entries: any[] = Array.isArray(event?.entries) ? event.entries : [];
      for (const entry of entries) {
        if (entry?.type === "exception" && entry.data?.values) {
          for (const v of entry.data.values) {
            const frames: StackFrame[] = (v?.stacktrace?.frames || []).map((f: any) => ({
              filename: f.filename,
              function: f.function,
              lineNo: f.lineNo,
              colNo: f.colNo,
              inApp: f.inApp,
              context: f.context,
            }));
            exceptions.push({ type: v.type, value: v.value, module: v.module, frames });
          }
        }
      }

      const tags: Record<string, string> = {};
      for (const t of event?.tags || []) {
        if (t?.key && t?.value) tags[String(t.key)] = String(t.value);
      }

      return {
        ok: true as const,
        issue: {
          id: issue.id,
          shortId: issue.shortId,
          title: issue.title,
          culprit: issue.culprit,
          level: issue.level,
          status: issue.status,
          count: issue.count,
          userCount: issue.userCount,
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen,
          permalink: issue.permalink,
          firstRelease: issue.firstRelease
            ? { version: issue.firstRelease.version, shortVersion: issue.firstRelease.shortVersion }
            : null,
          lastRelease: issue.lastRelease
            ? { version: issue.lastRelease.version, shortVersion: issue.lastRelease.shortVersion }
            : null,
        },
        event: event
          ? {
              id: event.id,
              eventID: event.eventID,
              dateCreated: event.dateCreated,
              platform: event.platform,
              message: event.message,
              release: event.release?.version || event.tags?.find?.((t: any) => t.key === "release")?.value || null,
              environment: tags.environment || null,
              user: event.user
                ? { id: event.user.id, email: event.user.email, ip_address: event.user.ip_address }
                : null,
              exceptions,
              tags,
            }
          : null,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: `Details fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
