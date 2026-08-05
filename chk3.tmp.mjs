import admin from 'firebase-admin';
admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db = admin.firestore();
const BASE='https://payment-api.wallid.co/api/payment-gw/v1';
const auth='Basic '+Buffer.from(`${process.env.WALLID_KEY_ID}:${process.env.WALLID_KEY_SECRET}`).toString('base64');
const ms=(v)=>v?.toMillis?.()??(v?._seconds?v._seconds*1000:(typeof v==='number'?v:(v?Date.parse(v):0)));
const snap=await db.collection('orders').get();
const targets=[];
snap.forEach(d=>{const o=d.data();
 if(['pending_payment','failed','expired','cancelled','canceled'].includes(o.status)) targets.push({id:d.id,ref:o.orderRef||d.id,status:o.status,api:o.apiPaymentId||o.wallidPaymentId||o.paymentId,total:o.totalPrice,email:o.customerEmail||o.email,created:ms(o.createdAt||o.orderDate),paidAt:ms(o.paidAt)});});
console.log('checking',targets.length);
const out=[];
for(const t of targets){ if(!t.api){out.push({...t,api_status:'NO_API_ID'});continue;}
 const r=await fetch(`${BASE}/status?apiPaymentId=${t.api}`,{headers:{authorization:auth,accept:'application/json'}});
 const txt=await r.text(); let j=null; try{j=JSON.parse(txt)}catch{}
 out.push({ref:t.ref,local:t.status,http:r.status,api_status:j?.status||txt.slice(0,60),total:t.total,email:t.email,ageH:((Date.now()-t.created)/3600e3).toFixed(1),paidAt:t.paidAt||null});
}
const bad=out.filter(o=>/success|paid|complete|settl/i.test(String(o.api_status)));
console.log('=== MISMATCH (Wallid=paid, local=unpaid) ===', bad.length);
console.log(JSON.stringify(bad,null,1));
console.log('=== status counts ===');
const c={};out.forEach(o=>{c[`${o.local} -> ${o.api_status}`]=(c[`${o.local} -> ${o.api_status}`]||0)+1});console.log(c);
