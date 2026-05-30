import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });

const list = await admin.auth().listUsers(1000);
console.log(`Total users: ${list.users.length}`);
console.log('---');
list.users
  .sort((a,b) => (b.metadata.creationTime||'').localeCompare(a.metadata.creationTime||''))
  .slice(0, 30)
  .forEach(u => {
    const providers = u.providerData.map(p => p.providerId).join(',') || 'none';
    console.log(`${u.email||'(no email)'}  | uid=${u.uid.slice(0,8)} | providers=${providers} | verified=${u.emailVerified} | disabled=${u.disabled} | created=${u.metadata.creationTime} | lastSignIn=${u.metadata.lastSignInTime||'never'}`);
  });
