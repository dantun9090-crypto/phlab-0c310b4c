/**
 * Server-side paginated + searchable sessions for Admin → Visitors drill-down.
 *
 * Aggregates `visitor_events` server-side using Firebase Admin so large date
 * ranges don't pull tens of thousands of docs into the browser.
 *
 * Pagination is cursor-based on (end, sid) DESC — stable ordering even when
 * new events arrive between requests.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const CursorSchema = z.object({
  end: z.number().int().nonnegative(),
  sid: z.string().min(1).max(200),
});

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  fromMs: z.number().int().nonnegative(),
  toMs: z.number().int().nonnegative(),
  pathFilter: z.string().max(500).optional().nullable(),
  search: z.string().max(200).optional().nullable(),
  cursor: CursorSchema.nullable().optional(),
  pageSize: z.number().int().min(5).max(200).default(50),
  /** Hard cap on events scanned per request. */
  maxEvents: z.number().int().min(500).max(50_000).default(20_000),
});

export interface VisitorSessionRow {
  sid: string;
  vid: string | null;
  start: number;
  end: number;
  durationMs: number;
  pageviews: number;
  lastPath: string | null;
  ua: string | null;
  returning: boolean;
}

export interface SessionCursor {
  end: number;
  sid: string;
}

export interface ListVisitorSessionsResult {
  sessions: VisitorSessionRow[];
  total: number;
  pageSize: number;
  nextCursor: SessionCursor | null;
  eventsScanned: number;
  truncated: boolean;
  /** Effective limits applied — surfaced to the UI for the cap explainer. */
  limits: {
    maxEvents: number;
    fromMs: number;
    toMs: number;
    pathFilter: string | null;
    search: string | null;
  };
}

function tsMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v && 'toMillis' in (v as Record<string, unknown>)) {
    try {
      const fn = (v as { toMillis: () => number }).toMillis;
      return typeof fn === 'function' ? fn.call(v) : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export const listVisitorSessions = createServerFn({ method: 'POST' })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }): Promise<ListVisitorSessionsResult> => {
    const { requireFirebaseAdmin } = await import('@/lib/server/firebase-auth-admin');
    await requireFirebaseAdmin(data.idToken);
    const { listDocsAdmin } = await import('@/lib/server/firestore-admin');

    const events = (await listDocsAdmin('visitor_events', {
      orderBy: 'createdAt',
      direction: 'DESCENDING',
      limit: data.maxEvents,
      rangeFilter: {
        field: 'createdAt',
        gte: new Date(data.fromMs),
        lte: new Date(data.toMs),
      },
    })) as Array<Record<string, unknown> & { id: string }>;

    const sessions = new Map<string, {
      min: number;
      max: number;
      pageviews: number;
      lastPath?: string;
      ua?: string;
      visitorId?: string;
      firstSeen?: number;
    }>();

    const needle = (data.search ?? '').trim().toLowerCase();
    const pathOnly = data.pathFilter || null;

    for (const ev of events) {
      const path = (ev.path as string | undefined) ?? '/';
      if (pathOnly && path !== pathOnly) continue;

      const ts = tsMs(ev.createdAt);
      if (!ts) continue;
      const sid = (ev.sessionId as string | undefined) ?? '';
      if (!sid) continue;

      const visitorId = (ev.visitorId as string | undefined) ?? undefined;
      const ua = (ev.userAgent as string | undefined) ?? undefined;
      const firstSeen = tsMs(ev.firstSeen) || undefined;

      const s = sessions.get(sid) ?? {
        min: ts, max: ts, pageviews: 0, lastPath: path, ua, visitorId, firstSeen,
      };
      s.min = Math.min(s.min, ts);
      s.max = Math.max(s.max, ts);
      if (ev.type === 'pageview') s.pageviews += 1;
      if (!s.lastPath) s.lastPath = path;
      if (!s.ua && ua) s.ua = ua;
      if (!s.visitorId && visitorId) s.visitorId = visitorId;
      if (s.firstSeen == null && firstSeen != null) s.firstSeen = firstSeen;
      sessions.set(sid, s);
    }

    let rows: VisitorSessionRow[] = [];
    for (const [sid, s] of sessions) {
      rows.push({
        sid,
        vid: s.visitorId ?? null,
        start: s.min,
        end: s.max,
        durationMs: s.max - s.min,
        pageviews: s.pageviews,
        lastPath: s.lastPath ?? null,
        ua: s.ua ?? null,
        returning: s.firstSeen != null && s.firstSeen < s.min - 60_000,
      });
    }

    if (needle) {
      rows = rows.filter((r) =>
        r.sid.toLowerCase().includes(needle) ||
        (r.vid ?? '').toLowerCase().includes(needle) ||
        (r.lastPath ?? '').toLowerCase().includes(needle) ||
        (r.ua ?? '').toLowerCase().includes(needle),
      );
    }

    // Stable order: end DESC, sid DESC as tiebreaker.
    rows.sort((a, b) => (b.end - a.end) || (a.sid < b.sid ? 1 : a.sid > b.sid ? -1 : 0));

    const total = rows.length;

    // Apply cursor (strictly after the cursor position in the sorted order).
    if (data.cursor) {
      const { end: cEnd, sid: cSid } = data.cursor;
      rows = rows.filter((r) =>
        r.end < cEnd || (r.end === cEnd && r.sid < cSid),
      );
    }

    const paged = rows.slice(0, data.pageSize);
    const last = paged[paged.length - 1];
    const nextCursor: SessionCursor | null =
      paged.length === data.pageSize && rows.length > data.pageSize && last
        ? { end: last.end, sid: last.sid }
        : null;

    return {
      sessions: paged,
      total,
      pageSize: data.pageSize,
      nextCursor,
      eventsScanned: events.length,
      truncated: events.length >= data.maxEvents,
      limits: {
        maxEvents: data.maxEvents,
        fromMs: data.fromMs,
        toMs: data.toMs,
        pathFilter: pathOnly,
        search: needle || null,
      },
    };
  });
