const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
(async()=>{
const s=await db.collection('error_events').where('type','==','client_exception').orderBy('createdAt','desc').limit(15).get();
console.log(s.size);
s.forEach(d=>{const x=d.data();console.log('---',x.path,'\nMSG:',x.message,'\nSTACK:',String(x.stack||'').slice(0,400));});
})();
