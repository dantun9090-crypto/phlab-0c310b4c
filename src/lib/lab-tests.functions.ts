/**
 * Admin-only writes + full-table reads for the `lab_tests` table.
 *
 * Admin identity in this project lives in Firebase (`customers/{uid}.isAdmin`),
 * so Supabase RLS cannot see it. Every mutating call therefore carries a
 * Firebase ID token which is verified server-side before `supabaseAdmin`
 * (service role) is touched. The service-role client is imported INSIDE the
 * handler so it never reaches the client bundle.
 *
 * Public (customer) reads do NOT go through here — they use the browser
 * Supabase client and the `is_public = true` RLS policy.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAdmin } from "@/lib/server/firebase-auth-admin";
import type { LabTest } from "@/lib/lab-tests";

const TokenOnly = z.object({ idToken: z.string().min(10).max(4096) });

const RowSchema = z.object({
  id: z.string().uuid().optional(),
  product: z.string().min(1).max(120),
  label_mg: z.string().max(40).nullable().optional(),
  batch: z.string().max(80).nullable().optional(),
  cap_color: z.string().max(80).nullable().optional(),
  test_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  mass_1: z.number().finite().nullable().optional(),
  purity_1: z.number().min(0).max(100).nullable().optional(),
  mass_2: z.number().finite().nullable().optional(),
  purity_2: z.number().min(0).max(100).nullable().optional(),
  test_link: z.string().url().max(2000).nullable().optional(),
  lab_source: z.string().max(60).nullable().optional(),
  is_public: z.boolean().optional(),
});

/** Read every row (published or not) for the admin table. */
export const listLabTestsAdmin = createServerFn({ method: "POST" })
  .validator((d) => TokenOnly.parse(d))
  .handler(async ({ data }): Promise<{ rows: LabTest[] }> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("lab_tests")
      .select("*")
      .order("test_date", { ascending: false, nullsFirst: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as LabTest[] };
  });

/** Insert or update a single test row. */
export const saveLabTestAdmin = createServerFn({ method: "POST" })
  .validator((d) => TokenOnly.extend({ row: RowSchema }).parse(d))
  .handler(async ({ data }): Promise<{ row: LabTest }> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...fields } = data.row;

    if (id) {
      const { data: row, error } = await supabaseAdmin
        .from("lab_tests")
        .update(fields)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { row: row as unknown as LabTest };
    }

    const { data: row, error } = await supabaseAdmin
      .from("lab_tests")
      .insert(fields)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { row: row as unknown as LabTest };
  });

/** Flip the customer-visible flag for one row. */
export const setLabTestPublicAdmin = createServerFn({ method: "POST" })
  .validator((d) =>
    TokenOnly.extend({ id: z.string().uuid(), isPublic: z.boolean() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("lab_tests")
      .update({ is_public: data.isPublic })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLabTestAdmin = createServerFn({ method: "POST" })
  .validator((d) => TokenOnly.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lab_tests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface LabTestImportResult {
  inserted: number;
  skipped: number;
  skippedReasons: Array<{ batch: string | null; product: string; reason: string }>;
}

/**
 * Bulk import. Rows arrive already normalised/validated client-side; this
 * handler re-validates, then de-duplicates against existing rows on
 * `batch + test_link` (and on `test_link` alone when no batch is present).
 * Imported rows default to hidden (`is_public = false`).
 */
export const importLabTestsAdmin = createServerFn({ method: "POST" })
  .validator((d) =>
    TokenOnly.extend({ rows: z.array(RowSchema.omit({ id: true })).min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data }): Promise<LabTestImportResult> => {
    await requireFirebaseAdmin(data.idToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: readErr } = await supabaseAdmin
      .from("lab_tests")
      .select("batch, test_link")
      .limit(20000);
    if (readErr) throw new Error(readErr.message);

    const key = (batch: string | null | undefined, link: string | null | undefined) =>
      `${(batch ?? "").trim().toUpperCase()}::${(link ?? "").trim().toLowerCase()}`;

    const seen = new Set<string>((existing ?? []).map((r) => key(r.batch, r.test_link)));
    const skippedReasons: LabTestImportResult["skippedReasons"] = [];
    const toInsert: Array<z.infer<typeof RowSchema>> = [];

    for (const row of data.rows) {
      const k = key(row.batch, row.test_link);
      if (seen.has(k)) {
        skippedReasons.push({
          batch: row.batch ?? null,
          product: row.product,
          reason: "duplicate",
        });
        continue;
      }
      seen.add(k);
      toInsert.push({ ...row, is_public: row.is_public ?? false });
    }

    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error } = await supabaseAdmin.from("lab_tests").insert(chunk);
      if (error) throw new Error(error.message);
      inserted += chunk.length;
    }

    return { inserted, skipped: skippedReasons.length, skippedReasons };
  });
