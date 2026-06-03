const base = 'https://epos.api.prod-gcp.fena.co/open';
const headers = {
  'terminal-id': process.env.FENA_TERMINAL_ID,
  'terminal-secret': process.env.FENA_TERMINAL_SECRET,
  'content-type': 'application/json',
};
for (const path of [
  '/payments/single/list',
  '/payments/single/list?limit=5',
  '/payments/list',
  '/payments/single',
  '/payments/single?limit=5',
  '/payments',
]) {
  const r = await fetch(base + path, { headers });
  const t = await r.text();
  console.log(path, r.status, t.slice(0, 300));
  console.log('---');
}
