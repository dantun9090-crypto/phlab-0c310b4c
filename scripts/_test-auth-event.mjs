// Test: write auth_event via REST (unauthenticated, like a failed login would)
const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
const project = 'prohealthpeptides-a0808';
const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/auth_events?key=${apiKey}`;
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      type: { stringValue: 'login_failure' },
      email: { stringValue: 'test-rule-check@example.com' },
      code: { stringValue: 'auth/invalid-credential' },
      message: { stringValue: 'Rule sanity test from sandbox' },
      source: { stringValue: '/sandbox' },
      userAgent: { stringValue: 'sandbox-test' },
      createdAt: { timestampValue: new Date().toISOString() },
    }
  })
});
console.log('Status:', res.status);
const body = await res.json();
console.log(JSON.stringify(body, null, 2).slice(0, 600));
