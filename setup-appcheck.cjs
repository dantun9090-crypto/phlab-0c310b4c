const admin = require('firebase-admin');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });

(async () => {
  const token = (await admin.app().options.credential.getAccessToken()).access_token;
  const projectId = sa.project_id;
  const projectNumber = '1070409753291';

  // Check enforcement state for all known services
  const services = ['firestore.googleapis.com', 'firebasestorage.googleapis.com', 'identitytoolkit.googleapis.com'];
  for (const svc of services) {
    const r = await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/services/${svc}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    console.log(svc, '→', JSON.stringify(j));
  }
})().catch(e => { console.error(e); process.exit(1); });
