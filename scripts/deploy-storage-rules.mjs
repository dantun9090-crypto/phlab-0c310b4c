import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!rawServiceAccount) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  process.exit(1);
}

const serviceAccount = JSON.parse(rawServiceAccount);
const projectId = serviceAccount.project_id;
const bucketIds = [
  `${projectId}.firebasestorage.app`,
  `${projectId}.appspot.com`,
];

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const token = await admin.app().options.credential.getAccessToken();
const accessToken = token.access_token;
const rules = readFileSync('storage.rules', 'utf8');

const rulesetResponse = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: {
        files: [{ name: 'storage.rules', content: rules }],
      },
    }),
  },
);

const ruleset = await rulesetResponse.json();
if (!rulesetResponse.ok) {
  console.error('Storage ruleset create failed:', ruleset);
  process.exit(1);
}

console.log('Storage ruleset created:', ruleset.name);

for (const bucketId of bucketIds) {
  const releaseId = `firebase.storage/${bucketId}`;
  const releaseName = `projects/${projectId}/releases/${releaseId}`;
  const response = await fetch(
    `https://firebaserules.googleapis.com/v1/${releaseName}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        release: {
          name: releaseName,
          rulesetName: ruleset.name,
        },
      }),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    console.error(`Storage release update failed for ${bucketId}:`, data);
    process.exit(1);
  }
  console.log('Storage release updated:', data.name);
}

console.log('✅ Storage rules deployed to all configured buckets');