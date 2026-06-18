const admin = require('firebase-admin');
const fs = require('fs');

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });

(async () => {
  const source = fs.readFileSync('firestore.rules', 'utf8');
  const rules = admin.securityRules();
  const ruleset = await rules.releaseFirestoreRulesetFromSource(source);
  console.log('✓ Released Firestore rules. Ruleset:', ruleset.name);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
