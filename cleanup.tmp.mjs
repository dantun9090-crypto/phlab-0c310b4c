import admin from 'firebase-admin';
admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
const cutoff = new Date(Date.now() - 7*864e5);

async function purge(col, match, label){
  let cursor=null, del=0, scanned=0;
  for(;;){
    let q = db.collection(col).where('createdAt','<',cutoff).orderBy('createdAt','asc').limit(500);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    cursor = snap.docs[snap.docs.length-1];
    scanned += snap.size;
    const targets = snap.docs.filter(match);
    if (targets.length){
      const w=db.batch(); targets.forEach(d=>w.delete(d.ref)); await w.commit(); del+=targets.length;
      cursor = targets.length === snap.size ? null : cursor; // deleted page: restart from beginning
    }
    if (scanned % 20000 === 0) console.log(label,'scanned',scanned,'deleted',del);
    if (snap.size < 500) break;
  }
  console.log(label,'FINAL scanned',scanned,'deleted',del);
}
await purge('securityEvents', d=>d.get('type')==='rate_limit_blocked', 'securityEvents');
await purge('auditLogs', d=>d.get('kind')==='post_publish_step', 'auditLogs');
console.log('DONE');
