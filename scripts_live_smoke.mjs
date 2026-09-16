/** Quick live smoke: load production site, check OMNIPILOT + zero on-domain 404s */
import fs from 'node:fs';

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const failures = [];
const errors = [];
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('imranah10.github.io')) failures.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => { if (r.url().includes('imranah10.github.io')) failures.push(`FAIL ${r.url()}`); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 120)}`));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

await page.goto('https://imranah10.github.io/OmniPost-AI/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 45000 });
await page.screenshot({ path: '/home/z/my-project/omnipost_e2e_shots/live_omnipilot_home.png' });
const text = await page.textContent('body');
await browser.close();

console.log('OMNIPILOT toggle live:', /OMNIPILOT/i.test(text) ? '✅' : '❌');
console.log('ASTRA text gone:', !/ASTRA MODE/i.test(text) ? '✅' : '❌ still present');
console.log('on-domain failures:', failures.length === 0 ? '✅ 0' : `❌ ${JSON.stringify(failures)}`);
console.log('console errors:', errors.length === 0 ? '✅ 0' : `⚠ ${JSON.stringify(errors.slice(0, 3))}`);
process.exit(/OMNIPILOT/i.test(text) && failures.length === 0 ? 0 : 1);
