/**
 * Royal Mail Order Worker — DEPLOYED COPY
 * --------------------------------------------------------------
 * Live at: https://royal-mail-order.dantun9090.workers.dev
 *
 * This file mirrors the actual code currently running on Cloudflare
 * (verified via the Cloudflare API). Keep them in sync — if you edit
 * here, redeploy with:
 *   cd cloudflare
 *   wrangler deploy --config royal-mail-order-wrangler.toml
 *
 * Secrets required on the Worker (set via `wrangler secret put`):
 *   - ROYAL_MAIL_API_KEY   Click & Drop API token (sent as raw Authorization header)
 *   - SHARED_SECRET        random string; must match VITE_ROYAL_MAIL_WORKER_TOKEN
 *
 * Request:  POST /  JSON body {
 *   orderId, firstName, lastName, addressLine1, addressLine2?, city, postcode,
 *   countryCode?, email?, phone?, serviceCode, weightGrams, subtotal, shippingCostCharged, total
 * }
 * Header:  x-phlabs-auth: <SHARED_SECRET>
 *
 * Response: { success, trackingNumber|null, orderId, message }  on success
 *           { error: string | object }                          on failure
 *
 * CORS: origin allowlist only. Requests from any other origin (including
 * `Origin: null`) receive NO Access-Control-Allow-Origin header, which
 * causes the browser to block them. Server-to-server callers (no Origin
 * header) still work because CORS is browser-enforced.
 */

const ALLOWED_ORIGINS = new Set([
  'https://phlabs.co.uk',
  'https://www.phlabs.co.uk',
  'https://prohealthpeptides.co.uk',
  'https://www.prohealthpeptides.co.uk',
  'https://phlab.lovable.app',
  'https://id-preview--1f12c255-a30a-4bea-bbab-28d9e6f70804.lovable.app',
  'http://localhost:8080',
  'http://localhost:3000',
]);

function corsHeadersFor(request) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-phlabs-auth',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeadersFor(request) },
  });
}

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      const cors = corsHeadersFor(request);
      // Preflight from a disallowed origin: reply without ACAO so the
      // browser blocks the follow-up request.
      if (!cors['Access-Control-Allow-Origin']) {
        return new Response(null, { status: 403, headers: { 'Vary': 'Origin' } });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Origin gate for browser callers. Server-to-server callers omit
    // Origin entirely and are allowed (auth still required below).
    const origin = request.headers.get('Origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' },
      });
    }

    // Auth gate — shared secret between your frontend and this worker
    const authHeader = request.headers.get('x-phlabs-auth');
    if (authHeader !== env.SHARED_SECRET) {
      return jsonResponse(request, { error: 'Unauthorized' }, 401);
    }

    try {
      const order = await request.json();

      if (!order.postcode || !order.addressLine1 || !order.orderId) {
        return jsonResponse(request, { error: 'Missing required fields' }, 400);
      }

      const nowIso = new Date().toISOString();
      const clean = (value, maxLength) => {
        const text = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
        return maxLength ? text.slice(0, maxLength) : text;
      };
      const money = (value) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
      };
      const weightInGrams = Math.min(30000, Math.max(1, Math.round(Number(order.weightGrams) || 100)));
      const subtotal = money(order.subtotal);
      const shippingCostCharged = money(order.shippingCostCharged);
      const total = money(order.total || subtotal + shippingCostCharged);
      const countryCode = clean(order.countryCode || 'GB', 3).toUpperCase() || 'GB';
      const fullName = clean(`${order.firstName || ''} ${order.lastName || ''}`, 210) || 'Customer';
      const address = {
        fullName,
        addressLine1: clean(order.addressLine1, 100),
        city: clean(order.city || order.postcode, 100),
        postcode: clean(order.postcode, 20).toUpperCase(),
        countryCode
      };
      const addressLine2 = clean(order.addressLine2, 100);
      if (addressLine2) address.addressLine2 = addressLine2;

      const recipient = { address };
      const phoneNumber = clean(order.phone, 25);
      const emailAddress = clean(order.email, 254);
      if (phoneNumber) recipient.phoneNumber = phoneNumber;
      if (emailAddress) recipient.emailAddress = emailAddress;

      const serviceCode = clean(order.serviceCode, 10);
      const item = {
        orderReference: clean(order.orderId, 40),
        recipient,
        packages: [
          {
            weightInGrams,
            packageFormatIdentifier: clean(order.packageFormat || 'smallParcel', 50)
          }
        ],
        orderDate: nowIso,
        subtotal,
        shippingCostCharged,
        total,
        currencyCode: 'GBP'
      };
      if (serviceCode) {
        item.postageDetails = { serviceCode };
      }
      let serviceCodeUsed = serviceCode || null;

      const payload = { items: [item] };

      const sendToRoyalMail = (body) => fetch('https://api.parcel.royalmail.com/api/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': env.ROYAL_MAIL_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body)
      });

      let rmRes = await sendToRoyalMail(payload);

      let rmText = await rmRes.text();
      let rmData;
      try {
        rmData = rmText ? JSON.parse(rmText) : {};
      } catch {
        rmData = { message: rmText || 'Royal Mail returned a non-JSON response' };
      }

      const unsupportedService = Array.isArray(rmData?.failedOrders)
        && rmData.failedOrders.some((failed) => Array.isArray(failed?.errors)
          && failed.errors.some((error) => Number(error?.errorCode) === 31
            && String(error?.fields?.[0]?.fieldName || '').toLowerCase() === 'postagedetails.servicecode'));
      if (unsupportedService && item.postageDetails?.serviceCode) {
        delete item.postageDetails;
        serviceCodeUsed = null;
        rmRes = await sendToRoyalMail({ items: [item] });
        rmText = await rmRes.text();
        try {
          rmData = rmText ? JSON.parse(rmText) : {};
        } catch {
          rmData = { message: rmText || 'Royal Mail returned a non-JSON response' };
        }
      }

      if (!rmRes.ok) {
        return jsonResponse(request, {
          error: rmData?.message || rmData,
          details: rmData?.details || rmData?.failedOrders || null,
        }, rmRes.status);
      }

      if ((rmData.errorsCount || 0) > 0 || !rmData.createdOrders?.length) {
        return jsonResponse(request, {
          error: 'Royal Mail rejected the order',
          details: rmData.failedOrders || rmData,
        }, 422);
      }

      const createdOrder = rmData.createdOrders?.[0] || {};
      const trackingNumber = createdOrder.trackingNumber || createdOrder.packages?.[0]?.trackingNumber || null;

      return jsonResponse(request, {
        success: true,
        trackingNumber: trackingNumber,
        orderId: createdOrder.orderIdentifier || createdOrder.orderId || order.orderId,
        serviceCodeUsed,
        message: 'Order created in Click & Drop. Print label from Royal Mail dashboard.',
      });

    } catch (err) {
      return jsonResponse(request, { error: err.message }, 500);
    }
  }
};
