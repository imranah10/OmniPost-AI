/**
 * scripts_task59_universal.mjs — Part 2 of Task 59 verification:
 * analyzer completes on TWO very different non-Toolverse sites:
 *   ilovepdf.com  — real multi-tool platform (root-path tools, sitemap)
 *   example.com   — minimal single page (fallback path must not crash)
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
const URL2 = 'https://www.ilovepdf.com/';
const URL3 = 'https://example.com/';

const server = spawn('node', [path.join(__dirname, 'scripts_local_test.mjs')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

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
    } catch { /* modal closed */ }
  }, 12000);
  try {
    await p.waitForSelector('text=/Accept AI Plan & Generate All/i', { timeout: 420000 });
    const text = await p.locator('body').innerText();
    const m = text.match(/(\d+)\s*Tools?\s*Discovered/i) || text.match(/(\d+)\s*Total Discovered/i);
    const tools = m ? parseInt(m[1]) : 0;
    console.log(`  ℹ [${tag}] discovered tools: ${tools}`);
    if (expectTools > 0) check(`[${tag}] discovers ≥ ${expectTools} tools`, tools >= expectTools, `got ${tools}`);
    await p.screenshot({ path: path.join(SHOTS, `t59_strategy_${tag}.png`) });
    console.log(`  📸 t59_strategy_${tag}.png`);
    return text;
  } finally {
    clearInterval(probe);
    await p.close().catch(() => {});
  }
}

try {
  console.log('\n=== UNIVERSAL #2: ilovepdf.com ===');
  const t2 = await analyzeUrl(URL2, 'ilovepdf', { expectTools: 5 });
  check('[ilovepdf] strategy page rendered', /Accept AI Plan/i.test(t2), 'missing');

  console.log('\n=== UNIVERSAL #3: example.com (minimal) ===');
  const t3 = await analyzeUrl(URL3, 'example', { expectTools: 0 });
  check('[example] analysis completes without crash', /Accept AI Plan/i.test(t3), 'strategy page missing');

  console.log('\n=== hygiene ===');
  const pageErrors = consoleErrors.filter((e) => !/net::|favicon|mShots|403|429|Failed to load resource|blocked by CORS policy|rate.?limit|431/i.test(e));
  check('zero real page errors across both sites', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  fail++;
  console.log(`  ❌ EXCEPTION: ${e.message}`);
} finally {
  await browser.close();
  server.kill();
  console.log(`\nTASK59 UNIVERSAL: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
