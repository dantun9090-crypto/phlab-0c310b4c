/**
 * Dual-database selector for Pro Health Peptides.
 *
 * This project runs Firebase AND Supabase (Lovable Cloud) side-by-side.
 * Use this file as the single import surface so feature code stays explicit.
 *
 * ┌─────────────────────────────────────────────┬──────────────┐
 * │ Domain                                      │ Database     │
 * ├─────────────────────────────────────────────┼──────────────┤
 * │ Auth (login / register / sessions / anon)   │ Firebase     │
 * │ Orders, payments, cart, invoices            │ Firebase     │
 * │ Products, coupons, inventory                │ Firebase     │
 * │ Customers / user profiles                   │ Firebase     │
 * │ Blog / Resources / Articles content         │ Supabase     │
 * │ SEO metadata, sitemap data, redirects       │ Supabase     │
 * │ Analytics events, page views, funnels       │ Supabase     │
 * │ Email logs, contact-form submissions, audit │ Supabase     │
 * │ Banners / landing-page CMS content          │ Supabase     │
 * └─────────────────────────────────────────────┴──────────────┘
 *
 * Rule of thumb:
 *   - touches money, auth, or an existing Firestore collection → Firebase
 *   - new content or telemetry → Supabase
 *
 * Server-only Supabase access (service-role / admin) lives in
 * `@/integrations/supabase/client.server` and must only be imported from
 * `.functions.ts` / `.server.ts` files — never from a component.
 */

// Firebase — auth + transactional (existing)
export { db as firebaseDb, auth as firebaseAuth } from '@/lib/firebase';

// Supabase — content + analytics (browser-safe)
export { supabase } from '@/integrations/supabase/client';
