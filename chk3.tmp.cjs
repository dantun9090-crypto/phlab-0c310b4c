const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
(async()=>{
const os=await db.collection('orders').orderBy('createdAt','desc').limit(40).get();
for(const d of os.docs){const o=d.data();const em=o.customer&&o.customer.email;
 const m=await db.collection('mail').where('to','==',em).get();
 console.log(d.id,'|',o.status,'|',o.paymentStatus||'-','| mails:',m.size);}
})().catch(e=>console.error(e.message));
