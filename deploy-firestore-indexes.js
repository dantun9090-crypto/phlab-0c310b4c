const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
  process.exit(1);
}

const sa = JSON.parse(SERVICE_ACCOUNT_JSON);
const PROJECT_ID = sa.project_id;
const indexesFile = fs.readFileSync('firestore.indexes.json', 'utf8');
const indexesConfig = JSON.parse(indexesFile);

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function deployIndex(index) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/${index.collectionGroup}/indexes`;
  const client = await auth.getClient();
  const payload = {
    fields: index.fields.map(f => ({
      fieldPath: f.fieldPath,
      order: f.order,
    })),
    queryScope: index.queryScope,
  };
  if (index.queryScope === 'COLLECTION_GROUP') {
    // dla collection group queries, może być inny endpoint
  }
  
  try {
    const res = await client.request({
      url,
      method: 'POST',
      data: payload,
    });
    console.log(`✅ ${index.collectionGroup}: ${index.fields.map(f => f.fieldPath).join(',')} -> ${res.data.name || 'OK'}`);
  } catch (err) {
    if (err.response && err.response.status === 409) {
      console.log(`⚠️  ${index.collectionGroup}: already exists (409)`);
    } else if (err.response && err.response.status === 400) {
      console.log(`❌ ${index.collectionGroup}: ${err.response.data?.error?.message || err.message}`);
    } else {
      console.log(`❌ ${index.collectionGroup}: ${err.message}`);
    }
  }
}

async function main() {
  console.log(`Deploying indexes to project: ${PROJECT_ID}`);
  for (const idx of indexesConfig.indexes) {
    await deployIndex(idx);
  }
  console.log('Done');
}

main().catch(e => { console.error(e); process.exit(1); });
