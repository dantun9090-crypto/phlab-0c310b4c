import admin from 'firebase-admin';
admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db = admin.firestore();
const snap = await db.collection('orders').where('orderNumber','==','PHP-MU2Z2B5I').get();
if (snap.empty) console.log('not found by orderNumber');
for (const d of snap.docs) {
  const o = d.data();
  const f = (v)=>String(v&&v.toDate?v.toDate():v);
  console.log('id', d.id);
  console.log(JSON.stringify({status:o.status,paymentStatus:o.paymentStatus,email:o.email||o.customerEmail,total:o.totalPrice||o.total,createdAt:f(o.createdAt),paidAt:f(o.paidAt),ref:o.paymentReference||o.bankReference,provider:o.paymentProvider||o.paymentMethod,emailsSent:o.emailsSent,name:o.customerName||o.firstName},null,2));
}
const mail = await db.collection('mail').orderBy('createdAt','desc').limit(300).get();
const hits = mail.docs.filter(d=>JSON.stringify(d.data()).includes('MU2Z2B5I'));
console.log('mail hits', hits.length);
for (const d of hits) { const m=d.data(); console.log(d.id,'|',m.to,'|',m.message?.subject,'|',JSON.stringify(m.delivery&&{state:m.delivery.state,error:m.delivery.error,end:String(m.delivery.endTime)})); }
