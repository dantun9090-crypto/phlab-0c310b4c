const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
(async()=>{
const os=await db.collection('orders').orderBy('createdAt','desc').limit(12).get();
for(const d of os.docs){const o=d.data();
 const m=await db.collection('mail').where('source','in',['order-received','payment-confirmed','order-status']).get().catch(()=>null);
 console.log(d.id, o.status, o.paymentStatus||'', (o.customer?.email||o.email||o.customerEmail||'?'), String(o.createdAt).slice(0,19));
}
console.log('--- recent mail ---');
const ms=await db.collection('mail').orderBy('createdAt','desc').limit(25).get();
ms.docs.forEach(d=>{const m=d.data();console.log(d.id,'|',m.source||'?','|',m.to,'|',m.message?.subject?.slice(0,50),'|',m.delivery?.state||'none',m.delivery?.error||'');});
})();
