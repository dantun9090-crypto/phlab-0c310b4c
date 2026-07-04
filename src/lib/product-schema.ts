/**
 * Product form validation schema (Zod).
 * Used by ProductEditor for live per-field validation + tab error counts.
 *
 * Not a Firestore schema — this only enforces what the admin form requires
 * before enabling Save / Autosave. Firestore stores richer data (timestamps,
 * legacy fields) that we don't need to validate on write.
 */
import { z } from 'zod';

export const variantSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Variant name is required (e.g. 10mg)').max(60),
  sku: z.string().trim().max(60).optional().default(''),
  stock: z.number().int('Stock must be a whole number').min(0, 'Stock cannot be negative'),
  price: z.number().min(0, 'Price cannot be negative').optional(),
  imageIndex: z.number().int().min(0).max(3).optional(),
  hplcTested: z.boolean().optional(),
  hplcImageUrl: z.string().url().optional().or(z.literal('')),
  hplcTestedAt: z.string().optional(),
});

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required').max(120, 'Max 120 characters'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only')
    .max(120)
    .optional()
    .or(z.literal('')),
  category: z.string().min(1, 'Pick a category'),
  price: z.number().min(0, 'Price cannot be negative'),
  sku: z.string().trim().max(60).optional().default(''),
  stock: z.number().int('Stock must be a whole number').min(0, 'Stock cannot be negative'),
  purity: z.string().max(60).optional().default(''),
  visibility: z.enum(['active', 'hidden', 'out_of_stock']),
  description: z.string().max(5000, 'Description too long (max 5000 chars)').optional().default(''),
  variants: z.array(variantSchema).max(4, 'Maximum 4 variants').optional().default([]),
}).superRefine((val, ctx) => {
  // Unique variant SKUs (skip blanks)
  const skus = (val.variants || []).map((v) => (v.sku || '').trim()).filter(Boolean);
  const dupes = skus.filter((s, i) => skus.indexOf(s) !== i);
  if (dupes.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['variants'],
      message: `Duplicate variant SKU: ${[...new Set(dupes)].join(', ')}`,
    });
  }
});

export type ProductFormValues = z.infer<typeof productSchema>;

/** Map a field name to which editor tab it belongs to. */
export type EditorTab = 'basics' | 'images' | 'variants' | 'seo';

export function tabForPath(path: (string | number)[]): EditorTab {
  const head = String(path[0] ?? '');
  if (head === 'variants') return 'variants';
  if (head === 'images' || head === 'imageUrl' || head === 'bannerImageUrl') return 'images';
  if (head === 'slug' || head === 'includeInMerchantFeed' || head === 'excludeFromMerchantFeed') return 'seo';
  return 'basics';
}

export interface FieldErrors {
  // key = dotted path e.g. "name" or "variants.0.sku"
  [key: string]: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: FieldErrors;
  perTab: Record<EditorTab, number>;
}

export function validateProduct(data: unknown): ValidationResult {
  const perTab: Record<EditorTab, number> = { basics: 0, images: 0, variants: 0, seo: 0 };
  const errors: FieldErrors = {};
  const parsed = productSchema.safeParse(data);
  if (parsed.success) return { ok: true, errors, perTab };
  for (const issue of parsed.error.issues) {
    const pathParts = issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p));
    const key = pathParts.join('.');
    if (!errors[key]) {
      errors[key] = issue.message;
      perTab[tabForPath(pathParts as (string | number)[])] += 1;
    }
  }
  return { ok: false, errors, perTab };
}

/**
 * Human-readable message for Firebase Storage upload errors.
 * Maps error code / message to actionable copy.
 */
export function friendlyUploadError(e: unknown): { code: string; message: string; recoverable: boolean } {
  const raw = e as { code?: string; message?: string };
  const code = raw?.code || '';
  const msg = String(raw?.message || raw || '');
  if (code === 'storage/unauthorized' || msg.includes('permission') || msg.includes('403')) {
    return { code: 'permission', message: 'Storage rules not deployed — Firebase Console → Storage → Rules → Publish', recoverable: false };
  }
  if (code === 'storage/quota-exceeded') {
    return { code, message: 'Firebase Storage quota exceeded — contact admin', recoverable: false };
  }
  if (code === 'storage/canceled') {
    return { code, message: 'Upload cancelled — retry', recoverable: true };
  }
  if (code === 'storage/retry-limit-exceeded' || msg.includes('network') || msg.includes('Failed to fetch')) {
    return { code: 'network', message: 'Network error — check connection and retry', recoverable: true };
  }
  if (code === 'storage/invalid-format' || msg.includes('mime')) {
    return { code, message: 'Invalid file type — use JPG, PNG or WebP', recoverable: false };
  }
  if (msg.includes('too large') || msg.includes('size')) {
    return { code: 'size', message: msg, recoverable: false };
  }
  return { code: code || 'unknown', message: msg || 'Upload failed', recoverable: true };
}
