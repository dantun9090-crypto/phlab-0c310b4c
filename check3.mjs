import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem('phlabs-theme-mode','light'); localStorage.setItem('php_research_confirmed','1'); localStorage.setItem('php_cookie_consent','1'); localStorage.setItem('phlabs_newsletter_seen', String(Date.now())); } catch {} });
await page.goto('http://127.0.0.1:8081/compound', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
const info = await page.evaluate(() => ({
  path: location.pathname,
  labels: [...document.querySelectorAll('button')].map(e => e.getAttribute('aria-label')).filter(Boolean).slice(0,15),
  h1: [...document.querySelectorAll('h1')].map(h => h.innerText.slice(0,80)),
  mode: document.documentElement.getAttribute('data-theme-mode'),
}));
console.log(JSON.stringify(info, null, 1));
await b.close();
