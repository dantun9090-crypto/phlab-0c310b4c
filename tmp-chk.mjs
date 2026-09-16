import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db = getFirestore();
const f = (v)=>String(v&&v.toDate?v.toDate():v);
let snap = await db.collection('orders').where('orderNumber','==','PHP-MU2Z2B5I').get();
if (snap.empty) snap = await db.collection('orders').where('orderId','==','PHP-MU2Z2B5I').get();
console.log('orders found', snap.size);
for (const d of snap.docs) {
  const o = d.data();
  console.log('id', d.id);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(o).map(([k,v])=>[k, (v&&v.toDate)?f(v):v])),null,1).slice(0,3000));
}
const mail = await db.collection('mail').orderBy('createdAt','desc').limit(400).get().catch(e=>({docs:[],size:0,e:e.message}));
const hits = (mail.docs||[]).filter(d=>JSON.stringify(d.data()).includes('MU2Z2B5I'));
console.log('mail scanned', mail.size, 'hits', hits.length);
for (const d of hits) { const m=d.data(); console.log(d.id,'|',m.to,'|',m.message?.subject,'|',JSON.stringify({state:m.delivery?.state,error:m.delivery?.error})); }
