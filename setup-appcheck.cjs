const admin = require('firebase-admin');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });

(async () => {
  const token = (await admin.app().options.credential.getAccessToken()).access_token;
  const projectId = sa.project_id;

  // 1. List web apps
  const appsRes = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const appsJson = await appsRes.json();
  console.log('Web apps:', JSON.stringify(appsJson, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
