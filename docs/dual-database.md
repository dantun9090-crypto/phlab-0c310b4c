# Dual Database Setup — Firebase + Supabase (Lovable Cloud)

This project uses **both** databases at once. Nothing on Firebase has moved.
Supabase was added as a second store for new content + telemetry features.

## Which database for what?

| Domain                                          | Database  |
| ----------------------------------------------- | --------- |
| Auth (login / register / sessions / anon)       | Firebase  |
| Orders, payments, cart, invoices                | Firebase  |
| Products, coupons, inventory                    | Firebase  |
| Customers / user profiles                       | Firebase  |
| Blog / Resources / Articles content             | Supabase  |
| SEO metadata, sitemap data, redirects           | Supabase  |
| Analytics events, page views, funnels           | Supabase  |
| Email logs, contact-form submissions, audit log | Supabase  |
| Banners / landing-page CMS content              | Supabase  |

**Decision rule:** if it touches money, auth, or an existing Firestore
collection → **Firebase**. If it's new content or telemetry → **Supabase**.

## Import surface

Always import from `@/lib/db`:

```ts
import { firebaseDb, firebaseAuth, supabase } from '@/lib/db';
```

For Supabase server-only admin work, import inside a `.functions.ts` file:

```ts
import { supabaseAdmin } from '@/integrations/supabase/client.server';
```

---

## 1. Firebase — read / write (existing pattern)

```ts
import { firebaseDb } from '@/lib/db';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';

// Write an order
await addDoc(collection(firebaseDb, 'orders'), {
  email: 'buyer@example.com',
  total: 4999,
  createdAt: new Date(),
});

// Read products
const snap = await getDocs(
  query(collection(firebaseDb, 'products'), where('active', '==', true)),
);
const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
```

## 2. Supabase — read in the browser

```ts
import { supabase } from '@/lib/db';

const { data: articles, error } = await supabase
  .from('articles')
  .select('id, slug, title, excerpt, created_at')
  .eq('published', true)
  .order('created_at', { ascending: false });
```

Public reads of published rows are allowed by RLS — no auth needed.

## 3. Supabase — write from the browser (analytics)

```ts
import { supabase } from '@/lib/db';

await supabase.from('analytics_events').insert({
  event_type: 'page_view',
  path: window.location.pathname,
  user_agent: navigator.userAgent,
  metadata: { referrer: document.referrer },
});
```

Anonymous inserts are allowed by RLS for `analytics_events` (with payload
validation). Reads require admin role.

## 4. Supabase — server function (admin write)

`src/lib/content.functions.ts` already ships with this example:

```ts
import { useServerFn } from '@tanstack/react-start';
import { upsertArticle } from '@/lib/content.functions';

function AdminEditor() {
  const save = useServerFn(upsertArticle);
  return (
    <button
      onClick={() =>
        save({
          data: {
            slug: 'first-post',
            title: 'Hello',
            body: '...',
            published: true,
          },
        })
      }
    >
      Save article
    </button>
  );
}
```

The server function uses `requireSupabaseAuth`, so RLS evaluates as the
calling user. Writes succeed only if that user has the `admin` role in
`user_roles`.

---

## How to choose, fast

```
                           ┌─────────────────────────┐
   Does the feature        │ Use Firebase            │
   touch money, auth, or   │ (Firestore + Firebase   │
   an existing collection? │  Auth)                  │
   ──────── YES ──────────▶│                         │
                           └─────────────────────────┘

                           ┌─────────────────────────┐
   Is it new content,      │ Use Supabase            │
   CMS, or telemetry?      │ (Lovable Cloud)         │
   ──────── YES ──────────▶│                         │
                           └─────────────────────────┘
```

## Auth model — important

Firebase Auth remains the **single source of truth for the logged-in user**.
The `RequireAuth` guard in `src/legacy/AppRouter.tsx` still gates the admin
panel using Firebase.

Supabase has its own user system. Today no Supabase auth is wired up, so:

- **Public Supabase reads** work without any sign-in.
- **Public Supabase inserts** (analytics) work without any sign-in.
- **Admin Supabase writes** require a Supabase session whose user_id has a
  row in `user_roles` with `role = 'admin'`. When you need this, sign the
  admin in to Supabase as well (e.g. via Lovable Cloud Google sign-in) and
  insert a `user_roles` row for them.

This separation is intentional: it keeps the Firebase order/cart/payment
flow untouched while letting Supabase enforce RLS on its own tables.
