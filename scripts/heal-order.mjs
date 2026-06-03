import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
await db.collection('orders').doc('PHP-MPXTMYEN').update({
  status: 'paid', paidAt: new Date(), fenaStatus: 'paid',
  paymentProvider: 'fena', fenaSelfHealedAt: new Date(),
});
console.log('healed');
process.exit(0);
