const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
(async()=>{
const d=(await db.collection('orders').orderBy('createdAt','desc').limit(1).get()).docs[0];
console.log(d.id, JSON.stringify(d.data()).slice(0,1500));
const m=await db.collection('mail').orderBy('createdAt','desc').limit(10).get();
console.log('--- recent mail:', m.size);
m.docs.forEach(x=>{const v=x.data();console.log(x.id,'|',v.to,'|',v.message&&v.message.subject,'|',JSON.stringify(v.delivery&&{state:v.delivery.state,err:v.delivery.error}));});
})().catch(e=>{console.error(e.message)});
