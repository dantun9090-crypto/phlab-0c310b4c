const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
(async()=>{
for (const col of ['client_errors','clientErrors','error_events','errorLogs']){
 try{const s=await db.collection(col).orderBy('createdAt','desc').limit(8).get();
 console.log('==',col,s.size);
 s.forEach(d=>console.log(JSON.stringify(d.data()).slice(0,900)));}catch(e){console.log('!!',col,e.message.slice(0,120));}
}
})();
