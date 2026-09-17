/**
 * scripts_task59_e2e.mjs — Verify the user's three new demands:
 *   (a) "carousel ka image mat banaya karo, uske liye prompt de diya karo"
 *       → ZERO canvas carousel_slide_*.png in the ZIP; every image-post day
 *         folder ships carousel_prompt.txt (copy → Gemini/ChatGPT/Midjourney)
 *   (b) "before and after image same hai to ek hi do"
 *       → day folders contain exactly ONE live screenshot:
 *         screenshot_tool_live.jpg (no before/after/raw duplicate trio)
 *   (c) "duniya me koi bhi website ka url ho, wo kaam kare"
 *       → analyzer completes on Toolverse AND on two very different sites
 *         (ilovepdf.com = real tool platform, example.com = minimal page)
 *
 * Real network, real ZIP download + unzip audit.
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
const URL2 = 'https://www.ilovepdf.com/';
const URL3 = 'https://example.com/';

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
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false }).then(() => console.log(`  📸 ${name}`));
const bodyText = () => page.locator('body').innerText().catch(() => '');

/** Full analyze → strategy for one URL on a fresh page. Returns {tools, text}. */
async function analyzeUrl(url, tag, { expectTools = 0 } = {}) {
  const p = await context.newPage();
  p.on('pageerror', (e) => consoleErrors.push(`pageerror(${tag}): ${e.message}`));
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForSelector('input[placeholder*="yourwebsite.com"]', { timeout: 30000 });
  await p.fill('input[placeholder*="yourwebsite.com"]', url);
  await p.click('text=/Auto-Pilot Launch/');
  const t0 = Date.now();
  let lastLabel = '';
  const probe = setInterval(async () => {
    try {
      const label = await p.locator('div.font-mono').first().innerText().catch(() => '');
      const t = Math.round((Date.now() - t0) / 1000);
      if (label && label !== lastLabel) { console.log(`  ⏱ [${tag}] ${t}s — ${label}`); lastLabel = label; }
      else if (t % 60 === 0 && t > 0) console.log(`  ⏱ [${tag}] ${t}s — still working…`);
    } catch { /* modal may have closed */ }
  }, 15000);
  let text = '';
  try {
    await p.waitForSelector('text=/Accept AI Plan & Generate All/i', { timeout: 420000 });
    text = await p.locator('body').innerText();
    const m = text.match(/(\d+)\s*Tools?\s*Discovered/i) || text.match(/(\d+)\s*Total Discovered/i);
    const tools = m ? parseInt(m[1]) : 0;
    console.log(`  ℹ [${tag}] discovered tools: ${tools}`);
    if (expectTools > 0) check(`[${tag}] discovers ≥ ${expectTools} tools`, tools >= expectTools, `got ${tools}`);
    await p.screenshot({ path: path.join(SHOTS, `t59_strategy_${tag}.png`) }).then(() => console.log(`  📸 t59_strategy_${tag}.png`));
    return { tools, text, page: p };
  } finally {
    clearInterval(probe);
  }
}

