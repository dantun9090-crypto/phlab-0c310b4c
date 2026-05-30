import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
const projectId = sa.project_id;

// Get access token from service account
admin.initializeApp({ credential: admin.credential.cert(sa) });
const token = await admin.app().options.credential.getAccessToken();
const accessToken = token.access_token;

const rules = readFileSync('firestore.rules', 'utf8');

// 1. Create ruleset
const rsResp = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] } }),
});
const rsData = await rsResp.json();
if (!rsResp.ok) { console.error('Ruleset create failed:', rsData); process.exit(1); }
console.log('Ruleset created:', rsData.name);

// 2. Update release cloud.firestore -> new ruleset
const relResp = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ release: { name: `projects/${projectId}/releases/cloud.firestore`, rulesetName: rsData.name } }),
});
const relData = await relResp.json();
if (!relResp.ok) { console.error('Release update failed:', relData); process.exit(1); }
console.log('✅ Reguły wdrożone:', relData.name);
