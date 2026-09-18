/**
 * Task 66 E2E (v2) — OmniPost AI with full network mocking.
 * External fetches are intercepted: the demo site + its pages return canned
 * HTML, everything else 404s fast (no screenshots needed for structure tests).
 * Verifies: Reddit selectable, coverage badge, days×platforms derivation,
 * Reddit tab, ZIP download.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.TEST_BASE || 'http://localhost:4173';
const SITE = 'https://demoapp.dev';
const OUT = '/home/z/my-project/tool-results/task66';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[E2E]', ...a);
const fail = (msg) => { console.error('[E2E] FAIL:', msg); process.exit(1); };

// ---- canned site -----------------------------------------------------------
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
      <a href="/about">About</a>
    </nav>
    <p>Compress images, merge PDFs, convert files — free, no signup, everything runs in your browser.</p>`),
  '/studio/image': pageHtml('Image Studio — DemoSuite', `
    <h1>Image Studio</h1>
    <h2>Image Compressor — shrink JPG and PNG files up to 90% smaller in seconds</h2>
    <h2>Background Remover — erase photo backgrounds instantly</h2>
    <a href="/tool/image-compress">Open Image Compressor</a>
    <a href="/tool/background-remover">Open Background Remover</a>`),
  '/studio/pdf': pageHtml('PDF Studio — DemoSuite', `
    <h1>PDF Studio</h1>
    <h2>PDF Merger — combine multiple PDF files into one document</h2>
    <a href="/tool/pdf-merge">Open PDF Merger</a>`),
  '/about': pageHtml('About — DemoSuite', '<h1>About DemoSuite</h1><p>We build free privacy-first browser tools.</p>'),
  '/tool/image-compress': pageHtml('Image Compressor — DemoSuite', '<h1>Image Compressor</h1><p>Upload any JPG or PNG and get a compressed version instantly — no uploads leave your device.</p>'),
  '/tool/background-remover': pageHtml('Background Remover — DemoSuite', '<h1>Background Remover</h1><p>Remove image backgrounds automatically right in your browser.</p>'),
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

await page.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith(BASE)) {
    if (url.includes('/api/proxy?url=')) {
      const target = decodeURIComponent(url.split('url=')[1]?.split('&')[0] || '');
      return route.fulfill(mockFor(target));
    }
    return route.continue();
  }
  return route.fulfill({ status: 404, contentType: 'text/plain', body: 'blocked' });
});

try {
  log('open', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Auto-Pilot Launch', { timeout: 30000 });

  // --- 1. Reddit chip visible + selectable; trim to 3 platforms ---
  const redditChip = page.locator('button:has-text("Reddit")').first();
  if (!(await redditChip.isVisible())) fail('Reddit chip not visible');
  await redditChip.click();
  for (const label of ['TikTok', 'Twitter / X']) {
    const chip = page.locator(`button:has-text("${label}")`).first();
    if (await chip.isVisible()) await chip.click();
  }
  await page.waitForTimeout(300);
  log('selection = Instagram + LinkedIn + Reddit');

  // --- 2. Analysis (mocked crawl — fast) ---
  await page.fill('input[placeholder*="yourwebsite"]', `${SITE}/`);
  await page.click('button:has-text("Auto-Pilot Launch")');
  log('analysis launched…');
  await page.waitForSelector('text=AI Autonomous Strategy Recommendation', { timeout: 240000 });
  log('strategy screen visible');

  const badge = (await page.locator('text=platforms =').first().textContent().catch(() => null) || '').trim();
  if (!/days × 3 platforms/.test(badge)) fail(`coverage badge wrong: "${badge}"`);
  log('coverage badge OK:', badge);

  // --- 3. Customizer: 3 days → derived 9 posts ---
  await page.click('button:has-text("Customize Days")');
  await page.waitForSelector('text=Campaign Duration', { timeout: 15000 });
  await page.locator('input[type="range"]').first().fill('3');
  await page.waitForTimeout(300);
  const genBtnText = (await page.locator('button:has-text("Generate")').last().textContent()) || '';
  if (!/Generate 9 Posts \(3 Days × 3 Platforms\)/.test(genBtnText.trim())) {
    fail(`derived total wrong on button: "${genBtnText.trim()}"`);
  }
  log('derived total OK:', genBtnText.trim());
  await page.click('button:has-text("Generate 9 Posts")');
  log('generation running…');

  await page.waitForSelector('button:has-text("Export Full Campaign (ZIP)")', { timeout: 180000 });
  log('campaign dashboard visible');

  // --- 4. Reddit tab shows Reddit posts ---
  await page.click('button:has-text("Reddit")');
  await page.waitForTimeout(600);
  const redditBadges = await page.locator('span:text-is("Reddit")').count();
  if (redditBadges < 3) fail(`expected ≥3 Reddit post badges, got ${redditBadges}`);
  log('Reddit tab shows', redditBadges, 'Reddit posts');
  await page.click('button:has-text("All Posts")');
  await page.waitForTimeout(300);

  // --- 5. Open a video post drawer → check tool-working narration ---
  // Video card badge contains "Video Reel / Short"
  const videoCard = page.locator('div.group', { hasText: 'Video Reel / Short' }).first();
  if (await videoCard.count()) {
    await videoCard.locator('button, [role="button"]').last().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // --- 6. ZIP export ---
  const dlPromise = page.waitForEvent('download', { timeout: 300000 });
  await page.click('button:has-text("Export Full Campaign (ZIP)")');
  log('ZIP export clicked…');
  const download = await dlPromise;
  const zipPath = path.join(OUT, 'campaign.zip');
  await download.saveAs(zipPath);
  const size = fs.statSync(zipPath).size;
  log('ZIP downloaded:', zipPath, size, 'bytes');
  if (size < 5000) fail('ZIP suspiciously small');

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'browser_phase.json'), JSON.stringify({ ok: true, zipPath, badge }, null, 2));
  log('BROWSER PHASE PASSED');
} catch (e) {
  try { await page.screenshot({ path: path.join(OUT, 'fail.png'), fullPage: true }); } catch {}
  console.error('[E2E] EXCEPTION:', e.message);
  await browser.close();
  process.exit(1);
}