try {
  console.log('\n=== STEP 1 — Toolverse analyze (regression: JSON-LD studios) ===');
  const r1 = await analyzeUrl(URL1, 'toolverse', { expectTools: 25 });
  const stratTxt = r1.text;
  const legacyHits = ['Barcode', 'Morse', 'Cron Builder', 'Hash Generator', 'Favicon', 'Ascii Art']
    .filter((n) => stratTxt.includes(n));
  check('zero legacy-only tools', legacyHits.length === 0, legacyHits.join(', '));

  console.log('\n=== STEP 2 — generate + dashboard ===');
  await r1.page.click('text=/Accept AI Plan & Generate All/i');
  await r1.page.waitForSelector('text=/Export Full Campaign/i', { timeout: 300000 });
  await r1.page.waitForTimeout(1200);
  check('dashboard ready', true);
  await shot('t59_dashboard.png');

  console.log('\n=== STEP 3 — ZIP deep audit (carousel prompt + single screenshot) ===');
  const [download] = await Promise.all([
    r1.page.waitForEvent('download', { timeout: 180000 }),
    r1.page.click('text=/Export Full Campaign/i'),
  ]);
  const zipPath = path.join(SHOTS, 't59_campaign.zip');
  await download.saveAs(zipPath);
  check('ZIP downloaded', fs.existsSync(zipPath), 'missing file');

  const unz = path.join(SHOTS, 't59_unzip');
  fs.rmSync(unz, { recursive: true, force: true });
  const { execSync } = await import('node:child_process');
  execSync(`unzip -q -o ${zipPath} -d ${unz}`);

  // collect day folders
  const dayDirs = fs.readdirSync(unz).filter((d) => /^Day-\d+/.test(d) && fs.statSync(path.join(unz, d)).isDirectory());
  check('day folders exist', dayDirs.length >= 5, `got ${dayDirs.length}`);

  let carouselPngs = 0;
  let foldersWithCarouselPrompt = 0;
  let foldersWithVideoScript = 0;
  let badShotFolders = [];
  let smallShotFolders = [];
  for (const d of dayDirs) {
    const dir = path.join(unz, d);
    const walk = (base, acc = []) => {
      for (const f of fs.readdirSync(base)) {
        const fp = path.join(base, f);
        if (fs.statSync(fp).isDirectory()) walk(fp, acc);
        else acc.push(fp);
      }
      return acc;
    };
    const files = walk(dir).map((fp) => path.relative(dir, fp));
    carouselPngs += files.filter((f) => /carousel_slide_.*\.(png|jpg)/i.test(f)).length;
    const hasCarouselPrompt = files.includes('carousel_prompt.txt');
    const hasVideo = files.some((f) => /video_script\.md/i.test(f));
    if (hasCarouselPrompt) {
      foldersWithCarouselPrompt++;
      const cpt = fs.readFileSync(path.join(dir, 'carousel_prompt.txt'), 'utf8');
      if (!/CAROUSEL DECK/.test(cpt) || !/1080/.test(cpt)) badShotFolders.push(`${d}:carousel_prompt-content`);
    }
    if (hasVideo) foldersWithVideoScript++;
    // (b) exactly ONE screenshot file, named screenshot_tool_live.jpg
    const shots = files.filter((f) => /^screenshot_/i.test(path.basename(f)));
    if (shots.length !== 1 || shots[0] !== 'screenshot_tool_live.jpg') {
      badShotFolders.push(`${d}:[${shots.join(',')}]`);
    } else {
      const st = fs.statSync(path.join(dir, 'screenshot_tool_live.jpg'));
      if (st.size < 1500) smallShotFolders.push(`${d}:${st.size}B`);
    }
  }
  check('ZERO canvas carousel images in ZIP', carouselPngs === 0, `found ${carouselPngs}`);
  check('carousel_prompt.txt in every image-post folder', foldersWithCarouselPrompt + foldersWithVideoScript === dayDirs.length && foldersWithCarouselPrompt > 0,
    `prompts=${foldersWithCarouselPrompt} video=${foldersWithVideoScript} of ${dayDirs.length}`);
  check('carousel prompts contain deck spec', badShotFolders.filter((s) => s.includes('carousel_prompt-content')).length === 0, badShotFolders.join(' | '));
  check('every day folder = exactly ONE screenshot_tool_live.jpg', badShotFolders.filter((s) => !s.includes('carousel_prompt-content')).length === 0,
    badShotFolders.filter((s) => !s.includes('carousel_prompt-content')).join(' | '));
  check('screenshots are real captures (not placeholders)', smallShotFolders.length === 0, smallShotFolders.join(' | '));

  const readmeTxt = fs.readFileSync(path.join(unz, 'all_website_screenshots', 'README_SCREENSHOTS.txt'), 'utf8');
  check('README documents single live screenshot', readmeTxt.includes('screenshot_tool_live.jpg'), 'missing');
  check('README documents carousel workflow', /carousel_prompt\.txt/.test(readmeTxt), 'missing');

  console.log('\n=== STEP 4 — UNIVERSAL URL #2: ilovepdf.com (different platform) ===');
  const r2 = await analyzeUrl(URL2, 'ilovepdf', { expectTools: 5 });

  console.log('\n=== STEP 5 — UNIVERSAL URL #3: example.com (minimal page) ===');
  const r3 = await analyzeUrl(URL3, 'example', { expectTools: 0 });
  check('[example] analysis completes without crash', /Accept AI Plan/i.test(r3.text), 'strategy page missing');
  await r1.page.close().catch(() => {});
  await r2.page.close().catch(() => {});
  await r3.page.close().catch(() => {});

  console.log('\n=== STEP 6 — hygiene ===');
  const local404 = failedRequests.filter((f) => /localhost/.test(f) && /404/.test(f));
  const pageErrors = consoleErrors.filter((e) => !/net::|favicon|mShots|403|429|Failed to load resource|blocked by CORS policy|rate.?limit|431/i.test(e));
  check('zero on-domain 404s', local404.length === 0, local404.join(' | '));
  check('zero real page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  fail++;
  console.log(`  ❌ EXCEPTION: ${e.message}`);
  await shot('t59_EXCEPTION.png').catch(() => {});
} finally {
  await browser.close();
  server.kill();
  console.log(`\n========================================`);
  console.log(`TASK59 E2E: ${pass} passed, ${fail} failed`);
  console.log(`========================================`);
  process.exit(fail ? 1 : 0);
}
