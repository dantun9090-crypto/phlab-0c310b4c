import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireFirebaseAdmin } from '@/lib/server/firebase-auth-admin';

const SHOPIFY_DOMAIN = '12h2iy-t0.myshopify.com';
const SHOPIFY_API_VERSION = '2025-07';

const idTokenSchema = z.string().min(10).max(4096);

function adminUrl(path: string) {
  return `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/${path}`;
}

function token() {
  const t = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!t) throw new Error('SHOPIFY_ACCESS_TOKEN not configured');
  return t;
}

async function shopifyFetch(path: string, init?: RequestInit) {
  const res = await fetch(adminUrl(path), {
    ...init,
    headers: {
      'X-Shopify-Access-Token': token(),
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const getShopInfo = createServerFn({ method: 'POST' })
  .inputValidator((d: { idToken: string }) => ({ idToken: idTokenSchema.parse(d?.idToken) }))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const res = await shopifyFetch('shop.json');
    return {
      domain: res.shop.domain,
      myshopifyDomain: res.shop.myshopify_domain,
      name: res.shop.name,
      email: res.shop.email,
      currency: res.shop.currency,
      planName: res.shop.plan_name,
      country: res.shop.country_name,
      createdAt: res.shop.created_at,
      apiVersion: SHOPIFY_API_VERSION,
    };
  });

export const listAdminProducts = createServerFn({ method: 'POST' })
  .inputValidator((d: { idToken: string; limit?: number }) => ({
    idToken: idTokenSchema.parse(d?.idToken),
    limit: d?.limit ?? 250,
  }))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const json = await shopifyFetch(`products.json?limit=${Math.min(data.limit, 250)}`);
    return (json.products || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      body_html: p.body_html,
      status: p.status,
      vendor: p.vendor,
      product_type: p.product_type,
      created_at: p.created_at,
      updated_at: p.updated_at,
      image: p.image?.src || null,
      images: (p.images || []).map((i: any) => ({ id: i.id, src: i.src, alt: i.alt })),
      price: p.variants?.[0]?.price ?? null,
      sku: p.variants?.[0]?.sku ?? null,
      inventory: p.variants?.reduce((s: number, v: any) => s + (v.inventory_quantity ?? 0), 0) ?? 0,
      variantId: p.variants?.[0]?.id ?? null,
    }));
  });

export const createAdminProduct = createServerFn({ method: 'POST' })
  .inputValidator((d: {
    idToken: string;
    title: string; body_html?: string; price?: string; vendor?: string;
    product_type?: string; images?: string[]; status?: 'active' | 'draft';
  }) => ({ ...d, idToken: idTokenSchema.parse(d?.idToken) }))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const body = {
      product: {
        title: data.title,
        body_html: data.body_html || '',
        vendor: data.vendor || '',
        product_type: data.product_type || '',
        status: data.status || 'active',
        variants: data.price ? [{ price: data.price }] : undefined,
        images: data.images?.filter(Boolean).map((src) => ({ src })),
      },
    };
    return shopifyFetch('products.json', { method: 'POST', body: JSON.stringify(body) });
  });

export const updateAdminProduct = createServerFn({ method: 'POST' })
  .inputValidator((d: {
    idToken: string;
    id: number; title?: string; body_html?: string; price?: string;
    vendor?: string; product_type?: string; images?: string[];
    status?: 'active' | 'draft'; variantId?: number | null;
  }) => ({ ...d, idToken: idTokenSchema.parse(d?.idToken) }))
  .handler(async ({ data }) => {
    await requireFirebaseAdmin(data.idToken);
    const product: any = { id: data.id };
    if (data.title !== undefined) product.title = data.title;
    if (data.body_html !== undefined) product.body_html = data.body_html;
    if (data.vendor !== undefined) product.vendor = data.vendor;
    if (data.product_type !== undefined) product.product_type = data.product_type;
    if (data.status) product.status = data.status;
    if (data.images && data.images.length) {
      product.images = data.images.filter(Boolean).map((src) => ({ src }));
    }
    await shopifyFetch(`products/${data.id}.json`, {
      method: 'PUT',
      body: JSON.stringify({ product }),
    });
    if (data.price && data.variantId) {
      await shopifyFetch(`variants/${data.variantId}.json`, {
        method: 'PUT',
        body: JSON.stringify({ variant: { id: data.variantId, price: data.price } }),
      });
    }
    return { ok: true };
  });
