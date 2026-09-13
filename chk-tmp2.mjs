import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
initializeApp({credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=getFirestore();
const s=await db.collection('orders').get();
let total=0;const missing=[];
s.forEach(d=>{const o=d.data();total++;if(!o.userId)missing.push({id:d.id,n:o.orderNumber||d.id,email:(o.userEmail||o.customerEmail||o.email||'').toLowerCase(),date:o.orderDate?.toDate?.().toISOString()||null});});
console.log({total,noUid:missing.length});
const emails=[...new Set(missing.map(m=>m.email).filter(Boolean))];
const map={};
for(const e of emails){try{const u=await getAuth().getUserByEmail(e);map[e]=u.uid;}catch{}}
console.log('guest emails',emails.length,'with account',Object.keys(map).length);
console.log(missing.slice(-12));
console.log(map);
