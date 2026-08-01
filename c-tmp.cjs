const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
(async()=>{const s=await admin.firestore().collection('coupons').get();s.forEach(d=>console.log(d.id,JSON.stringify(d.data())));})();
