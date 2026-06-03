import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection('orders').doc('PHP-MPXTMYEN').get();
console.log('exists:', snap.exists);
if (snap.exists) {
  const d = snap.data();
  console.log(JSON.stringify({
    status: d.status, fenaStatus: d.fenaStatus, fenaPaymentId: d.fenaPaymentId,
    fenaReference: d.fenaReference, totalAmount: d.totalAmount, userId: d.userId,
    fenaSelfHealedAt: d.fenaSelfHealedAt, paidAt: d.paidAt,
  }, null, 2));

  // Try Fena API
  if (d.fenaPaymentId) {
    const base = 'https://epos.api.prod-gcp.fena.co/open';
    const res = await fetch(`${base}/payments/single/${encodeURIComponent(d.fenaPaymentId)}`, {
      headers: {
        'terminal-id': process.env.FENA_TERMINAL_ID,
        'terminal-secret': process.env.FENA_TERMINAL_SECRET,
        'content-type': 'application/json',
      },
    });
    const text = await res.text();
    console.log('Fena GET status:', res.status);
    console.log('Fena body:', text.slice(0, 1000));
  }
}
process.exit(0);
