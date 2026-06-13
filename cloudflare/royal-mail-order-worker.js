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
 */

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, x-phlabs-auth'
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Auth gate — shared secret between your frontend and this worker
    const authHeader = request.headers.get('x-phlabs-auth');
    if (authHeader !== env.SHARED_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const order = await request.json();

      if (!order.postcode || !order.addressLine1 || !order.orderId) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
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

      const payload = {
        items: [
          {
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
            currencyCode: 'GBP',
            postageDetails: {
              serviceCode: clean(order.serviceCode || 'CRL1', 10)
            }
          }
        ]
      };



      const rmRes = await fetch('https://api.parcel.royalmail.com/api/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': env.ROYAL_MAIL_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const rmText = await rmRes.text();
      let rmData;
      try {
        rmData = rmText ? JSON.parse(rmText) : {};
      } catch {
        rmData = { message: rmText || 'Royal Mail returned a non-JSON response' };
      }

      if (!rmRes.ok) {
        return new Response(JSON.stringify({
          error: rmData?.message || rmData,
          details: rmData?.details || rmData?.failedOrders || null
        }), {
          status: rmRes.status,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      if ((rmData.errorsCount || 0) > 0 || !rmData.createdOrders?.length) {
        return new Response(JSON.stringify({
          error: 'Royal Mail rejected the order',
          details: rmData.failedOrders || rmData
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const createdOrder = rmData.createdOrders?.[0] || {};
      const trackingNumber = createdOrder.trackingNumber || createdOrder.packages?.[0]?.trackingNumber || null;

      return new Response(JSON.stringify({
        success: true,
        trackingNumber: trackingNumber,
        orderId: createdOrder.orderIdentifier || createdOrder.orderId || order.orderId,
        message: 'Order created in Click & Drop. Print label from Royal Mail dashboard.'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
