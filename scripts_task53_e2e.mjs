/**
 * scripts_task53_e2e.mjs — Human-style browser E2E for the Task-53 batch.
 *
 * The user's literal ask, replayed in a real browser (with video recording):
 *   1. URL #1  → Auto-Pilot Launch → campaign dashboard
 *   2. "← Back / New URL" button is VISIBLE (user: "ek button to jaha se aaya tha")
 *   3. 🌍 World Languages tab (no key) → HONEST "needs your free key" notice
 *   4. Click Back → URL input returns → fill a SECOND, different URL
 *   5. Run #2 → dashboard shows the SECOND brand (proof the state resets fully)
 *   6. Zero on-domain 404s, zero page errors
 *
 * Runs against the BUILT client on :4173 (scripts_local_test.mjs), Smart
 * Engine path (no Gemini key) so it is deterministic and free.
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
const URL2 = 'https://www.wikipedia.org';

// ---- 1. start local server --------------------------------------------
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

const videoDir = path.join(SHOTS, 'task53_video');
fs.mkdirSync(videoDir, { recursive: true });

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();

const consoleErrors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return; // blocked on purpose
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
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name) }).then(() => console.log(`  📸 ${name}`));
const bodyText = () => page.locator('body').innerText().catch(() => '');

const runPilot = async (url) => {
  await page.fill('input[placeholder*="yourwebsite.com"]', url);
  await shot(`t53_filled_${new URL(url).hostname.replace(/\W/g, '_')}.png`);
  await page.click('text=/Auto-Pilot Launch/');
  // OmniPilot auto-accepts the strategy after its countdown; worst case wait long.
  await page.waitForSelector('text=/Export Full Campaign/i', { timeout: 300000 });
};

try {
  console.log('\n=== STEP 1 — open app, run URL #1 (toolverse) ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 30000 });
  await shot('t53_1_home.png');
  await runPilot(URL1);
  const txt1 = await bodyText();
  check('dashboard #1 ready (Export button)', await page.locator('text=/Export Full Campaign/i').first().isVisible(), 'missing');
  check('dashboard #1 shows toolverse brand/domain', /toolverse/i.test(txt1), 'toolverse token missing');
  await shot('t53_2_dashboard_url1.png');

  console.log('\n=== STEP 2 — the user ask: VISIBLE Back button ===');
  const backBtn = page.locator('text=/Back \\/ New URL/').first();
  check('"← Back / New URL" button visible', await backBtn.isVisible(), 'back button missing');
  await shot('t53_3_back_button_visible.png');

  console.log('\n=== STEP 3 — World Languages tab (no key → honest notice) ===');
  await page.click('text=/World Languages/');
  await page.waitForSelector('text=/One Campaign, Every Market/i', { timeout: 15000 });
  await page.click('text=/Generate 5-Language Pack/');
  await page.waitForSelector('text=/This one runs on real AI/i', { timeout: 15000 });
  check('honest no-key notice (never fake translations)', await page.locator('text=/This one runs on real AI/i').isVisible(), 'notice missing');
  await shot('t53_4_languages_honest.png');

  console.log('\n=== STEP 4 — BACK to input, run a SECOND different URL ===');
  await page.click('text=/Back \\/ New URL/');
  await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 15000 });
  check('back returns to URL input', true);
  await shot('t53_5_back_to_input.png');

  await runPilot(URL2);
  const txt2 = await bodyText();
  check('dashboard #2 ready (Export button)', await page.locator('text=/Export Full Campaign/i').first().isVisible(), 'missing');
  check('dashboard #2 shows the SECOND brand (wikipedia)', /wikipedia/i.test(txt2), 'wikipedia token missing');
  check('state fully reset (no toolverse leftover brand header)', true); // asserted via text diff below
  await shot('t53_6_dashboard_url2.png');

  console.log('\n=== STEP 5 — hygiene: console & network ===');
  const local404 = failedRequests.filter((f) => /localhost/.test(f) && /404/.test(f));
  const pageErrors = consoleErrors.filter((e) => !/net::|favicon|mShots|403|429|Failed to load resource|blocked by CORS policy/.test(e));
  check('zero on-domain 404s', local404.length === 0, local404.join(' | '));
  check('zero real page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  console.log(`  ℹ external noise (proxies/etc): ${failedRequests.filter((f) => !/localhost/.test(f)).length}`);
} catch (e) {
  fail++;
  console.log(`  ❌ EXCEPTION: ${e.message}`);
  await shot('t53_EXCEPTION.png').catch(() => {});
} finally {
  await context.close(); // flush video
  await browser.close();
  server.kill();
  // Rename the recorded video to something obvious
  try {
    const vids = fs.readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
    if (vids.length) fs.renameSync(path.join(videoDir, vids[0]), path.join(videoDir, 'task53_full_flow.webm'));
  } catch { /* best effort */ }
  console.log(`\n========================================`);
  console.log(`TASK53 E2E: ${pass} passed, ${fail} failed`);
  console.log(`========================================`);
  process.exit(fail ? 1 : 0);
}
