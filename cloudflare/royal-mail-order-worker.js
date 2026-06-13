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
 *   orderId, firstName, lastName, addressLine1, addressLine2?, postcode,
 *   countryCode?, email?, serviceCode, weightGrams
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

      const payload = {
        items: [
          {
            orderReference: order.orderId,
            recipient: {
              address: {
                fullName: `${order.firstName || ''} ${order.lastName || ''}`.trim() || 'Customer',
                companyName: '',
                addressLine1: order.addressLine1,
                addressLine2: order.addressLine2 || '',
                addressLine3: '',
                city: order.city || '',
                county: '',
                postcode: order.postcode,
                countryCode: order.countryCode || 'GB'
              },
              phoneNumber: order.phone || '',
              emailAddress: order.email || ''
            },
            packages: [
              {
                weightInGrams: order.weightGrams || 100,
                packageFormatIdentifier: order.packageFormat || 'smallParcel'
              }
            ],
            subtotal: 0,
            shippingCostCharged: 0,
            total: 0,
            currencyCode: 'GBP',
            postageDetails: {
              sendNoEmail: false,
              serviceCode: order.serviceCode || 'CRL1'
            }
          }
        ]
      };


      const rmRes = await fetch('https://api.parcel.royalmail.com/api/v1/Orders', {
        method: 'POST',
        headers: {
          'Authorization': env.ROYAL_MAIL_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const rmData = await rmRes.json();

      if (!rmRes.ok) {
        return new Response(JSON.stringify({ error: rmData }), {
          status: rmRes.status,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const createdOrder = rmData.createdOrders?.[0] || {};
      const trackingNumber = createdOrder.trackingNumber || null;

      return new Response(JSON.stringify({
        success: true,
        trackingNumber: trackingNumber,
        orderId: createdOrder.orderId || order.orderId,
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
