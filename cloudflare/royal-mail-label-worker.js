/**
 * Royal Mail Label Worker
 * --------------------------------------------------------------
 * Deployed as a standalone Cloudflare Worker (NOT bound to phlabs.co.uk).
 * Receives an admin request from src/pages/Admin/tabs/OrdersTab.tsx,
 * authenticates it with a shared secret, then calls the Royal Mail
 * Click & Drop API server-side so the real ROYAL_MAIL_API_KEY never
 * ships in the browser bundle.
 *
 * Required Worker secrets (configured in the Cloudflare dashboard or via
 * `wrangler secret put`):
 *   - ROYAL_MAIL_API_KEY   Click & Drop API token
 *   - SHARED_SECRET        random string; must match VITE_ROYAL_MAIL_WORKER_TOKEN
 *
 * Optional Worker var:
 *   - ALLOWED_ORIGINS      comma-separated list, defaults to phlabs.co.uk
 *                         + lovable preview origins
 *
 * Endpoint: POST /  (JSON body — see SCHEMA below)
 * Response: { trackingNumber, labelUrl? }  on success
 *           { error: string }              on failure (with proper status)
 */

const SERVICE_CODES = new Set(['CRL1', 'CRL2', 'TRM']);
const DEFAULT_ALLOWED_ORIGINS = [
  'https://phlabs.co.uk',
  'https://www.phlabs.co.uk',
  'https://phlab.lovable.app',
];

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin =
    origin && (allowed.includes(origin) || /\.lovable\.app$/.test(new URL(origin).hostname))
      ? origin
      : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-phlabs-auth',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(origin, env),
    },
  });
}

// Timing-safe string compare (constant-time-ish via XOR over equal-length input)
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clampStr(v, max = 200) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function validate(body) {
  const errors = [];
  const orderId = clampStr(body?.orderId, 80);
  const firstName = clampStr(body?.firstName, 80);
  const lastName = clampStr(body?.lastName, 80);
  const addressLine1 = clampStr(body?.addressLine1, 200);
  const addressLine2 = clampStr(body?.addressLine2, 200);
  const postcode = clampStr(body?.postcode, 20).toUpperCase();
  const email = clampStr(body?.email, 200);
  const service = clampStr(body?.service, 10);
  const weightGrams = Number(body?.weightGrams);

  if (!orderId) errors.push('orderId required');
  if (!firstName) errors.push('firstName required');
  if (!lastName) errors.push('lastName required');
  if (!addressLine1) errors.push('addressLine1 required');
  if (!/^[A-Z0-9 ]{4,10}$/.test(postcode)) errors.push('postcode invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email invalid');
  if (!SERVICE_CODES.has(service)) errors.push('service must be CRL1, CRL2 or TRM');
  if (!Number.isFinite(weightGrams) || weightGrams < 1 || weightGrams > 2000) {
    errors.push('weightGrams must be 1-2000');
  }

  return {
    ok: errors.length === 0,
    errors,
    data: {
      orderId, firstName, lastName, addressLine1, addressLine2,
      postcode, email, service, weightGrams,
    },
  };
}

// Map UI service code → Royal Mail Click & Drop serviceCode
const RM_SERVICE_MAP = {
  CRL1: 'CRL1', // 2nd Class
  CRL2: 'CRL2', // 1st Class
  TRM:  'TRM',  // Tracked 24
};

async function createRoyalMailLabel(input, env) {
  const orderPayload = {
    orderReference: input.orderId,
    recipient: {
      address: {
        fullName: `${input.firstName} ${input.lastName}`.trim(),
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 || undefined,
        postcode: input.postcode,
        country: 'GB',
      },
      emailAddress: input.email,
    },
    packages: [
      { weightInGrams: input.weightGrams, packageFormatIdentifier: 'smallParcel' },
    ],
    shippingService: {
      serviceCode: RM_SERVICE_MAP[input.service],
      serviceRegisterCode: input.service === 'TRM' ? 'TPN' : undefined,
    },
    label: { includeLabelInResponse: true, includeReturnsLabel: false },
  };

  const res = await fetch('https://api.parcel.royalmail.com/api/v1/orders', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'authorization': `Bearer ${env.ROYAL_MAIL_API_KEY}`,
    },
    body: JSON.stringify(orderPayload),
  });

  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  if (!res.ok) {
    const msg =
      parsed?.message ||
      parsed?.error?.message ||
      parsed?.errors?.[0]?.errorMessage ||
      parsed?.errorMessage ||
      `Royal Mail API ${res.status}`;
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 500 ? 422 : 502;
    throw err;
  }

  // Click & Drop returns either createdOrders[0] or a single object
  const created = parsed?.createdOrders?.[0] || parsed;
  const trackingNumber =
    created?.trackingNumber ||
    created?.shipmentNumber ||
    created?.label?.trackingNumber ||
    null;
  const labelUrl =
    created?.label?.labelUrl ||
    created?.labelUrl ||
    null;

  if (!trackingNumber) {
    const err = new Error('Royal Mail response missing trackingNumber');
    err.status = 502;
    throw err;
  }

  return { trackingNumber, labelUrl };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin, env);
    }

    if (!env.ROYAL_MAIL_API_KEY || !env.SHARED_SECRET) {
      return json({ error: 'Worker not configured' }, 500, origin, env);
    }

    const auth = request.headers.get('x-phlabs-auth') || '';
    if (!safeEqual(auth, env.SHARED_SECRET)) {
      return json({ error: 'Unauthorized' }, 401, origin, env);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400, origin, env); }

    const { ok, errors, data } = validate(body);
    if (!ok) return json({ error: errors.join('; ') }, 400, origin, env);

    try {
      const result = await createRoyalMailLabel(data, env);
      console.log(JSON.stringify({ orderId: data.orderId, status: 'ok' }));
      return json(result, 200, origin, env);
    } catch (e) {
      const status = e?.status || 502;
      console.log(JSON.stringify({ orderId: data.orderId, status: 'error', code: status }));
      return json({ error: e?.message || 'Royal Mail request failed' }, status, origin, env);
    }
  },
};
