/**
 * Task 69 E2E — image prompts must STATE the aspect ratio explicitly.
 * User rule: "image prompt open krta hu to usme ratio to bataya hi nhi hai"
 * Verifies, for Instagram / LinkedIn / Twitter/X posts:
 *   1. visible 📐 ratio chip on the image-prompt card (ratio · px size)
 *   2. the image prompt TEXT contains "Aspect Ratio (MANDATORY" + platform's
 *      --ar flag + exact export size
 *   3. ZIP's ai_image_prompt.txt contains the ratio block
 * Runs against a static `vite preview` of the production build.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE = process.env.TEST_BASE || 'http://localhost:4173';
const SITE = 'https://demoapp.dev';
const OUT = '/home/z/my-project/tool-results/task69';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[E2E]', ...a);
const fail = (msg) => { console.error('[E2E] FAIL:', msg); process.exit(1); };

// Expected platform→ratio map (mirrors PLATFORM_IMAGE_SPECS in aiClient.js)
// tab = dashboard tab label, badge = post.platform value on the card
const EXPECT = [
  { tab: 'Instagram', badge: 'Instagram', ratio: '4:5', px: '1080 x 1350 px', ar: '--ar 4:5' },
  { tab: 'LinkedIn', badge: 'LinkedIn', ratio: '1:1', px: '1200 x 1200 px', ar: '--ar 1:1' },
  { tab: 'Twitter / X', badge: 'Twitter/X', ratio: '16:9', px: '1600 x 900 px', ar: '--ar 16:9' },
];

// ---- canned demo site -------------------------------------------------------
const pageHtml = (title, body) => `<!doctype html><html><head>
<title>${title}</title><meta name="description" content="DemoSuite offers free browser tools: compress, convert and merge files instantly with zero uploads.">
</head><body>${body}</body></html>`;

const siteHtml = {
  '/': pageHtml('DemoSuite — Free Online Tools', `
    <h1>DemoSuite — every file tool in one place</h1>
    <h2>Image Studio</h2><h2>PDF Studio</h2>
    <nav>
      <a href="/studio/image">Image Studio</a>
      <a href="/studio/pdf">PDF Studio</a>
      <a href="/tool/image-compress">Image Compressor</a>
      <a href="/tool/pdf-merge">PDF Merger</a>
    </nav>
    <p>Compress images, merge PDFs, convert files — free, no signup, everything runs in your browser.</p>`),
  '/studio/image': pageHtml('Image Studio — DemoSuite', `
    <h1>Image Studio</h1>
    <h2>Image Compressor — shrink JPG and PNG files up to 90% smaller in seconds</h2>
    <a href="/tool/image-compress">Open Image Compressor</a>`),
  '/studio/pdf': pageHtml('PDF Studio — DemoSuite', `
    <h1>PDF Studio</h1>
    <h2>PDF Merger — combine multiple PDF files into one document</h2>
    <a href="/tool/pdf-merge">Open PDF Merger</a>`),
  '/tool/image-compress': pageHtml('Image Compressor — DemoSuite', '<h1>Image Compressor</h1><p>Upload any JPG or PNG and get a compressed version instantly — no uploads leave your device.</p>'),
  '/tool/pdf-merge': pageHtml('PDF Merger — DemoSuite', '<h1>PDF Merger</h1><p>Drop several PDFs and download one merged file in seconds.</p>'),
};

const mockFor = (target) => {
  let u;
  try { u = new URL(target); } catch { return { status: 404, contentType: 'text/plain', body: 'bad' }; }
  if (/s\.wordpress\.com|wsrv\.nl|allorigins|corsproxy|jina\.ai|microlink|archive\.org|web\.archive/i.test(u.hostname + target)) {
    return { status: 404, contentType: 'text/plain', body: 'no-shot' };
  }
  const pathKey = u.pathname.replace(/\/$/, '') || '/';
  const html = siteHtml[pathKey] || siteHtml['/'];
  return { status: 200, contentType: 'text/html; charset=utf-8', body: html };
};

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(60000);

// Pull the proxied target URL out of ANY proxy style (query `url=`/`u=` or
// path-style like r.jina.ai/https://…), so live-site runs stay fully mocked.
const extractTarget = (u) => {
  const m = u.match(/[?&](?:url|u|target|link)=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  const i = u.lastIndexOf('http');
  if (i > 0) { let t = u.slice(i); try { t = decodeURIComponent(t); } catch {} return t.split('&')[0]; }
  return null;
};

await page.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.includes('/api/proxy?url=')) {
    const target = decodeURIComponent(url.split('url=')[1]?.split('&')[0] || '');
    return route.fulfill(mockFor(target));
  }
  const target = extractTarget(url);
  if (target && /^https?:\/\//i.test(target)) return route.fulfill(mockFor(target));
  if (url.startsWith(BASE) || url.includes('imranah10.github.io')) {
    return route.continue();
  }
  return route.fulfill({ status: 404, contentType: 'text/plain', body: 'blocked' });
});

try {
  log('open', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Auto-Pilot Launch', { timeout: 30000 });

  // --- 1. platforms: Instagram + LinkedIn + Twitter/X (3 distinct ratios) ---
  const tiktok = page.locator('button:has-text("TikTok")').first();
  if (await tiktok.isVisible()) await tiktok.click();
  await page.waitForTimeout(300);
  log('selection = Instagram + LinkedIn + Twitter/X');

  // --- 2. analysis (mocked crawl) ---
  await page.fill('input[placeholder*="yourwebsite"]', `${SITE}/`);
  await page.click('button:has-text("Auto-Pilot Launch")');
  await page.waitForSelector('text=AI Autonomous Strategy Recommendation', { timeout: 240000 });
  log('strategy screen visible');
  await page.click('button:has-text("Generate"):not(:has-text("Days"))');
  log('generation running…');

  await page.waitForSelector('button:has-text("Export Full Campaign (ZIP)")', { timeout: 180000 });
  log('campaign dashboard visible');
  await page.waitForTimeout(800);

  // --- 3. per-platform: expand first card's AI prompts, verify chip + text ---
  for (const exp of EXPECT) {
    const tab = page.locator(`button:has-text("${exp.tab}")`).first();
    await tab.click();
    await page.waitForTimeout(600);
    const card = page.locator('div.group').filter({ hasText: exp.badge }).first();
    const expand = card.locator('button:has-text("AI Prompts")').first();
    if (!(await expand.isVisible().catch(() => false))) fail(`${exp.tab}: AI Prompts expander not visible`);
    await expand.click();
    await page.waitForTimeout(500);

    // (a) ratio chip
    const chip = card.locator('span:has-text("📐")').first();
    const chipText = (await chip.textContent().catch(() => '')) || '';
    if (!chipText.includes(exp.ratio) || !chipText.includes(exp.px)) {
      fail(`${exp.tab}: chip "${chipText.trim()}" does not show ${exp.ratio} · ${exp.px}`);
    }
    log(`${exp.tab}: chip OK → "${chipText.trim()}"`);

    // (b) prompt text contains the MANDATORY ratio block
    const pre = card.locator('pre').first();
    const promptText = (await pre.textContent().catch(() => '')) || '';
    if (!promptText.includes('Aspect Ratio (MANDATORY')) fail(`${exp.tab}: prompt missing "Aspect Ratio (MANDATORY"`);
    if (!promptText.includes(exp.ar)) fail(`${exp.tab}: prompt missing Midjourney flag ${exp.ar}`);
    if (!promptText.includes(exp.px)) fail(`${exp.tab}: prompt missing exact size ${exp.px}`);
    log(`${exp.tab}: prompt text OK (ratio + ${exp.ar} + ${exp.px})`);

    // (c) screenshot proof
    await page.screenshot({ path: path.join(OUT, `ratio_${exp.badge.replace(/[^a-z0-9]/gi, '_')}.png`) });

    // collapse again for next loop
    await expand.click();
    await page.waitForTimeout(300);
  }

  // --- 4. ZIP export → ai_image_prompt.txt contains ratio block ---
  const dlPromise = page.waitForEvent('download', { timeout: 300000 });
  await page.click('button:has-text("Export Full Campaign (ZIP)")');
  const download = await dlPromise;
  const zipPath = path.join(OUT, 'campaign.zip');
  await download.saveAs(zipPath);
  const ex = path.join(OUT, 'zip');
  fs.rmSync(ex, { recursive: true, force: true });
  execSync(`unzip -q -o "${zipPath}" -d "${ex}"`);
  const txts = execSync(`rg -l "ai_image_prompt" "${ex}" --glob "*ai_image_prompt*" || true`, { encoding: 'utf8' });
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'ai_image_prompt.txt') files.push(p);
  });
  walk(ex);
  if (!files.length) fail('ZIP: no ai_image_prompt.txt found');
  let withRatio = 0;
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    if (t.includes('Aspect Ratio (MANDATORY') && t.includes('--ar ')) withRatio++;
  }
  if (withRatio !== files.length) fail(`ZIP: only ${withRatio}/${files.length} ai_image_prompt.txt files contain the ratio block`);
  log(`ZIP: ${withRatio}/${files.length} ai_image_prompt.txt files contain the ratio block ✓`);

  await browser.close();
  console.log('\n[E2E] ALL CHECKS PASSED — aspect ratio explicitly present in every image prompt surface.');
  process.exit(0);
} catch (e) {
  console.error('[E2E] ERROR:', e.message);
  try { await page.screenshot({ path: path.join(OUT, 'fail.png'), fullPage: false }); } catch {}
  try { await browser.close(); } catch {}
  process.exit(1);
}
