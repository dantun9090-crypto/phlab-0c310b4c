import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['Desktop Chrome'], reducedMotion: 'reduce', colorScheme: 'no-preference' });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE-ERR:', String(e).slice(0,300)));
await page.addInitScript(() => {
  try {
    localStorage.setItem('phlabs-theme-mode', 'light');
    localStorage.setItem('php_research_confirmed', JSON.stringify({ ts: Date.now() }));
    localStorage.setItem('php_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false }));
    localStorage.setItem('phlabs_newsletter_seen', String(Date.now()));
    localStorage.setItem('phl_banner_dismissed', String(Date.now()));
    const style = document.createElement('style');
    style.textContent = '#phl-live-sales-popup { display: none !important; }';
    document.documentElement.appendChild(style);
  } catch {}
});
await page.goto('http://127.0.0.1:8081/products', { waitUntil: 'domcontentloaded' });
for (let i=0;i<6;i++) {
  await page.waitForTimeout(2500);
  console.log((i+1)*2.5+'s:', await page.evaluate(() => ({
    boot: !!document.querySelector('.phl-boot'),
    main: !!document.querySelector('main'),
    text: document.body.innerText.slice(0,40).replace(/\n/g,' '),
  })).then(JSON.stringify));
}
await b.close();
