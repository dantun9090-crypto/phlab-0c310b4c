import { createServerFn } from '@tanstack/react-start';
import { requireFirebaseAdmin } from '@/lib/server/firebase-auth-admin';

export const listUrlMonitorScans = createServerFn({ method: 'POST' })
  .inputValidator((data: { idToken: string }) => {
    if (!data?.idToken || typeof data.idToken !== 'string') throw new Error('idToken required');
    return data;
  })
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const { listDocsAdmin } = await import('@/lib/server/firestore-admin');
    const rows = await listDocsAdmin('url_monitor_scans', {
      orderBy: 'scannedAt',
      direction: 'DESCENDING',
      limit: 20,
    });
    return {
      scans: rows.map((row) => ({
        id: row.id,
        scannedAt: typeof row.scannedAt === 'string' ? row.scannedAt : new Date().toISOString(),
        origin: typeof row.origin === 'string' ? row.origin : '',
        totalProducts: Number(row.totalProducts ?? 0),
        totalChecks: Number(row.totalChecks ?? 0),
        failedChecks: Number(row.failedChecks ?? 0),
        durationMs: Number(row.durationMs ?? 0),
        failingChecks: Array.isArray(row.failingChecks) ? row.failingChecks : [],
      })),
      fetchedAt: new Date().toISOString(),
    };
  });