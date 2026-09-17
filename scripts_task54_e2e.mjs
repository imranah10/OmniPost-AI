/**
 * scripts_task54_e2e.mjs — Verify the user's exact complaint is FIXED:
 *   "maine click bhi nhi kiya apne aap generating hona start kyu ho gya??
 *    (Generating Posts & Media...)"
 *
 * Root cause (fixed in this task): OMNIPILOT default ON → strategy page
 * auto-fired handleQuickAccept() after a 6s countdown without any click.
 *
 * FIX under test: OMNIPILOT is now STRICTLY OPT-IN (default OFF):
 *   1. Fresh browser (empty localStorage) → toggle must read OFF
 *   2. Run URL #1 → strategy page → WAIT 9s (> old 6s countdown)
 *      → generation must NOT have started by itself
 *      → "Accept AI Plan & Generate All" still waiting for the user
 *   3. User clicks the button manually → dashboard appears (normal flow intact)
 *   4. Back → toggle OMNIPILOT ON (explicit opt-in) → URL #2 → strategy
 *      → auto-generation DOES start within ~12s (opt-in behavior preserved)
 *   5. Hygiene: zero page errors, zero on-domain 404s
 *
 * Runs against the BUILT client on :4173 (scripts_local_test.mjs), Smart
 * Engine path (no Gemini key) — deterministic and free.
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

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
const runAnalysis = async (url) => {
  await page.fill('input[placeholder*="yourwebsite.com"]', url);
  await page.click('text=/Auto-Pilot Launch/');
  await page.waitForSelector('text=/Accept AI Plan & Generate All/i', { timeout: 300000 });
};

try {
  console.log('\n=== STEP 1 — fresh visitor: OMNIPILOT must default OFF ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 30000 });
  const stored = await page.evaluate(() => localStorage.getItem('omnipost_omnipilot'));
  check('no pilot preference stored for a brand-new visitor', stored === null, `got: ${stored}`);
  const aria = await page.locator('[role="switch"][aria-checked]').first().getAttribute('aria-checked');
  check('OMNIPILOT toggle renders OFF by default', aria === 'false', `aria-checked=${aria}`);
  await shot('t54_1_home_pilot_off.png');

  console.log('\n=== STEP 2 — THE FIX: strategy page must NOT auto-generate (wait 9s > old 6s countdown) ===');
  await runAnalysis(URL1);
  console.log('  strategy page reached — holding 9 seconds to catch any silent auto-start…');
  await page.waitForTimeout(9000);
  const genStarted = (await bodyText()).includes('Generating Posts & Media');
  check('generation did NOT start by itself (no "Generating Posts & Media...")', !genStarted, 'AUTO-START STILL HAPPENS');
  const ctaVisible = await page.locator('text=/Accept AI Plan & Generate All/i').first().isVisible();
  check('"Accept AI Plan & Generate All" still waiting for the user click', ctaVisible, 'CTA missing');
  await shot('t54_2_strategy_no_autostart.png');

  console.log('\n=== STEP 3 — user clicks the button → normal flow completes ===');
  await page.click('text=/Accept AI Plan & Generate All/i');
  await page.waitForSelector('text=/Export Full Campaign/i', { timeout: 300000 });
  check('manual click generates the campaign (dashboard ready)', true);
  check('dashboard shows toolverse brand', /toolverse/i.test(await bodyText()), 'toolverse token missing');
  await shot('t54_3_dashboard_after_manual_click.png');

  console.log('\n=== STEP 4 — explicit opt-in: OMNIPILOT ON → auto-launch still works ===');
  await page.click('text=/Back \\/ New URL/');
  await page.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 15000 });
  await page.click('[role="switch"]');
  await page.waitForTimeout(300);
  const ariaOn = await page.locator('[role="switch"][aria-checked]').first().getAttribute('aria-checked');
  check('user can explicitly switch OMNIPILOT ON', ariaOn === 'true', `aria-checked=${ariaOn}`);
  const onDesc = await bodyText();
  check('ON description says plan launches itself', /launches itself/i.test(onDesc), 'desc missing');
  await runAnalysis(URL2);
  // countdown is 6s — auto-accept must fire within ~12s of strategy render
  await page.waitForSelector('text=/Export Full Campaign/i', { timeout: 240000 });
  check('opted-in autopilot auto-generated the campaign (dashboard reached)', true);
  check('dashboard #2 shows the SECOND brand (wikipedia)', /wikipedia/i.test(await bodyText()), 'wikipedia token missing');
  await shot('t54_4_dashboard_optin_autopilot.png');

  console.log('\n=== STEP 5 — hygiene ===');
  const local404 = failedRequests.filter((f) => /localhost/.test(f) && /404/.test(f));
  const pageErrors = consoleErrors.filter((e) => !/net::|favicon|mShots|403|429|Failed to load resource|blocked by CORS policy/.test(e));
  check('zero on-domain 404s', local404.length === 0, local404.join(' | '));
  check('zero real page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  console.log(`  ℹ external noise (proxies/etc): ${failedRequests.filter((f) => !/localhost/.test(f)).length}`);
} catch (e) {
  fail++;
  console.log(`  ❌ EXCEPTION: ${e.message}`);
  await shot('t54_EXCEPTION.png').catch(() => {});
} finally {
  await browser.close();
  server.kill();
  console.log(`\n========================================`);
  console.log(`TASK54 E2E: ${pass} passed, ${fail} failed`);
  console.log(`========================================`);
  process.exit(fail ? 1 : 0);
}
