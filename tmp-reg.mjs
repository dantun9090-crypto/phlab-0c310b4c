
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const key = process.env.AFTERSHIP_API_KEY;
const snap = await db.collection('orders').get();
const rows = [];
snap.forEach(d => { const o = d.data(); const t = String(o.trackingNumber||'').trim();
  if (t && o.aftershipRegistered !== true && !['cancelled','refunded'].includes(String(o.status))) rows.push({ id: d.id, t, o }); });
console.log('candidates', rows.length);
let ok=0, exists=0; const errs=[];
for (const r of rows) {
  const c = r.o.customer || {};
  const body = { tracking_number: r.t, slug: 'royal-mail', title: `PH Labs order ${r.id}`, order_id: r.id,
    ...(c.postcode ? { tracking_postal_code: String(c.postcode).replace(/\s+/g,'').toUpperCase() } : {}),
    ...(r.o.userEmail ? { emails: [r.o.userEmail] } : {}) };
  const res = await fetch('https://api.aftership.com/tracking/2026-07/trackings', { method:'POST',
    headers: { 'as-api-key': key, 'content-type':'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(()=>({}));
  const meta = j?.meta?.code || res.status;
  if (res.ok || meta === 4003) {
    if (meta === 4003) exists++; else ok++;
    await db.collection('orders').doc(r.id).update({ aftershipRegistered: true, aftershipSlug: 'royal-mail', aftershipRegisteredAt: new Date() }).catch(()=>{});
  } else errs.push(`${r.id}:${meta}:${(j?.meta?.message||'').slice(0,60)}`);
  await new Promise(r2 => setTimeout(r2, 260));
}
console.log('created', ok, 'already-existing', exists, 'errors', errs.length);
console.log(errs.slice(0,15).join('\n'));
