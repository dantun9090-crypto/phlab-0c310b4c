import { updateDocAdmin, addDocAdmin, getDocAdmin } from './src/lib/server/firestore-admin';
const ex = await getDocAdmin('site_config','checkoutPause');
console.log('before', ex);
