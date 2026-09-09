import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({credential:cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=getFirestore();
for(const id of ['PHP-MTG6FPIV','PHP-MTQCKHN4','PHP-MTTXJLWR']){
 const d=await db.collection('orders').doc(id).get();
 const o=d.data()||{};
 console.log(id, JSON.stringify({status:o.status,paymentMethod:o.paymentMethod,paymentProvider:o.paymentProvider,email:o.customerEmail||o.email,total:o.totalAmount||o.total,reminder:!!o.paymentReminderSentAt,keys:Object.keys(o).filter(k=>/pay|wallid|token/i.test(k))},null,1));
}
