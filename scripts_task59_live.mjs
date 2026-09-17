/**
 * scripts_task59_live.mjs — live verification of the GH Pages deployment:
 *  1. commit status (github actions) completed|success
 *  2. live bundle contains the new strings, none of the old ones
 *  3. real browser loads the live app (no crash)
 */
import fs from 'node:fs';

const PAT = process.env.GH_PAT || ''; // never hardcode tokens — push protection blocks them
const REPO = 'imranah10/OmniPost-AI';
const SHA = '1fcec53';
const LIVE = 'https://imranah10.github.io/OmniPost-AI/';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

// 1. wait for pages build
let deployed = false;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${SHA}/status`, {
      headers: { Authorization: `token ${PAT}`, 'User-Agent': 'task59-live-check' },
    });
    const j = await res.json();
    console.log(`  ⏳ attempt ${i + 1}: ${j.state} (${(j.statuses || []).map((s) => `${s.context}=${s.state}`).join(', ') || 'no statuses'})`);
    if (j.state === 'success') { deployed = true; break; }
    if (j.state === 'failure' || j.state === 'error') break;
  } catch (e) { console.log(`  ⚠ ${e.message}`); }
  await new Promise((r) => setTimeout(r, 15000));
}
check('GH Pages build completed|success', deployed);

// 2. bundle string audit
const indexHtml = await (await fetch(LIVE)).text();
const m = indexHtml.match(/assets\/index-[^"]+\.js/);
check('bundle entry found', Boolean(m), indexHtml.slice(0, 120));
if (m) {
  const js = await (await fetch(new URL(m[0], LIVE).toString())).text();
  check('carousel_prompt.txt in live bundle', js.includes('carousel_prompt.txt'));
  check('buildCarouselPrompt shipped', js.includes('CAROUSEL DECK'));
  check('screenshot_tool_live.jpg in live bundle', js.includes('screenshot_tool_live.jpg'));
  check('canvas carousel renderer GONE', !js.includes('renderCarouselSlide') && !js.includes('renderFullCarousel'));
  check('old raw_screenshot refs reduced', !js.includes("dayFolder.file(\"raw_screenshot.jpg\""));
  check('reader fallback (r.jina.ai) present', js.includes('r.jina.ai'));
  check('@graph JSON-LD support present', js.includes('@graph'));
  fs.writeFileSync('/home/z/my-project/omnipost_e2e_shots/t59_live_bundle_marker.txt', `bundle: ${m[0]}\n`);
}

// 3. browser smoke on LIVE site
const { chromium } = await import('playwright');
const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 30000 });
check('live app loads with URL input', true);
check('zero live page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await page.screenshot({ path: '/home/z/my-project/omnipost_e2e_shots/t59_live_home.png' });
await browser.close();

console.log(`\nTASK59 LIVE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
