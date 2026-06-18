const admin = require('firebase-admin');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });

const APP_ID = '1:1070409753291:web:8bf1e58130fbe23e66f14e';
const SITE_KEY = '6LfsNictAAAAAP7R0Whd51frVgUToe9G1RaQ4h84';

(async () => {
  const token = (await admin.app().options.credential.getAccessToken()).access_token;
  const projectId = sa.project_id;

  // Configure reCAPTCHA Enterprise provider for the web app
  const url = `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${APP_ID}/recaptchaEnterpriseConfig?updateMask=siteKey`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `projects/${projectId}/apps/${APP_ID}/recaptchaEnterpriseConfig`,
      siteKey: SITE_KEY,
    }),
  });
  const json = await res.json();
  console.log('Status:', res.status);
  console.log(JSON.stringify(json, null, 2));
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
