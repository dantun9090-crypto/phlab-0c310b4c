import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection('products').get();
for (const d of snap.docs) {
  const x = d.data();
  if (/pt-?141|pt 141/i.test(x.name || '') || /pt-?141/i.test(x.slug || '') || d.id.includes('pt')) {
    console.log('DOC:', d.id, 'name:', x.name, 'slug:', x.slug);
    console.log('variants:', JSON.stringify(x.variants, null, 2));
  }
}
process.exit(0);
