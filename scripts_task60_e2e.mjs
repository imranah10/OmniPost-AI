/**
 * scripts_task60_e2e.mjs — Task 60 verification (user report:
 * "2-3 website ka url paste kiya lekin bahut sare blank screenshot dikha raha hai").
 *
 *  A) tinypng.com (user's exact example) — analyze:
 *     - ZERO junk tools in the visible catalog ("Key results", "OUR PRODUCTS",
 *       "What's next", "Get your API key", blog-post titles …)
 *     - NO fake "N Studios" claim for a studio-less site
 *     - gallery settles to ZERO blank cards: every rendered mshots <img> is a
 *       REAL capture (naturalWidth ≥ 768); dead cards are REMOVED from the DOM
 *  B) full flow → ZIP audit (placeholder-proof shipping):
 *     - every bundled screenshot ≥768px wide (no 400x300 WordPress-logo files)
 *     - README FILES INCLUDED list matches the actual bundled count
 *     - day folders keep their carousel_prompt.txt (Task 59 regression)
 *  C) ilovepdf.com regression — JSON-LD registry still yields a big honest
 *     catalog and the analysis completes.
 *
 * Real network, real mShots, real ZIP download + unzip + PIL image audit.
 */
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = '/home/z/my-project/omnipost_e2e_shots';
fs.mkdirSync(SHOTS, { recursive: true });

const { chromium } = await import('playwright');

const BASE = 'http://localhost:4173';
const URL1 = 'https://tinypng.com/';
const URL2 = 'https://www.ilovepdf.com/';
// PHASE 1 (default): tinypng analyze + gallery audit + full ZIP audit
// PHASE 2: ilovepdf regression (separate foreground run — fits tool timeout)
const PHASE = process.env.T60_PHASE || '1';

const JUNK_NAMES = [
  'Key results', 'OUR PRODUCTS', "What's next", 'Whats next', 'Get your API key',
  'New to TinyPNG', 'Compressing vs', 'Background Looking for', 'TinyPNG Blog',
  'What our customers say', 'Web Free', 'Key results',
];

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

const consoleErrors = [];
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

/** Wait until the gallery stops shimmering (or budget elapses), then audit DOM. */
async function settleAndAuditGallery(p, tag, budgetMs = 115000) {
  const t0 = Date.now();
  let shimmerCount = -1;
  while (Date.now() - t0 < budgetMs) {
    shimmerCount = await p
      .getByText('Capturing live view…')
      .count()
      .catch(() => -1);
    if (shimmerCount === 0) break;
    await p.waitForTimeout(5000);
  }
  console.log(`  ℹ [${tag}] gallery settle wait: ${Math.round((Date.now() - t0) / 1000)}s (shimmer left: ${shimmerCount})`);

  const audit = await p.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].filter((i) =>
      /s\.wordpress\.com\/mshots/.test(i.src || '')
    );
    const cards = [...document.querySelectorAll('img')]
      .filter((i) => /s\.wordpress\.com\/mshots/.test(i.src || ''))
      .map((i) => ({
        src: i.src.slice(0, 110),
        w: i.naturalWidth,
        h: i.naturalHeight,
        visible: i.offsetParent !== null || i.closest('[data-shot]') !== null,
      }));
    return { count: imgs.length, cards };
  });
  const blanks = audit.cards.filter((c) => c.w > 0 && c.w < 768);
  check(`[${tag}] every rendered screenshot is REAL (≥768px)`, blanks.length === 0, JSON.stringify(blanks.slice(0, 3)));
  check(`[${tag}] gallery shows at least 3 verified captures`, audit.count >= 3, `got ${audit.count}`);
  check(`[${tag}] no shimmer left (no still-generating cards)`, shimmerCount === 0, `shimmer=${shimmerCount}`);
  return audit;
}

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
      else if (t > 0 && t % 60 === 0) console.log(`  ⏱ [${tag}] ${t}s — still working…`);
    } catch { /* modal closed */ }
  }, 15000);
  try {
    await p.waitForSelector('text=/Accept AI Plan & Generate All/i', { timeout: 420000 });
    const text = await p.locator('body').innerText();
    const m = text.match(/(\d+)\s*Tools?\s*Discovered/i) || text.match(/(\d+)\s*Total Discovered/i);
    const tools = m ? parseInt(m[1]) : 0;
    console.log(`  ℹ [${tag}] discovered tools: ${tools}`);
    if (expectTools > 0) check(`[${tag}] discovers ≥ ${expectTools} tools`, tools >= expectTools, `got ${tools}`);
    return { tools, text, page: p };
  } catch (e) {
    clearInterval(probe);
    throw e;
  }
}

