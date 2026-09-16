// E2E: standalone engine flow — URL → strategy → campaign → (ZIP files present)
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173';
const TEST_URL = process.argv[3] || 'https://toolverse-official.vercel.app';

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 120)));

let pass = 0, fail = 0;
const t = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
};

// 1. Load app
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);
t('app loads', (await page.title()).includes('OmniPost'));

// 2. Enter URL + start
const urlInput = page.locator('input[type="url"], input[placeholder*="http"], input[type="text"]').first();
await urlInput.fill(TEST_URL);
const startBtn = page.locator('button:has-text("Auto-Pilot")').first();
await startBtn.click();
console.log('  … analysis started (crawl + screenshots can take 30-90s)');

// 3. Wait for strategy view (max 180s)
try {
  await page.waitForSelector('text=/Accept|Generate All|recommended/i', { timeout: 180000 });
  t('strategy view reached', true);
} catch {
  t('strategy view reached', false, await page.locator('body').innerText().then((x) => x.slice(0, 200)));
}

// 4. Accept plan → campaign
const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Generate All")').first();
if (await acceptBtn.count()) {
  await acceptBtn.click();
  console.log('  … campaign generating (posts + AI images, can take 60-120s)');
}
try {
  await page.waitForSelector('text=/Export Full Campaign|Day 1/i', { timeout: 240000 });
  t('campaign view reached', true);
} catch {
  t('campaign view reached', false);
}

// 5. ZIP export triggers download
try {
  const dlPromise = page.waitForEvent('download', { timeout: 180000 });
  const zipBtn = page.locator('button:has-text("Export"), button:has-text("ZIP")').first();
  await zipBtn.click();
  const dl = await dlPromise;
  const path = await dl.path();
  const fs = await import('fs');
  const size = fs.statSync(path).size;
  t('ZIP downloads', size > 100000, `size=${size}`);
} catch (e) {
  t('ZIP downloads', false, String(e).slice(0, 120));
}

t('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${pass}/${pass + fail} PASS`);
await browser.close();
process.exit(fail ? 1 : 0);
