const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
(async()=>{
const o=await db.collection('orders').orderBy('createdAt','desc').limit(12).get();
for(const d of o.docs){const x=d.data();console.log(d.id,'|',x.orderRef||x.reference,'|',x.paymentStatus,'|',x.status,'|',x.customerEmail||x.email,'|',x.createdAt&&x.createdAt.toDate?x.createdAt.toDate().toISOString():x.createdAt);}
console.log('--- mail latest ---');
const m=await db.collection('mail').orderBy('createdAt','desc').limit(15).get();
for(const d of m.docs){const x=d.data();console.log(d.id,'|',x.to,'|',x.message&&x.message.subject,'|',JSON.stringify(x.delivery&&{state:x.delivery.state,err:x.delivery.error}),'|',x.createdAt&&x.createdAt.toDate?x.createdAt.toDate().toISOString():x.createdAt);}
})().catch(e=>{console.error('ERR',e.message)});