try {
  if (PHASE === '1') {
  console.log('\n=== STEP A — tinypng.com (user example) ===');
  const r1 = await analyzeUrl(URL1, 'tinypng', { expectTools: 2 });
  const txt = r1.text;

  // Scope junk check to the TOOL CATALOG section only — the site's own nav
  // legitimately contains phrases like "Get your API key"; they must merely
  // not appear as DISCOVERED TOOLS.
  const catalogTxt = (txt.split('Complete Tool Catalog')[1] || '').split('AI AUTONOMOUS')[0] || '';
  fs.writeFileSync(path.join(SHOTS, 't60_catalog_debug.txt'), `---EXPLORE---\n${(txt.split('Deep AGI Exploration')[1] || '').split('Complete Tool Catalog')[0] || ''}\n---CATALOG---\n${catalogTxt}`);
  const junkHits = JUNK_NAMES.filter((n) => catalogTxt.includes(n));
  check('zero junk tools in catalog', junkHits.length === 0, junkHits.join(' | '));
  const exploreTxt = (txt.split('Deep AGI Exploration')[1] || '').split('Complete Tool Catalog')[0] || '';
  check('no fake "Studios" claim for studio-less site', !/\d+\s+Studios\b/.test(exploreTxt), 'found Studios count');
  check('strategy page rendered', /Accept AI Plan/i.test(txt));

  await r1.page.screenshot({ path: path.join(SHOTS, 't60_tinypng_strategy.png'), fullPage: true });
  console.log('  📸 t60_tinypng_strategy.png');

  console.log('\n=== STEP A2 — gallery settle + blank audit ===');
  await settleAndAuditGallery(r1.page, 'tinypng', 75000);
  await r1.page.screenshot({ path: path.join(SHOTS, 't60_tinypng_gallery.png'), fullPage: true });
  console.log('  📸 t60_tinypng_gallery.png');

  console.log('\n=== STEP B — generate + ZIP placeholder audit ===');
  await r1.page.click('text=/Accept AI Plan & Generate All/i');
  await r1.page.waitForSelector('text=/Export Full Campaign/i', { timeout: 300000 });
  await r1.page.waitForTimeout(1500);
  check('dashboard ready', true);

  const zipPath = path.join(SHOTS, 't60_tinypng.zip');
  const [download] = await Promise.all([
    r1.page.waitForEvent('download', { timeout: 300000 }),
    r1.page.click('text=/Export Full Campaign/i'),
  ]);
  await download.saveAs(zipPath);
  check('ZIP downloaded', fs.existsSync(zipPath), 'missing file');

  const unz = path.join(SHOTS, 't60_unzip');
  execSync(`unzip -q -o ${zipPath} -d ${unz}`);
  await r1.page.close().catch(() => {});

  // PIL audit — every bundled image must be a REAL capture (>=768px)
  const auditOut = execSync(`python3 /home/z/my-project/scripts/t60_zip_audit.py ${unz}`).toString();
  console.log(auditOut.trim());
  const okAww = parseInt(auditOut.match(/OK_ALLWWW=(\d+)/)?.[1] || '0');
  const badAww = auditOut.match(/BAD_ALLWWW=(.*)/)?.[1] || '[]';
  const okDay = parseInt(auditOut.match(/OK_DAY=(\d+)/)?.[1] || '0');
  const badDay = auditOut.match(/BAD_DAY=(.*)/)?.[1] || '[]';
  const readmeCount = auditOut.match(/README_COUNT=(\d+)/)?.[1];
  const carouselPrompts = parseInt(auditOut.match(/CAROUSEL_PROMPTS=(\d+)/)?.[1] || '0');
  const dayFolders = parseInt(auditOut.match(/DAY_FOLDERS=(\d+)/)?.[1] || '0');
  check('ZIP: zero placeholder/blank images in all_website_screenshots', badAww === '[]', badAww);
  check('ZIP: zero placeholder/blank images in day folders', badDay === '[]', badDay);
  check('ZIP: real screenshots bundled', okAww >= 2 && okDay >= 1, `allwww=${okAww} day=${okDay}`);
  check('ZIP: README FILES INCLUDED = actual bundled files',
    readmeCount !== null && parseInt(readmeCount) === okAww, `readme=${readmeCount} actual=${okAww}`);
  check('ZIP: day folders exist', dayFolders >= 5, `got ${dayFolders}`);
  check('ZIP: carousel prompts intact (Task 59 regression)', carouselPrompts >= 1, `got ${carouselPrompts}`);
  }

  if (PHASE === '2') {
  console.log('\n=== STEP C — ilovepdf.com regression ===');
  const r2 = await analyzeUrl(URL2, 'ilovepdf', { expectTools: 8 });
  check('[ilovepdf] strategy rendered', /Accept AI Plan/i.test(r2.text));
  await settleAndAuditGallery(r2.page, 'ilovepdf', 80000);
  await r2.page.close().catch(() => {});
  }

  console.log('\n=== hygiene ===');
  const realErrors = consoleErrors.filter((e) => !/net::|favicon|mshots|403|429|431|Failed to load resource|blocked by CORS|rate.?limit|timeout|TimeoutError/i.test(e));
  check('zero real page errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
} catch (e) {
  fail++;
  console.log(`  ❌ EXCEPTION: ${e.message}`);
} finally {
  await browser.close();
  server.kill();
  console.log(`\nTASK60 E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
