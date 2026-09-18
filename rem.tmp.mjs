import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildVerifyEmailReminderEmail } from './src/templates/verifyEmailReminderEmail.ts';
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const auth = getAuth(), db = getFirestore();
const DRY = process.env.DRY === '1';
let tok, users = [];
do { const r = await auth.listUsers(1000, tok); users.push(...r.users.filter(u => !u.emailVerified && u.email)); tok = r.pageToken; } while (tok);
let sent = 0, skipped = 0;
for (const u of users) {
  const email = u.email.toLowerCase();
  let count = 0;
  for (const field of ['customer.email', 'userEmail']) {
    const s = await db.collection('orders').where(field, '==', email).limit(50).get();
    count = Math.max(count, s.size);
  }
  const ownS = await db.collection('orders').where('userId', '==', u.uid).limit(50).get();
  const total = Math.max(count, ownS.size);
  if (total === 0) { skipped++; continue; }
  const id = `verify-reminder:${u.uid}`;
  const ref = db.collection('mail').doc(id);
  if ((await ref.get()).exists) { skipped++; continue; }
  if (DRY) { sent++; continue; }
  const link = await auth.generateEmailVerificationLink(u.email, { url: 'https://phlabs.co.uk/account' });
  const firstName = (u.displayName || '').split(' ')[0] || 'there';
  await ref.set({
    to: u.email,
    message: {
      subject: 'Confirm your email address | PH Labs',
      html: buildVerifyEmailReminderEmail({ firstName, verifyLink: link, orderCount: total }),
      text: `Confirm your PH Labs account email address: ${link}`,
    },
    createdAt: new Date(),
    source: 'account:verify-reminder',
  });
  sent++;
}
console.log(DRY ? 'DRY' : 'SENT', sent, 'skipped(no orders/already sent)', skipped, 'unverified total', users.length);
