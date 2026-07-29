import admin from 'firebase-admin';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const db = admin.firestore();
const since = new Date(Date.now() - 7*24*3600e3);
const os = await db.collection('orders').where('createdAt','>=',since).orderBy('createdAt','desc').limit(40).get();
console.log('orders last 7d:', os.size);
for (const d of os.docs) {
  const o = d.data();
  console.log(d.id, '|', o.status, '|', o.paymentStatus||'', '|', (o.customerEmail||o.email||'').slice(0,25), '|', o.createdAt?.toDate?.()?.toISOString());
}
const mail = await db.collection('mail').orderBy('delivery.startTime','desc').limit(25).get().catch(e=>null);
if (mail) { console.log('\n--- mail (25) ---');
  for (const m of mail.docs) { const x=m.data(); console.log(x.to, '|', x.message?.subject?.slice(0,60), '|', x.delivery?.state, '|', x.delivery?.error||''); } }
