import admin from 'firebase-admin';
admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
const cutoff = new Date(Date.now() - 7*864e5);
const NOISY = new Set(['handler.start','build_state.read','build_state.compare','handler.noop_already_invalidated']);

async function purgeAudit(){
  let del=0, kept=0;
  for(;;){
    const snap = await db.collection('auditLogs').where('kind','==','post_publish_step').where('createdAt','<',cutoff).limit(500).get();
    if (snap.empty) break;
    const w = db.batch(); let n=0;
    for (const d of snap.docs){ w.delete(d.ref); n++; }
    await w.commit(); del+=n;
    if (del % 10000 === 0) console.log('auditLogs deleted', del);
    if (n<500) break;
  }
  console.log('auditLogs post_publish_step older than 7d deleted:', del, kept);
}
async function purgeSec(){
  let del=0;
  for(;;){
    const snap = await db.collection('securityEvents').where('type','==','rate_limit_blocked').where('createdAt','<',cutoff).limit(500).get();
    if (snap.empty) break;
    const w=db.batch(); let n=0; for(const d of snap.docs){w.delete(d.ref);n++;} await w.commit(); del+=n;
    if(n<500) break;
  }
  console.log('securityEvents rate_limit_blocked older than 7d deleted:', del);
}
await purgeSec();
await purgeAudit();
console.log('DONE');
