import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection('fena_webhook_events').orderBy('createdAt','desc').limit(10).get();
snap.forEach(d => {
  const x = d.data();
  console.log('---', d.id, x.createdAt?.toDate?.()?.toISOString?.() || x.createdAt, x.level, x.message);
  console.log(JSON.stringify(x.ctx, null, 2));
});
process.exit(0);
