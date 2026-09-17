/**
 * scripts_task63_e2e.mjs — Task 63 end-to-end.
 * User gap: "master prompt se image/video bana li — ab platform ke according
 * KYA CONTENT likhna hai, wo diya hi nahi. Sirf upload kar du?"
 *
 * Fix under test: MASTER_ASSET_POSTING_KIT.md (ZIP root) + "🚀 Master Asset
 * Kit" tab in the Master Studio modal + START_HERE / CAMPAIGN_OVERVIEW map.
 *
 * PHASE 1: iloveimg.com → full flow → modal kit tab → ZIP → unzip audit
 * PHASE 2: tinypng.com regression → full flow → ZIP contains the kit
 * Run: node scripts_task63_e2e.mjs   (T63_PHASE=2 for phase 2)
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
const PHASE = process.env.T63_PHASE || '1';

const server = spawn('node', [path.join(__dirname, 'scripts_local_test.mjs')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});
server.stdout.on('data', (d) => process.stdout.write(`[srv] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[srv:err] ${d}`));
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });

const consoleErrors = [];
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

async function analyzeUrl(url, tag) {
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
  await p.waitForSelector('text=/Accept AI Plan & Generate All/i', { timeout: 420000 });
  clearInterval(probe);
  console.log(`  ℹ [${tag}] strategy ready in ${Math.round((Date.now() - t0) / 1000)}s`);
  return p;
}

/** Open the Master Studio modal, switch to the Master Asset Kit tab, assert content. */
async function auditModalKit(p, tag) {
  await p.click('text=/Master AI Prompts Studio/i');
  await p.waitForSelector('text=/Master Brand Blueprint/i', { timeout: 20000 });
  check(`[${tag}] Master Studio modal opens`, true);

  const tabBtn = p.locator('button', { hasText: /Master Asset Kit/i }).first();
  const tabVisible = await tabBtn.isVisible().catch(() => false);
  check(`[${tag}] "🚀 Master Asset Kit" tab exists`, tabVisible);
  await tabBtn.click();
  await p.waitForSelector('text=/MASTER_ASSET_POSTING_KIT\\.md Preview/i', { timeout: 15000 });
  check(`[${tag}] kit preview section renders`, true);

  const previewLen = await p.evaluate(() => {
    const pres = [...document.querySelectorAll('pre')];
    const pre = pres.find((el) => /MASTER ASSET POSTING KIT/.test(el.textContent || ''));
    return pre ? pre.textContent.length : 0;
  });
  check(`[${tag}] kit preview is substantial (>3000 chars)`, previewLen > 3000, `len=${previewLen}`);

  const previewText = await p.evaluate(() => {
    const pres = [...document.querySelectorAll('pre')];
    const pre = pres.find((el) => /MASTER ASSET POSTING KIT/.test(el.textContent || ''));
    return pre ? pre.textContent : '';
  });
  check(`[${tag}] preview answers "do NOT just upload"`, /Do NOT just upload/i.test(previewText));
  check(`[${tag}] preview has image+video captions`, /CAPTION — MASTER IMAGE/.test(previewText) && /CAPTION — MASTER VIDEO/.test(previewText));

  await p.screenshot({ path: path.join(SHOTS, `t63_${tag}_masterkit_tab.png`), fullPage: false });
  console.log(`  📸 t63_${tag}_masterkit_tab.png`);

  // Close modal (Close Studio button)
  await p.click('text=/Close Studio/i').catch(() => {});
  await p.waitForTimeout(500);
}

