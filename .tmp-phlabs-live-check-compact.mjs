import { chromium, devices } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: '/bin/chromium' });
const context = await browser.newContext({ ...devices['Pixel 7'], ignoreHTTPSErrors: true });
const page = await context.newPage();
const logs=[];
page.on('console', msg => { const t=msg.text(); if (/ERROR|Error|Invariant|ROOT|HYDRATION|CSR|Please|Router|violates|uncaught|caught/i.test(t)) logs.push({type: msg.type(), text: t.slice(0,500)}); });
page.on('pageerror', err => logs.push({type:'pageerror', text: (err.stack || err.message).slice(0,1000)}));
page.on('requestfailed', req => { if (/assets|60z6|_build|client/i.test(req.url())) logs.push({type:'requestfailed', text: `${req.url()} ${req.failure()?.errorText}`.slice(0,500)}); });
const resp = await page.goto('https://phlabs.co.uk/', {waitUntil:'domcontentloaded', timeout:30000});
await page.waitForTimeout(6000);
const data = await page.evaluate(() => ({
  title: document.title,
  bodyText: document.body?.innerText?.().slice(0,500),
  rootReady: window.__PHL_REACT_READY__,
  build: document.querySelector('meta[name="x-build-id"]')?.content,
  storage: Object.fromEntries(Object.keys(sessionStorage).filter(k=>k.startsWith('__phl')||k.startsWith('phl')).map(k=>[k, sessionStorage.getItem(k)])),
  scripts: Array.from(document.scripts).map(s=>s.src || '[inline]').slice(-10),
})).catch(e=>({evalError:String(e)}));
console.log(JSON.stringify({status:resp?.status(), url:page.url(), data, logs}, null, 2));
await browser.close();
