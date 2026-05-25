/**
 * Example Supabase server functions (content domain).
 *
 * Browser code can read published articles directly via the supabase client.
 * Admin writes go through a server function with `requireSupabaseAuth` so
 * RLS evaluates as the signed-in user (admin role required by policy).
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const PublishInput = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(100_000),
  excerpt: z.string().max(500).optional(),
  published: z.boolean().default(false),
});

export const upsertArticle = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PublishInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from('articles')
      .upsert(
        {
          slug: data.slug,
          title: data.title,
          body: data.body,
          excerpt: data.excerpt ?? null,
          published: data.published,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' },
      )
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { article: row };
  });
