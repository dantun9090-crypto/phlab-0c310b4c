// One-off: creates composite indexes via Firestore Admin REST API.
// Usage: FIREBASE_SERVICE_ACCOUNT_JSON=... bun scripts/create-firestore-indexes.ts
import admin from 'firebase-admin';

const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!);
admin.initializeApp({ credential: admin.credential.cert(svc) });

const projectId = svc.project_id;
const token = (await admin.app().options.credential!.getAccessToken()).access_token;

const indexes = [
  { collection: 'products', fields: [['category','ASCENDING'],['name','ASCENDING']] },
  { collection: 'orders',   fields: [['userId','ASCENDING'],['orderDate','DESCENDING']] },
  { collection: 'lab_reports', fields: [['uid','ASCENDING'],['createdAt','DESCENDING']] },
];

for (const idx of indexes) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/${idx.collection}/indexes`;
  const body = {
    queryScope: 'COLLECTION',
    fields: idx.fields.map(([fieldPath, order]) => ({ fieldPath, order })),
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`[${idx.collection}] ${res.status} ${text.slice(0,200)}`);
}
