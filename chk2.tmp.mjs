import admin from 'firebase-admin';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const db = admin.firestore();
for (const id of ['PHP-MS5G8J23','PHP-MS5QPWCJ','PHP-MS5BXENE','PHP-MS5BMOKN']) {
  const s = await db.collection('orders').doc(id).get();
  const o = s.data()||{};
  console.log(id, '| status', o.status, '| retrySentAt', o.paymentRetryEmailSentAt?.toDate?.()?.toISOString?.()||o.paymentRetryEmailSentAt||'none', '| reminderAt', o.paymentReminderSentAt?.toDate?.()?.toISOString?.()||'none', '| created', o.createdAt?.toDate?.()?.toISOString?.());
}
const mail = await db.collection('mail').orderBy('delivery.startTime','desc').limit(200).get();
const hits = mail.docs.map(d=>d.data()).filter(m=>/MS5G8J23|MS5QPWCJ/.test(m.message?.subject||''));
console.log('mails for those:', hits.map(h=>h.message.subject));
