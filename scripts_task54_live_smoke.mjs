/**
 * scripts_task54_live_smoke.mjs — tiny live check against PRODUCTION GH Pages:
 * fresh visitor must see OMNIPILOT OFF (the deployed fix), nothing else.
 * Full flow already proven 12/12 locally on the identical bundle.
 */
import fs from 'node:fs';
const SHOTS = '/home/z/my-project/omnipost_e2e_shots';
fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = await import('playwright');

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${x}`); } };

try {
  await page.goto('https://imranah10.github.io/OmniPost-AI/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 45000 });
  const aria = await page.locator('[role="switch"][aria-checked]').first().getAttribute('aria-checked');
  check('LIVE: fresh visitor sees OMNIPILOT OFF (no auto-generation)', aria === 'false', `aria-checked=${aria}`);
  const txt = await page.locator('body').innerText();
  check('LIVE: OFF description visible ("You stay in control…")', /You stay in control/i.test(txt), 'desc missing');
  await page.screenshot({ path: `${SHOTS}/t54_live_home_pilot_off.png` });
  console.log('  📸 t54_live_home_pilot_off.png');
} catch (e) {
  fail++; console.log(`  ❌ EXCEPTION: ${e.message}`);
} finally {
  await browser.close();
  console.log(`LIVE SMOKE: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
