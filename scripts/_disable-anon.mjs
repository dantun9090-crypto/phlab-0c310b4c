import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });

// 1) Get OAuth token
const { GoogleAuth } = await import('google-auth-library');
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/identitytoolkit'],
});
const token = await (await auth.getClient()).getAccessToken();

// 2) Disable Anonymous provider via Identity Toolkit Admin
const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${sa.project_id}/config?updateMask=signIn.anonymous.enabled`;
const res = await fetch(url, {
  method: 'PATCH',
  headers: { 'Authorization': `Bearer ${token.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ signIn: { anonymous: { enabled: false } } })
});
console.log('PATCH status:', res.status);
const body = await res.json();
console.log('signIn config:', JSON.stringify(body.signIn, null, 2));

// 3) Delete existing anonymous users
const list = await admin.auth().listUsers(1000);
const anon = list.users.filter(u => !u.email && u.providerData.length === 0);
console.log(`\nAnonymous users to delete: ${anon.length}`);
for (const u of anon) {
  await admin.auth().deleteUser(u.uid);
  console.log(`  deleted ${u.uid}`);
}
console.log('Done.');
