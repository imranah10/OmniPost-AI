// Full E2E: URL → strategy → campaign → wait images → ZIP → inspect contents
import { chromium } from 'playwright';
import fs from 'fs';
import { execSync } from 'child_process';

const BASE = process.argv[2] || 'http://localhost:4173';
const TEST_URL = process.argv[3] || 'https://toolverse-official.vercel.app';

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
let pass = 0, fail = 0;
const t = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${extra}`); }
};

await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1000);

await page.locator('input[type="url"], input[placeholder*="http"], input[type="text"]').first().fill(TEST_URL);
await page.locator('button:has-text("Auto-Pilot")').first().click();

// wait strategy
let strategyOk = false;
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(3000);
  const body = await page.locator('body').innerText();
  if (/Accept.*Plan|Generate All/i.test(body)) { strategyOk = true; break; }
}
t('strategy view', strategyOk);

const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Generate All")').first();
await acceptBtn.click();

// wait campaign
let campaignOk = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(3000);
  const body = await page.locator('body').innerText();
  if (/Export Full Campaign/i.test(body) && /Day 1/i.test(body)) { campaignOk = true; break; }
}
t('campaign view', campaignOk);

// wait for AI images to load (pollinations is slow; up to 4 min)
await page.waitForTimeout(1000);
let imgPct = 0;
for (let i = 0; i < 48; i++) {
  const imgs = await page.evaluate(() => Array.from(document.images).map((im) => im.complete && im.naturalWidth > 5));
  imgPct = Math.round((imgs.filter(Boolean).length / Math.max(1, imgs.length)) * 100);
  if (imgPct >= 60) break;
  await page.waitForTimeout(5000);
}
t('AI images loading', imgPct >= 60, `only ${imgPct}% loaded`);

// ZIP download
const dlPromise = page.waitForEvent('download', { timeout: 240000 });
await page.locator('button:has-text("Export Full Campaign")').first().click();
const dl = await dlPromise;
const zipPath = await dl.path();
const size = fs.statSync(zipPath).size;
t('ZIP downloads', size > 150000, `size=${(size / 1024).toFixed(0)}KB`);

// inspect ZIP
const outDir = '/tmp/zip_inspect';
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
try {
  execSync(`cd ${outDir} && unzip -q "${zipPath}"`);
  const files = execSync(`find ${outDir} -type f | wc -l`).toString().trim();
  const shots = execSync(`find ${outDir} -path "*screenshots*" -type f | wc -l`).toString().trim();
  const imgs = execSync(`find ${outDir} -name "*.jpg" -o -name "*.png" | wc -l`).toString().trim();
  const prompts = execSync(`grep -rl "MASTER" ${outDir} --include="*.md" --include="*.txt" | wc -l`).toString().trim();
  const csv = fs.existsSync(`${outDir}/campaign_schedule.csv`);
  console.log(`   zip files: ${files} | screenshots: ${shots} | images: ${imgs} | master docs: ${prompts} | csv: ${csv}`);
  t('ZIP has screenshots', Number(shots) >= 1);
  t('ZIP has prompts + plan', Number(prompts) >= 2 && csv);
  t('ZIP reasonably full', Number(files) >= 15, `files=${files}`);
} catch (e) {
  t('ZIP inspectable', false, String(e).slice(0, 100));
}

console.log(`\n${pass}/${pass + fail} PASS`);
await browser.close();
process.exit(fail ? 1 : 0);
