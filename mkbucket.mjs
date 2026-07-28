import { GoogleAuth } from 'google-auth-library';
const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
const auth = new GoogleAuth({ credentials: cred, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const c = await auth.getClient();
const project = cred.project_id;
const name = 'phlabs-firestore-backups-euw2';
const r = await c.request({ url: `https://storage.googleapis.com/storage/v1/b?project=${project}`, method: 'POST', data: { name, location: 'EUROPE-WEST2', storageClass: 'NEARLINE', iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } }, validateStatus: () => true });
console.log(r.status, JSON.stringify(r.data).slice(0,400));
