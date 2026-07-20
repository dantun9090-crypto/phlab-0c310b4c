import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1800 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem('phlabs-theme-mode', 'light');
    localStorage.setItem('php_research_confirmed', '1');
    localStorage.setItem('php_cookie_consent', '1');
    localStorage.setItem('phlabs_newsletter_seen', String(Date.now()));
  } catch {}
  const st = document.createElement('style');
  st.textContent = '#phl-live-sales-popup { display: none !important; }';
  document.documentElement.appendChild(st);
});
await page.goto('http://127.0.0.1:8081/compound', { waitUntil: 'domcontentloaded' });
const btn = page.getByRole('button', { name: /switch to night mode/i }).first();
try {
  await btn.waitFor({ state: 'visible', timeout: 20000 });
  const box = await btn.boundingBox();
  const label = await btn.getAttribute('aria-label');
  console.log('TOGGLE VISIBLE:', label, JSON.stringify(box));
} catch {
  console.log('TOGGLE NOT FOUND');
  console.log('labels:', await page.evaluate(() => [...document.querySelectorAll('button')].map(e=>e.getAttribute('aria-label')).filter(Boolean).slice(0,10)));
}
await b.close();
