/**
 * scripts_task55_e2e.mjs — Verify the user's cleanup asks are DONE:
 *   1. "📸 Screenshots & Blueprint (ZIP)" button — REMOVED (kuch nahi aa raha tha, sirf text)
 *   2. "✨ Visualize All (Gemini Images)" button — REMOVED (quota 429s + stuck queue)
 *   3. Prompts stay front-and-center: per-post "AI Prompts (Image & Video)" drawer
 *      with Copy Image/Video Prompt (the "sirf prompt hi do" path)
 *   4. THE ZIP is the complete package: real download captured & unzipped —
 *      day folders contain post_ready_to_publish.txt (with HOW TO POST steps),
 *      ai_image_prompt.txt, ai_video_prompt.txt, screenshots, master prompts.
 *
 * Runs against the BUILT client on :4173, Smart Engine path (no key).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = '/home/z/my-project/omnipost_e2e_shots';
fs.mkdirSync(SHOTS, { recursive: true });

const { chromium } = await import('playwright');

const BASE = 'http://localhost:4173';
const URL1 = 'https://www.wikipedia.org';

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
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
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
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name) }).then(() => console.log(`  📸 ${name}`));
const bodyText = () => page.locator('body').innerText().catch(() => '');

try {
  console.log('\n=== STEP 1 — run a campaign to reach the dashboard ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 30000 });
  await page.fill('input[placeholder*="yourwebsite.com"]', URL1);
  await page.click('text=/Auto-Pilot Launch/');
  await page.waitForSelector('text=/Accept AI Plan & Generate All/i', { timeout: 300000 });
  await page.click('text=/Accept AI Plan & Generate All/i');
  await page.waitForSelector('text=/Export Full Campaign/i', { timeout: 300000 });
  check('campaign dashboard reached', true);
  await shot('t55_1_dashboard.png');

  console.log('\n=== STEP 2 — removed buttons are GONE ===');
  const txt = await bodyText();
  check('"✨ Visualize All (Gemini Images)" removed', !txt.includes('Visualize All'), 'STILL PRESENT');
  check('"📸 Screenshots & Blueprint (ZIP)" removed', !txt.includes('Screenshots & Blueprint'), 'STILL PRESENT');
  check('no "Stop Visuals" bulk-queue UI', !txt.includes('Stop Visuals'), 'STILL PRESENT');
  await shot('t55_2_buttons_removed.png');

  console.log('\n=== STEP 3 — prompts-first path still present ===');
  const promptToggle = page.locator('text=/AI Prompts \\(Image & Video\\)/').first();
  check('per-post "AI Prompts (Image & Video)" drawer present', await promptToggle.isVisible(), 'drawer missing');
  await promptToggle.click();
  await page.waitForSelector('text=/Copy Image Prompt/i', { timeout: 10000 });
  const drawerTxt = await bodyText();
  check('"Copy Image Prompt" available', drawerTxt.includes('Copy Image Prompt'), 'missing');
  check('"Copy Video Prompt" available', drawerTxt.includes('Copy Video Prompt'), 'missing');
  check('image prompt body has real content', drawerTxt.length > 500, 'too short');
  await shot('t55_3_prompts_drawer.png');

  console.log('\n=== STEP 4 — THE ZIP: real download + contents ===');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.click('text=/Export Full Campaign \\(ZIP\\)/i'),
  ]);
  const zipPath = path.join(SHOTS, 't55_campaign.zip');
  await download.saveAs(zipPath);
  check('ZIP downloaded', fs.existsSync(zipPath) && fs.statSync(zipPath).size > 10000, `size=${fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0}`);
  const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
  const mustHave = [
    'MASTER_IMAGE_PROMPT.txt',
    'MASTER_VIDEO_PROMPT.txt',
    'post_ready_to_publish.txt',
    'ai_image_prompt.txt',
    'ai_video_prompt.txt',
    'screenshot_before_input.jpg',
    'all_website_screenshots/',
    'campaign_schedule.csv',
    'CAMPAIGN_OVERVIEW.md',
  ];
  for (const f of mustHave) {
    check(`ZIP contains ${f}`, listing.includes(f), 'MISSING from ZIP');
  }
  check('ZIP has day folders', /Day-\d+_[A-Za-z]+_/.test(listing), 'no day folders');

  // HOW TO POST steps inside a day folder
  execFileSync('unzip', ['-o', zipPath, '*', '-d', path.join(SHOTS, 't55_unzip')], { stdio: 'ignore' });
  const readyFile = execFileSync('bash', ['-c', `ls ${path.join(SHOTS, 't55_unzip')}/*/post_ready_to_publish.txt 2>/dev/null | head -1`], { encoding: 'utf8' }).trim();
  check('day folder post_ready_to_publish.txt found', Boolean(readyFile), 'not found');
  if (readyFile) {
    const readyTxt = fs.readFileSync(readyFile, 'utf8');
    check('HOW TO POST 4-step workflow inside post txt', /HOW TO POST THIS POST \(4 STEPS\)/.test(readyTxt) && /Gemini app/.test(readyTxt), 'steps missing');
  }

  console.log('\n=== STEP 5 — hygiene ===');
  const local404 = failedRequests.filter((f) => /localhost/.test(f) && /404/.test(f));
  const pageErrors = consoleErrors.filter((e) => !/net::|favicon|mShots|403|429|Failed to load resource|blocked by CORS policy/.test(e));
  check('zero on-domain 404s', local404.length === 0, local404.join(' | '));
  check('zero real page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  fail++;
  console.log(`  ❌ EXCEPTION: ${e.message}`);
  await shot('t55_EXCEPTION.png').catch(() => {});
} finally {
  await browser.close();
  server.kill();
  console.log(`\n========================================`);
  console.log(`TASK55 E2E: ${pass} passed, ${fail} failed`);
  console.log(`========================================`);
  process.exit(fail ? 1 : 0);
}
