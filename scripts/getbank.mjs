import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection('settings').doc('siteSettings').get();
const d = snap.data() || {};
console.log(JSON.stringify({
  exists: snap.exists,
  bankTransferName: d.bankTransferName,
  bankTransferSortCode: d.bankTransferSortCode,
  bankTransferAccountNumber: d.bankTransferAccountNumber,
  bankTransferIBAN: d.bankTransferIBAN,
  bankTransferInstructions: d.bankTransferInstructions,
}, null, 2));
process.exit(0);
