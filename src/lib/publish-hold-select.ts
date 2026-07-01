/**
 * Pure helpers for the /api/public/publish-hold GET endpoint.
 *
 * Extracted so integration tests can exercise the "latest active hold"
 * selection without spinning up Firestore. The route handler in
 * src/routes/api/public/publish-hold.ts must import from here — do NOT
 * inline this logic back into the route.
 */

export interface PublishHoldRow {
  id?: string;
  buildId?: string;
  reason?: string;
  source?: string;
  hold?: boolean;
  bootBadInWindow?: number;
  failuresInWindow?: number;
  updatedAt?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export interface PublishHoldSelection {
  hold: boolean;
  current: PublishHoldRow | null;
  active: PublishHoldRow[];
  recent: PublishHoldRow[];
}

/**
 * Given the raw rows returned by `listDocsAdmin("publish_hold", …)`
 * (already ordered by updatedAt DESC), return the latest ACTIVE hold plus
 * the full active + recent lists the admin banner consumes.
 *
 * Rules:
 *  - `hold === true` is required to count as active.
 *  - If Firestore ordering is missing or ambiguous, fall back to
 *    `updatedAt` (ISO string sort, descending) to guarantee deterministic
 *    "latest" selection across test runs and rehydrated data.
 */
export function selectLatestActiveHold(rows: PublishHoldRow[]): PublishHoldSelection {
  const recent = [...rows].sort((a, b) => {
    const av = String(a.updatedAt ?? '');
    const bv = String(b.updatedAt ?? '');
    return bv.localeCompare(av);
  });
  const active = recent.filter((r) => r.hold === true);
  const current = active[0] ?? null;
  return { hold: !!current, current, active, recent };
}
