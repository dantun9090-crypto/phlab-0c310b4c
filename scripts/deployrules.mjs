import admin from 'firebase-admin';
import fs from 'fs';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const rules = fs.readFileSync('firestore.rules', 'utf8');
const projectId = sa.project_id;
const token = await admin.app().options.credential.getAccessToken();
const create = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
  method:'POST', headers:{'Authorization':`Bearer ${token.access_token}`,'Content-Type':'application/json'},
  body: JSON.stringify({ source:{ files:[{ name:'firestore.rules', content: rules }] } })
}).then(r=>r.json());
console.log('ruleset:', create.name);
const rel = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`, {
  method:'PATCH', headers:{'Authorization':`Bearer ${token.access_token}`,'Content-Type':'application/json'},
  body: JSON.stringify({ release: { name: `projects/${projectId}/releases/cloud.firestore`, rulesetName: create.name } })
}).then(r=>r.json());
console.log('release:', rel.name || rel);
process.exit(0);
