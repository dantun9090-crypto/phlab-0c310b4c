import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db = getFirestore();
for (const id of ['eJBZwJzfxEiipGYE7fZ4','KiLnvySTgb2DcMwhO2Qf']) {
  const d = await db.collection('mail').doc(id).get();
  const m = d.data();
  console.log(id, '| to', m.to, '| subj', m.message?.subject, '| from', m.from, '| createdAt', String(m.createdAt?.toDate?.()||m.createdAt), '| delivery', JSON.stringify({state:m.delivery?.state, start:String(m.delivery?.startTime?.toDate?.()||''), end:String(m.delivery?.endTime?.toDate?.()||''), info:m.delivery?.info, err:m.delivery?.error}));
}
