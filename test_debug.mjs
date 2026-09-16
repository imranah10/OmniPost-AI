// Debug E2E with step-by-step state dumps
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173';
const TEST_URL = process.argv[3] || 'https://toolverse-official.vercel.app';

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 140)));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('  [console]', m.type(), m.text().slice(0, 140));
});

await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1200);

const urlInput = page.locator('input[type="url"], input[placeholder*="http"], input[type="text"]').first();
await urlInput.fill(TEST_URL);
await page.locator('button:has-text("Auto-Pilot")').first().click();
console.log('>> analysis started');

// watch for strategy view
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(3000);
  const body = await page.locator('body').innerText();
  if (/Accept.*Plan|Generate All/i.test(body)) {
    console.log(`>> strategy view reached after ~${(i + 1) * 3}s`);
    console.log('--- strategy excerpt ---');
    console.log(body.slice(0, 700).replace(/\n+/g, ' | '));
    break;
  }
  if (i === 59) {
    console.log('!! strategy NOT reached. body:');
    console.log(body.slice(0, 900));
  }
}

const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Generate All")').first();
if (await acceptBtn.count()) {
  await acceptBtn.click();
  console.log('>> generation clicked');
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    if (/Export Full Campaign|Download/i.test(body) && /Day 1/i.test(body)) {
      console.log(`>> campaign view reached after ~${(i + 1) * 3}s`);
      // count images loaded
      const imgs = await page.evaluate(() =>
        Array.from(document.images).map((im) => ({ ok: im.complete && im.naturalWidth > 5, src: im.src.slice(0, 80) }))
      );
      console.log(`>> images on page: ${imgs.length}, loaded OK: ${imgs.filter((x) => x.ok).length}`);
      imgs.slice(0, 6).forEach((x) => console.log('   ', x.ok ? 'OK ' : 'BAD', x.src));
      break;
    }
    if (i === 79) console.log('!! campaign NOT reached. body:', (await page.locator('body').innerText()).slice(0, 500));
  }
}

await browser.close();
console.log('done');
