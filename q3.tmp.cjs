const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
(async()=>{
const s=await db.collection('error_events').orderBy('createdAt','desc').limit(200).get();
let n=0;
s.forEach(d=>{const x=d.data();if(x.type!=='client_exception')return;if(!/checkout/.test(x.path||''))return;if(n++>6)return;
console.log('---',x.path,'\nMSG:',x.message,'\nSTACK:',String(x.stack||'').slice(0,600),'\n');});
})();