/** Export the ZIP and audit the unzipped MASTER_ASSET_POSTING_KIT.md. */
async function auditZipKit(p, tag) {
  const zipPath = path.join(SHOTS, `t63_${tag}.zip`);
  const [download] = await Promise.all([
    p.waitForEvent('download', { timeout: 300000 }),
    p.click('text=/Export Full Campaign/i'),
  ]);
  await download.saveAs(zipPath);
  check(`[${tag}] ZIP downloaded`, fs.existsSync(zipPath), 'missing file');

  const unz = path.join(SHOTS, `t63_${tag}_unzip`);
  execSync(`unzip -q -o ${zipPath} -d ${unz}`);

  const kitPath = path.join(unz, 'MASTER_ASSET_POSTING_KIT.md');
  check(`[${tag}] ZIP has MASTER_ASSET_POSTING_KIT.md at root`, fs.existsSync(kitPath));
  if (!fs.existsSync(kitPath)) return;

  const kit = fs.readFileSync(kitPath, 'utf8');
  check(`[${tag}] kit file is substantial (>2500 bytes)`, Buffer.byteLength(kit) > 2500, `bytes=${Buffer.byteLength(kit)}`);
  check(`[${tag}] kit: "do NOT just upload" answer present`, /Do NOT just upload/i.test(kit));
  check(`[${tag}] kit: both master assets explained`, /MASTER IMAGE/.test(kit) && /MASTER VIDEO/.test(kit));

  const imgBlocks = (kit.match(/CAPTION — MASTER IMAGE/g) || []).length;
  const vidBlocks = (kit.match(/CAPTION — MASTER VIDEO/g) || []).length;
  check(`[${tag}] kit: image caption blocks ≥ 2`, imgBlocks >= 2, `got ${imgBlocks}`);
  check(`[${tag}] kit: video caption blocks ≥ 2`, vidBlocks >= 2, `got ${vidBlocks}`);
  const fences = (kit.match(/```/g) || []).length;
  check(`[${tag}] kit: copy-paste fences present (≥8)`, fences >= 8, `fences=${fences}`);
  check(`[${tag}] kit: launch-week plan`, /SUGGESTED LAUNCH WEEK/i.test(kit));
  check(`[${tag}] kit: repost alternates`, /REPOST WITHOUT REPEATING/i.test(kit));

  const startHere = fs.readFileSync(path.join(unz, 'START_HERE.txt'), 'utf8');
  check(`[${tag}] START_HERE points to the kit`, startHere.includes('MASTER_ASSET_POSTING_KIT.md'));

  const overview = fs.readFileSync(path.join(unz, 'CAMPAIGN_OVERVIEW.md'), 'utf8');
  check(`[${tag}] CAMPAIGN_OVERVIEW lists the kit`, overview.includes('MASTER_ASSET_POSTING_KIT.md'));

  const guide = fs.readFileSync(path.join(unz, 'PLATFORM_POSTING_GUIDE.md'), 'utf8');
  check(`[${tag}] PLATFORM_POSTING_GUIDE still intact`, guide.length > 3000, `len=${guide.length}`);
}

try {
  if (PHASE === '1') {
    console.log('\n=== PHASE 1 — iloveimg.com full flow ===');
    const p = await analyzeUrl('https://www.iloveimg.com/', 'iloveimg');
    check('strategy page rendered', /Accept AI Plan/i.test(await p.locator('body').innerText()));

    await p.click('text=/Accept AI Plan & Generate All/i');
    await p.waitForSelector('text=/Export Full Campaign/i', { timeout: 300000 });
    await p.waitForTimeout(1500);
    check('dashboard ready', true);

    console.log('\n=== PHASE 1b — Master Studio modal kit tab ===');
    await auditModalKit(p, 'iloveimg');

    console.log('\n=== PHASE 1c — ZIP audit ===');
    await auditZipKit(p, 'iloveimg');
    await p.close().catch(() => {});
  }

  if (PHASE === '2') {
    console.log('\n=== PHASE 2 — tinypng.com regression ===');
    const p = await analyzeUrl('https://tinypng.com/', 'tinypng');
    check('strategy page rendered', /Accept AI Plan/i.test(await p.locator('body').innerText()));

    await p.click('text=/Accept AI Plan & Generate All/i');
    await p.waitForSelector('text=/Export Full Campaign/i', { timeout: 300000 });
    await p.waitForTimeout(1500);
    check('dashboard ready', true);

    await auditModalKit(p, 'tinypng');
    await auditZipKit(p, 'tinypng');
    await p.close().catch(() => {});
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
  console.log(`\nTASK63 E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
