import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const ids = ['PHP-MQMVOSO2','PHP-MQLLVECH','PHP-MQLLBSD2','PHP-MQLKPEZX'];
for (const id of ids) {
  const snap = await db.collection('orders').doc(id).get();
  if (!snap.exists) { console.log(id, 'NOT FOUND'); continue; }
  const d = snap.data();
  console.log(id, 'status=', d.status, 'paymentProvider=', d.paymentProvider, 'paidAt=', d.paidAt?.toDate?.()?.toISOString?.(), 'total=', d.totalAmount, 'email=', d.customerEmail||d.email);
}
process.exit(0);
