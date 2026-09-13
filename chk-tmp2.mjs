import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
initializeApp({credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=getFirestore();
const s=await db.collection('orders').get();
let total=0;const missing=[];
s.forEach(d=>{const o=d.data();total++;
 if(!o.userId){const email=(o.customer?.email||o.userEmail||o.customerEmail||'').toLowerCase();
  if(!d.id.startsWith('test-'))missing.push({id:d.id,email,date:o.orderDate?.toDate?.().toISOString()||null,status:o.status});}});
console.log({total,noUid:missing.length});
const emails=[...new Set(missing.map(m=>m.email).filter(Boolean))];
const map={};
for(const e of emails){try{const u=await getAuth().getUserByEmail(e);map[e]=u.uid;}catch{}}
console.log('unique guest emails',emails.length,'-> have an account:',Object.keys(map).length);
const linkable=missing.filter(m=>map[m.email]);
console.log('orders linkable:',linkable.length);
console.log(linkable.slice(-15));
