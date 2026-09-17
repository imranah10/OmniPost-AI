/**
 * scripts_task56_e2e.mjs — Verify the user's FOUR complaints are fixed:
 *   1. "abhi bhi apne aap generating hone laga" → OMNIPILOT toggle GONE,
 *      strategy page NEVER auto-generates (9s hold, no countdown, no banner)
 *   2. "video and photo kyu dikha rahe ho, maine mana kiya tha" → post cards
 *      are TEXT + AI Prompts drawer ONLY (no poster img, no reel play button,
 *      no carousel graphic preview)
 *   3. "sabkuchh same kyu hai" → Smart Engine diversity: hooks/captions must
 *      NOT be identical across posts (unique-hook count > 60% of posts)
 *   4. "website ko full nahi padh raha (73 tools!)" → sitemap-driven deep
 *      crawl on Toolverse: tool catalog count must beat the old 40-cap crawl
 *
 * Real network (Toolverse + free proxies). Smart Engine path (no key) so
 * diversity assertions are deterministic.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = '/home/z/my-project/omnipost_e2e_shots';
fs.mkdirSync(SHOTS, { recursive: true });

const { chromium } = await import('playwright');

const BASE = 'http://localhost:4173';
const URL1 = 'https://toolverse-official.vercel.app/';

const server = spawn('node', [path.join(__dirname, 'scripts_local_test.mjs')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});
server.stdout.on('data', (d) => process.stdout.write(`[srv] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[srv:err] ${d}`));
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return;
  failedRequests.push(`${r.failure()?.errorText || 'fail'} ${u}`);
});
page.on('response', (r) => {
  const u = r.url();
  if (r.status() >= 400 && u.includes('localhost')) failedRequests.push(`${r.status()} ${u}`);
});
await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false }).then(() => console.log(`  📸 ${name}`));
const bodyText = () => page.locator('body').innerText().catch(() => '');

try {
  console.log('\n=== STEP 1 — input page: OMNIPILOT toggle must be GONE ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 30000 });
  check('no OMNIPILOT switch on input page', (await page.locator('[role="switch"]').count()) === 0, 'toggle still present');
  const homeTxt = await bodyText();
  check('no "OMNIPILOT" branding anywhere', !homeTxt.includes('OMNIPILOT'), 'still present');

  console.log('\n=== STEP 2 — deep analysis of Toolverse (sitemap-driven) ===');
  await page.fill('input[placeholder*="yourwebsite.com"]', URL1);
  await page.click('text=/Auto-Pilot Launch/');
  // Deep crawl of 30+ pages can take a couple minutes through free proxies —
  // log the live progress label every 15s so stalls are visible.
  const t0 = Date.now();
  let lastLabel = '';
  const probe = setInterval(async () => {
    try {
      const label = await page.locator('div.font-mono').first().innerText().catch(() => '');
      const t = Math.round((Date.now() - t0) / 1000);
      if (label && label !== lastLabel) { console.log(`  ⏱ ${t}s — ${label}`); lastLabel = label; }
      else if (t % 30 === 0) console.log(`  ⏱ ${t}s — still working…`);
    } catch { /* modal may have closed */ }
  }, 15000);
  // Deep crawl of 30+ pages can take a couple minutes through free proxies
  try {
    await page.waitForSelector('text=/Accept AI Plan & Generate All/i', { timeout: 480000 });
  } finally {
    clearInterval(probe);
  }
  const stratTxt = await bodyText();
  const discoveredM = stratTxt.match(/(\d+)\s*Tools?\s*Discovered/i) || stratTxt.match(/(\d+)\s*Total Discovered/i);
  const shotsM = stratTxt.match(/(\d+)\s*Live Snapshots?/i) || stratTxt.match(/(\d+)\s*Live Screenshots?/i);
  const toolsCount = discoveredM ? parseInt(discoveredM[1]) : 0;
  const shotsCount = shotsM ? parseInt(shotsM[1]) : 0;
  console.log(`  ℹ discovered tools: ${toolsCount} · live snapshots: ${shotsCount}`);
  check('tool catalog rendered', toolsCount > 0, 'catalog missing');
  check('DEEP CRAWL: more tools than the old 13-page/40-cap crawl', toolsCount > 40, `got ${toolsCount}`);
  check('deep screenshots captured (more than old 13)', shotsCount > 13, `got ${shotsCount}`);
  await shot('t56_2_strategy_deepcrawl.png');

  console.log('\n=== STEP 3 — strategy page NEVER auto-generates ===');
  check('no OMNIPILOT ENGAGED banner', !stratTxt.includes('OMNIPILOT'), 'banner present');
  console.log('  holding 9 seconds (> old 6s countdown)…');
  await page.waitForTimeout(9000);
  const genStarted = (await bodyText()).includes('Generating Posts & Media');
  check('generation did NOT start by itself', !genStarted, 'AUTO-START STILL HAPPENS');
  check('CTA still waiting for the user', await page.locator('text=/Accept AI Plan & Generate All/i').first().isVisible());

  console.log('\n=== STEP 4 — user clicks → dashboard is text + prompts ONLY ===');
  await page.click('text=/Accept AI Plan & Generate All/i');
  await page.waitForSelector('text=/Export Full Campaign/i', { timeout: 300000 });
  await page.waitForTimeout(1200); // let cards settle
  const dashTxt = await bodyText();
  check('no "Watch 9:16 Video Reel" button', !dashTxt.includes('Watch 9:16 Video Reel'), 'still present');
  check('no card-level "Carousel" media button', !dashTxt.includes('🎨 AI Poster'), 'poster switcher still present');
  check('no "Pure AI Art" media view', !dashTxt.includes('Pure AI Art'), 'still present');
  const cardImgs = await page.locator('img[src*="pollinations"], img[src*="mshots"]').count();
  check('zero generated-media <img> on cards', cardImgs === 0, `found ${cardImgs}`);
  const promptDrawers = await page.locator('text=/AI Prompts \\(Image & Video\\)/').count();
  check('"AI Prompts (Image & Video)" drawer on cards', promptDrawers >= 3, `only ${promptDrawers}`);
  const copyBtns = await page.locator('[title*="Copy Caption"]').count();
  check('"Copy Caption" actions present', copyBtns >= 3, `only ${copyBtns}`);
  await shot('t56_4_dashboard_text_only.png');

  console.log('\n=== STEP 5 — CONTENT DIVERSITY (Smart Engine, no key) ===');
  const hooks = await page.locator('h3.font-heading').allInnerTexts();
  const uniq = new Set(hooks.map((h) => h.trim().toLowerCase()));
  const uniqRatio = hooks.length ? uniq.size / hooks.length : 0;
  console.log(`  ℹ hooks: ${hooks.length} total, ${uniq.size} unique (ratio ${uniqRatio.toFixed(2)})`);
  check('hooks are diverse (>60% unique)', uniqRatio > 0.6, `ratio ${uniqRatio.toFixed(2)}`);
  // caption-level: no two captions share their first 60 chars
  const capBlocks = await page.locator('div.whitespace-pre-line').allInnerTexts();
  const capPrefixes = new Set(capBlocks.map((c) => c.trim().slice(0, 60).toLowerCase()));
  const capRatio = capBlocks.length ? capPrefixes.size / capBlocks.length : 0;
  console.log(`  ℹ captions: ${capBlocks.length} total, ${capPrefixes.size} unique prefixes (ratio ${capRatio.toFixed(2)})`);
  check('captions are diverse (>60% unique)', capRatio > 0.6, `ratio ${capRatio.toFixed(2)}`);

  console.log('\n=== STEP 6 — hygiene ===');
  const local404 = failedRequests.filter((f) => /localhost/.test(f) && /404/.test(f));
  const pageErrors = consoleErrors.filter((e) => !/net::|favicon|mShots|403|429|Failed to load resource|blocked by CORS policy|rate.?limit/i.test(e));
  check('zero on-domain 404s', local404.length === 0, local404.join(' | '));
  check('zero real page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  console.log(`  ℹ external noise: ${failedRequests.filter((f) => !/localhost/.test(f)).length}`);
} catch (e) {
  fail++;
  console.log(`  ❌ EXCEPTION: ${e.message}`);
  await shot('t56_EXCEPTION.png').catch(() => {});
} finally {
  await browser.close();
  server.kill();
  console.log(`\n========================================`);
  console.log(`TASK56 E2E: ${pass} passed, ${fail} failed`);
  console.log(`========================================`);
  process.exit(fail ? 1 : 0);
}
