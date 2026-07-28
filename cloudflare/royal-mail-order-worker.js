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
 *   - SHARED_SECRET        random string; must match ROYAL_MAIL_WORKER_TOKEN (server env)
 *   - ROYAL_MAIL_CLIENT_ID     (optional) Tracking API V2 X-IBM-Client-Id —
 *   - ROYAL_MAIL_CLIENT_SECRET (optional) Tracking API V2 X-IBM-Client-Secret.
 *                              Enables the official /mailpieces/v2 events lookup
 *                              in trackByNumber; without it only the Click &
 *                              Drop order search is used.
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

/**
 * Headers that MUST appear on every response this Worker emits, regardless
 * of status or code path. They stop any CDN or browser HTTP cache from
 * serving a response that was computed for a different Origin (which would
 * effectively leak CORS decisions across sites).
 *
 *  - `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers`
 *    Any downstream cache MUST key by these request headers. If a shared
 *    cache ever stored one variant, it would still return the correct one
 *    per origin/preflight combo.
 *  - `Cache-Control: no-store` + `Pragma: no-cache`
 *    Belt and braces: this endpoint is a stateful RPC. No cache — private,
 *    shared, or CDN — is allowed to reuse a response. Combined with `Vary`
 *    this makes cross-origin leakage impossible even if a middlebox ignores
 *    one of the two directives.
 */
const NO_CACHE_HEADERS = Object.freeze({
  'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'Expires': '0',
});

