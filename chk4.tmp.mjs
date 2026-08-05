import admin from 'firebase-admin';
admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
const BASE='https://payment-api.wallid.co/api/payment-gw/v1';
const auth='Basic '+Buffer.from(`${process.env.WALLID_KEY_ID}:${process.env.WALLID_KEY_SECRET}`).toString('base64');
const ms=(v)=>v?.toMillis?.()??(v?._seconds?v._seconds*1000:(typeof v==='number'?v:0));
const snap=await db.collection('orders').orderBy('createdAt','desc').limit(60).get();
let shown=0; const lags=[];
for(const d of snap.docs){const o=d.data();
 const api=o.apiPaymentId||o.wallidPaymentId||o.paymentId; if(!api) continue;
 if(o.paidAt) lags.push({ref:o.orderRef||d.id, lagS:((ms(o.paidAt)-ms(o.createdAt))/1000).toFixed(0)});
 if(shown<2){const r=await fetch(`${BASE}/status?apiPaymentId=${api}`,{headers:{authorization:auth}});const t=await r.text();console.log('RAW',o.orderRef,t.slice(0,900));shown++;}
}
console.log('paidAt lag seconds (sample):',JSON.stringify(lags.slice(0,25)));
// order doc field names present
const o=snap.docs[0].data(); console.log('order fields:',Object.keys(o).sort().join(','));
