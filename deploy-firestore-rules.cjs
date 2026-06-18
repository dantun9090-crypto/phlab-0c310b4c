const admin = require('firebase-admin');
const fs = require('fs');
const https = require('https');

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });

async function getAccessToken() {
  const token = await admin.app().options.credential.getAccessToken();
  return token.access_token;
}

async function deployRules(rulesPath, releaseName, rulesetName) {
  const source = fs.readFileSync(rulesPath, 'utf8');
  const projectId = sa.project_id;
  const accessToken = await getAccessToken();

  // 1. Create ruleset
  const createRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: { files: [{ name: rulesPath, content: source }] } }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok) throw new Error('createRuleset: ' + JSON.stringify(createJson));
  const rulesetId = createJson.name;
  console.log(`✓ Created ruleset for ${rulesPath}: ${rulesetId}`);

  // 2. Update release to point to new ruleset
  const updateRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/${releaseName}?updateMask=ruleset_name`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `projects/${projectId}/releases/${releaseName}`, ruleset_name: rulesetId }),
  });
  const updateJson = await updateRes.json();
  if (!updateRes.ok) throw new Error('updateRelease: ' + JSON.stringify(updateJson));
  console.log(`✓ Released ${releaseName} → ${rulesetId}`);
}

(async () => {
  await deployRules('firestore.rules', 'cloud.firestore', 'firestore');
})().catch(e => { console.error(e); process.exit(1); });
