const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
(async()=>{
const os=await db.collection('orders').orderBy('createdAt','desc').limit(12).get();
for(const d of os.docs){const o=d.data();
 const m=await db.collection('mail').where('to','==',o.email||o.customerEmail||'x').get();
 console.log(d.id,'|',o.status,'|',o.paymentStatus||'-','|',(o.email||o.customerEmail),'| mails:',m.size, m.docs.map(x=>x.data().source||x.id).join(','));}
})().catch(e=>{console.error(e.message);process.exit(1)});
