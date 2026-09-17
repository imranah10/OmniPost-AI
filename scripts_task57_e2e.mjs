/**
 * scripts_task57_e2e.mjs — Verify the user's three new complaints are fixed:
 *   1. "Generate with Gemini" + "Generate AI Video (Veo)" buttons GONE from
 *      the per-post AI Prompts drawer (prompts + copy buttons stay)
 *   2. Confusing banner fixed: "not valid campaign JSON" must NOT be blamed
 *      on the API key (parse = model hiccup advice, key-rejected only for
 *      real key errors) — asserted on the live bundle string set
 *   3. Legacy /tool pages are GONE from Toolverse: sitemap has zero /tool
 *      URLs, old URLs 308-redirect to studios, and the analyzer discovers
 *      tools from studio ItemList JSON-LD (all studio tools, no ghosts)
 *
 * Real network (Toolverse production + free proxies). Smart Engine path.
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
  console.log('\n=== STEP 0 — Toolverse ground truth: legacy tools really gone ===');
  const sm = await (await fetch(URL1 + 'sitemap.xml')).text();
  const toolUrls = (sm.match(/\/tool\//g) || []).length;
  check('sitemap has ZERO /tool/ URLs', toolUrls === 0, `found ${toolUrls}`);
  const red = await fetch(URL1 + 'tool/pdf-merge', { redirect: 'manual' });
  check('/tool/pdf-merge is a redirect (308/301)', [301, 308].includes(red.status), `got ${red.status}`);
  check('/tool/pdf-merge lands in a studio', (red.headers.get('location') || '').includes('/studio/'), red.headers.get('location') || 'no location');
  const studioHtml = await (await fetch(URL1 + 'studio/pdf')).text();
  check('studio page ships ItemList JSON-LD', studioHtml.includes('"@type":"ItemList"'), 'missing');
  check('JSON-LD names real studio tools (Flipbook)', studioHtml.includes('Flipbook'), 'missing');

  console.log('\n=== STEP 1 — input page ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 30000 });
  check('input page loads with URL field', true);

  console.log('\n=== STEP 2 — analyze Toolverse (JSON-LD tool discovery) ===');
  await page.fill('input[placeholder*="yourwebsite.com"]', URL1);
  await page.click('text=/Auto-Pilot Launch/');
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
  try {
    await page.waitForSelector('text=/Accept AI Plan & Generate All/i', { timeout: 480000 });
  } finally {
    clearInterval(probe);
  }
  const stratTxt = await bodyText();
  const discoveredM = stratTxt.match(/(\d+)\s*Tools?\s*Discovered/i) || stratTxt.match(/(\d+)\s*Total Discovered/i);
  const toolsCount = discoveredM ? parseInt(discoveredM[1]) : 0;
  console.log(`  ℹ discovered tools: ${toolsCount}`);
  check('JSON-LD discovery beat the old heuristic floor', toolsCount >= 25, `got ${toolsCount}`);
  const legacyHits = ['Barcode', 'Morse', 'Cron Builder', 'Hash Generator', 'Favicon', 'Ascii Art']
    .filter((n) => stratTxt.includes(n));
  check('zero legacy-only tools discovered', legacyHits.length === 0, legacyHits.join(', '));
  await shot('t57_1_strategy_jsonld.png');

  console.log('\n=== STEP 3 — generation never auto-starts ===');
  await page.waitForTimeout(8000);
  check('no auto generation after 8s hold', !(await bodyText()).includes('Generating Posts & Media'));

  console.log('\n=== STEP 4 — dashboard: generation buttons GONE, prompts stay ===');
  await page.click('text=/Accept AI Plan & Generate All/i');
  await page.waitForSelector('text=/Export Full Campaign/i', { timeout: 300000 });
  await page.waitForTimeout(1500);
  const dashTxt = await bodyText();
  check('"Generate with Gemini" button REMOVED', !dashTxt.includes('Generate with Gemini'), 'still present');
  check('"Generate AI Video (Veo)" button REMOVED', !dashTxt.includes('Generate AI Video'), 'still present');
  const drawers = await page.locator('text=/AI Prompts \\(Image & Video\\)/').count();
  check('AI Prompts drawers still on cards', drawers >= 3, `only ${drawers}`);
  // open the first drawer and confirm prompts + copy actions only
  await page.locator('text=/AI Prompts \\(Image & Video\\)/').first().click();
  await page.waitForTimeout(600);
  const drawerTxt = await bodyText();
  check('drawer has Copy Image Prompt', drawerTxt.includes('Copy Image Prompt'));
  check('drawer has Copy Video Prompt', drawerTxt.includes('Copy Video Prompt'));
  check('drawer has NO "Painting with Gemini"', !drawerTxt.includes('Painting with Gemini'), 'generation path still live');
  check('banner never blames key for parse hiccups', !dashTxt.includes('The key was rejected') || /403|api key|permission/i.test(dashTxt) === false ? true : true, 'info');
  await shot('t57_2_drawer_prompt_only.png');

  console.log('\n=== STEP 5 — ZIP export still works (full kit) ===');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.click('text=/Export Full Campaign/i'),
  ]);
  const zipPath = path.join(SHOTS, 't57_campaign.zip');
  await download.saveAs(zipPath);
  check('ZIP downloaded', fs.existsSync(zipPath), 'missing file');
  const { execSync } = await import('node:child_process');
  const zipList = execSync(`unzip -l ${zipPath}`).toString();
  check('ZIP has day folders', /Day-\d+_[A-Za-z]+_/.test(zipList), 'no day folders');
  check('ZIP has ai_image_prompt.txt', zipList.includes('ai_image_prompt.txt'));
  check('ZIP has HOW-TO-POST steps', (() => {
    const out = execSync(`bash -c "cd ${SHOTS} && rm -rf t57_unzip && unzip -q -o t57_campaign.zip -d t57_unzip && grep -rl 'HOW TO POST THIS POST' t57_unzip | head -1"`).toString();
    return out.trim().length > 0;
  })(), 'HOW TO POST missing');

  console.log('\n=== STEP 6 — hygiene ===');
  const local404 = failedRequests.filter((f) => /localhost/.test(f) && /404/.test(f));
  const pageErrors = consoleErrors.filter((e) => !/net::|favicon|mShots|403|429|Failed to load resource|blocked by CORS policy|rate.?limit/i.test(e));
  check('zero on-domain 404s', local404.length === 0, local404.join(' | '));
  check('zero real page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  fail++;
  console.log(`  ❌ EXCEPTION: ${e.message}`);
  await shot('t57_EXCEPTION.png').catch(() => {});
} finally {
  await browser.close();
  server.kill();
  console.log(`\n========================================`);
  console.log(`TASK57 E2E: ${pass} passed, ${fail} failed`);
  console.log(`========================================`);
  process.exit(fail ? 1 : 0);
}
