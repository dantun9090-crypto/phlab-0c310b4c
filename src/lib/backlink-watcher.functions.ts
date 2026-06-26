/**
 * Admin-gated server fns for the Backlink Watcher.
 * Triggered manually from Admin → Backlink Changes, or read for the dashboard.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from '@/lib/server/firebase-auth-admin';

const IdTokenInput = z.object({
  idToken: z.string().min(10).max(4096),
  limit: z.number().int().min(1).max(50).optional(),
});

export const runBacklinkWatcherNow = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => z.object({ idToken: z.string().min(10).max(4096) }).parse(data))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { runBacklinkWatcher } = await import('@/lib/backlink-watcher.server');
    return runBacklinkWatcher({ triggeredBy: 'manual' });
  });

export const listBacklinkSnapshots = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => IdTokenInput.parse(data))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { listDocsAdmin, getDocAdmin } = await import('@/lib/server/firestore-admin');
    const [runs, latest] = await Promise.all([
      listDocsAdmin('backlink_snapshots', {
        orderBy: 'fetchedAt',
        direction: 'DESCENDING',
        limit: data.limit ?? 20,
      }).catch(() => []),
      getDocAdmin('backlink_snapshots', 'latest').catch(() => null),
    ]);
    // Exclude the `latest` pointer doc from the run history.
    const history = runs.filter((r) => r.id !== 'latest');
    return { latest, history };
  });
