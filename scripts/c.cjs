const admin = require('firebase-admin');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
async function run() {
  const snap = await db.collection('product_stock').get();
  for (const d of snap.docs) {
    const x = d.data();
    if (/pt[\s-]?141/i.test(x.name||'') || /pt-?141/i.test(x.slug||'') || /PT141/i.test(x.sku||'')) {
      console.log('DOC:', d.id);
      console.log('keys:', Object.keys(x));
      console.log('name:', x.name, 'slug:', x.slug, 'sku:', x.sku);
      console.log('hplc fields:', Object.keys(x).filter(k=>/hplc/i.test(k)));
      console.log('variants:', JSON.stringify(x.variants, null, 2));
    }
  }
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
