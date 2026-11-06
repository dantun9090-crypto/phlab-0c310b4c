/**
 * Gate raw /api/public/* admin diagnostic routes: accepts a Firebase ID
 * token of an admin (Authorization: Bearer <idToken>) or the server-side
 * cron secret (x-cron-secret == CLEANUP_SECRET). Returns a 401/403 Response
 * when the caller is not allowed, or null when access is granted.
 */
export async function requireAdminRequest(request: Request): Promise<Response | null> {
  const deny = (status: number) =>
    new Response(JSON.stringify({ error: status === 401 ? "unauthorized" : "forbidden" }), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  const cron = request.headers.get("x-cron-secret");
  const expected = process.env.CLEANUP_SECRET;
  if (cron && expected && cron.length === expected.length) {
    let diff = 0;
    for (let i = 0; i < cron.length; i++) diff |= cron.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff === 0) return null;
  }
  const authz = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(authz);
  if (!m) return deny(401);
  try {
    const { requireFirebaseAdmin } = await import("./firebase-auth-admin");
    await requireFirebaseAdmin(m[1].trim());
    return null;
  } catch {
    return deny(403);
  }
}