function corsHeadersFor(request) {
  const origin = request.headers.get('Origin');
  const headers = {
    ...NO_CACHE_HEADERS,
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
      // browser blocks the follow-up request. Vary + no-store still apply
      // so no cache can serve this negative reply to another origin.
      if (!cors['Access-Control-Allow-Origin']) {
        return new Response(null, { status: 403, headers: { ...NO_CACHE_HEADERS } });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { 'Content-Type': 'text/plain', Allow: 'POST, OPTIONS', ...NO_CACHE_HEADERS },
      });
    }

    // Origin gate for browser callers. Server-to-server callers omit
    // Origin entirely and are allowed (auth still required below).
    const origin = request.headers.get('Origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...NO_CACHE_HEADERS },
      });
    }

    // Auth gate — shared secret between your frontend and this worker
    const authHeader = request.headers.get('x-phlabs-auth');
    if (authHeader !== env.SHARED_SECRET) {
      return jsonResponse(request, { error: 'Unauthorized' }, 401);
    }

    try {
      const order = await request.json();

      // ---- Action: tracking status lookup -------------------------------
      // Click & Drop returns `trackingNumber: null` at creation time because
      // postage hasn't been applied yet. Once the operator applies postage /
      // generates the label in Click & Drop, the tracking number appears on
      // the order. This action re-reads an existing order so the app can
      // write the tracking number back without creating a duplicate order.
      if (order && order.action === 'trackingStatus') {
        const identifier = String(order.royalMailOrderId || '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 40);
        const reference = String(order.orderReference || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 40);
        if (!identifier && !reference) {
          return jsonResponse(request, { error: 'Missing royalMailOrderId or orderReference' }, 400);
        }

        // Click & Drop accepts either an order identifier (numeric) or a
        // channel reference wrapped in double quotes. Try the identifier
        // first, then fall back to the quoted reference.
        const candidates = [];
        if (identifier) candidates.push(identifier);
        if (reference) candidates.push(`"${reference}"`);

        let found = null;
        let lastDetails = null;
        let lastStatus = 404;
        for (const candidate of candidates) {
          const lookup = await fetch(
            `https://api.parcel.royalmail.com/api/v1/orders/${encodeURIComponent(candidate)}`,
            {
              method: 'GET',
              headers: {
                'Authorization': env.ROYAL_MAIL_API_KEY,
                'Accept': 'application/json',
              },
            },
          );
          const lookupText = await lookup.text();
          let lookupData;
          try {
            lookupData = lookupText ? JSON.parse(lookupText) : {};
          } catch {
            lookupData = { message: lookupText || 'Royal Mail returned a non-JSON response' };
          }
          if (!lookup.ok) {
            lastStatus = lookup.status;
            lastDetails = typeof lookupText === 'string' ? lookupText.slice(0, 500) : null;
            continue;
          }
          const orders = Array.isArray(lookupData)
            ? lookupData
            : Array.isArray(lookupData?.orders)
              ? lookupData.orders
              : [lookupData];
          if (orders.length && orders[0]) {
            found = orders[0];
            break;
          }
        }

        if (!found) {
          return jsonResponse(
            request,
            { error: 'Royal Mail lookup failed', details: lastDetails },
            lastStatus,
          );
        }

        const tracking =
          found.trackingNumber ||
          found.packages?.[0]?.trackingNumber ||
          found.postageDetails?.trackingNumber ||
          null;
        return jsonResponse(request, {
          success: true,
          royalMailOrderId: String(found.orderIdentifier || found.accountOrderNumber || identifier || ''),
          trackingNumber: tracking,
          orderReference: found.orderReference || reference || null,
          status: found.orderStatus || found.status || null,
          labelGenerated: Boolean(found.labelGeneratedDate || tracking),
        });
      }

      // ---- Action: delivery status by tracking number -------------------
      // Used by the delivery-sync route: checks whether Royal Mail reports a
      // parcel as delivered. Tries the official Tracking API first (works if
      // the Click & Drop key has the tracking entitlement), then falls back
      // to a Click & Drop order search by tracking number.
      if (order && order.action === 'trackByNumber') {
        const trackingNumber = String(order.trackingNumber || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 40);
        if (!trackingNumber) {
          return jsonResponse(request, { error: 'Missing trackingNumber' }, 400);
        }

        const isDeliveredName = (name) => {
          const n = String(name || '');
          return /delivered/i.test(n) && !/out for delivery/i.test(n);
        };
        // RM payloads vary across products — walk the JSON and collect every
        // human-readable event/status string, then decide from the text.
        const collectEventNames = (value, acc) => {
          acc = acc || [];
          if (Array.isArray(value)) {
            for (const item of value) collectEventNames(item, acc);
          } else if (value && typeof value === 'object') {
            for (const key of Object.keys(value)) {
              if (/^(eventName|eventSummary|summary|status|statusSummary|eventDescription|description|scanMessage|scanSummary)$/i.test(key)) {
                acc.push(value[key]);
              } else {
                collectEventNames(value[key], acc);
              }
            }
          }
          return acc;
        };
        const parseResult = (data, source) => {
          const names = collectEventNames(data).map((n) => String(n || ''));
          const deliveredEvent = names.find((n) => isDeliveredName(n));
          return {
            success: true,
            source,
            delivered: Boolean(deliveredEvent),
            status: deliveredEvent || names[names.length - 1] || '',
            recentEvents: names.slice(-5),
          };
        };

        // 1) Official Royal Mail Tracking API V2 (spec v1.0.38):
        //    GET https://api.royalmail.net/mailpieces/v2/{mailPieceId}/events
        //    Headers: X-IBM-Client-Id, X-IBM-Client-Secret, X-Accept-RMG-Terms: yes
        //    Response: { mailPieces: { summary: { statusCategory, lastEventName,
        //              statusDescription, ... }, events: [{ eventName, ... }] } }
        //    Requires the Tracking API product enabled on the RM developer
        //    account (separate Client-Id/Secret from Click & Drop).
        // Diagnostics surfaced in the Click & Drop fallback response so we
        // can tell "secrets missing" from "API rejected the credentials".
        // Credentials are trimmed: values pasted into the Cloudflare
        // dashboard / `wrangler secret put` frequently carry a trailing
        // newline or space, which makes IBM reply
        // "401 Invalid client id or secret." even when the value is right.
        const rmId = String(env.ROYAL_MAIL_CLIENT_ID || '').trim();
        const rmSecret = String(
          env.ROYAL_MAIL_CLIENT_SECRET || env.ROLAY_MAIL_CLIENT_SECRET || '',
        ).trim();
        const trackDiag = {
          secretsPresent: Boolean(rmId && rmSecret),
          // Lengths only — never the values. Lets us spot a truncated or
          // whitespace-padded paste without leaking the credential.
          idLength: rmId.length,
          secretLength: rmSecret.length,
          httpStatus: null,
          error: null,
        };
        if (rmId && rmSecret) {
          // Same contract as the official Royal Mail PHP SDK
          // (RoyalMail\SDK\V2Tracking): base https://api.royalmail.net with
          // the three IBM headers. `events` is the richest endpoint; when the
          // account is only entitled to `summary` (or the item has no event
          // history yet) we fall back to it before giving up.
          const endpointsFor = (mp) => [
            `https://api.royalmail.net/mailpieces/v2/${encodeURIComponent(mp)}/events`,
            `https://api.royalmail.net/mailpieces/v2/summary?mailPieceId=${encodeURIComponent(mp)}`,
          ];
          const callTracking = (url, id, secret) =>
            fetch(url, {
              headers: {
                'X-IBM-Client-Id': id,
                'X-IBM-Client-Secret': secret,
                'X-Accept-RMG-Terms': 'yes',
                'Accept': 'application/json',
              },
            });
          try {
            const urls = endpointsFor(trackingNumber);
            let res = await callTracking(urls[0], rmId, rmSecret);
            // Common operator mistake: id and secret pasted the wrong way
            // round. Retry once swapped before declaring the creds invalid.
            if (res.status === 401) {
              const swapped = await callTracking(urls[0], rmSecret, rmId);
              if (swapped.status !== 401) {
                res = swapped;
                trackDiag.error = 'credentials were swapped (id/secret reversed)';
              }
            }
            // No event history / endpoint not entitled → try summary.
            if (!res.ok && [400, 404, 403].includes(res.status)) {
              const alt = await callTracking(urls[1], rmId, rmSecret);
              if (alt.ok) res = alt;
            }


            const text = await res.text();
            trackDiag.httpStatus = res.status;
            if (res.ok) {
              let data;
              try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
              const mp = data?.mailPieces || {};
              const summary = mp.summary || {};
              // Trust the structured statusCategory first ("DELIVERED",
              // "IN TRANSIT", ...), fall back to event-name text matching.
              const category = String(summary.statusCategory || '');
              const structured = {
                events: (Array.isArray(mp.events) ? mp.events : []).map((ev) => ev?.eventName),
                names: [category, summary.lastEventName, summary.statusDescription, summary.summaryLine],
              };
              const names = [
                ...structured.names,
                ...structured.events,
                ...collectEventNames(data),
              ].map((n) => String(n || '')).filter(Boolean);
              const deliveredEvent =
                (/delivered/i.test(category) && !/out for delivery/i.test(category) && category) ||
                names.find((n) => isDeliveredName(n));
              return jsonResponse(request, {
                success: true,
                source: 'tracking-api',
                delivered: Boolean(deliveredEvent),
                status: String(deliveredEvent || summary.statusDescription || summary.lastEventName || names[names.length - 1] || ''),
                statusCategory: category || undefined,
                lastEventDateTime: summary.lastEventDateTime || undefined,
                recentEvents: names.slice(-5),
              });
            }
            // 401/403 (no tracking entitlement) and 404 (unknown item) fall
            // through to the Click & Drop search below.
            if ([401, 403, 404].includes(res.status)) {
              trackDiag.error = text.slice(0, 200);
            } else {
              return jsonResponse(request, { error: 'Royal Mail tracking lookup failed', details: text.slice(0, 400) }, res.status);
            }
          } catch (e) { trackDiag.error = String(e && e.message ? e.message : e); /* fall through */ }
        }

        // 2) Click & Drop order search by tracking number (best effort).
        const cd = await fetch(
          `https://api.parcel.royalmail.com/api/v1/orders?trackingNumber=${encodeURIComponent(trackingNumber)}`,
          { headers: { 'Authorization': env.ROYAL_MAIL_API_KEY, 'Accept': 'application/json' } },
        );
        const cdText = await cd.text();
        if (!cd.ok) {
          return jsonResponse(request, { error: 'Royal Mail lookup failed', details: cdText.slice(0, 400) }, cd.status);
        }
        let cdData;
        try { cdData = cdText ? JSON.parse(cdText) : {}; } catch { cdData = {}; }
        const orders = Array.isArray(cdData)
          ? cdData
          : Array.isArray(cdData?.orders)
            ? cdData.orders
            : [cdData];
        if (!orders.length || !orders[0]) {
          return jsonResponse(request, { error: 'Tracking number not found', trackingNumber }, 404);
        }
        const cdResult = parseResult(orders[0], 'click-and-drop');
        cdResult.trackingApi = trackDiag;
        return jsonResponse(request, cdResult);
      }

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
