const admin = require('firebase-admin');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
console.log('project:', sa.project_id);
const db = admin.firestore();
async function run() {
  const cols = await db.listCollections();
  console.log('collections:', cols.map(c=>c.id));
  for (const c of cols) {
    const snap = await c.limit(2).get();
    if (snap.size && /product/i.test(c.id)) {
      console.log(c.id, 'sample:', snap.docs[0].id, JSON.stringify(snap.docs[0].data()).slice(0,500));
    }
  }
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
