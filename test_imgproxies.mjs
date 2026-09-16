// Test image fetch paths for screenshots (mshots) & AI images (pollinations)
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  headless: true,
});
const page = await browser.newPage();
await page.goto('https://example.com', { waitUntil: 'load', timeout: 30000 }).catch(() => {});

const targets = [
  ['mshots-direct', 'https://s.wordpress.com/mshots/v1/https%3A%2F%2Ftoolverse-official.vercel.app%2F?w=800&h=500'],
  ['mshots-wsrv', 'https://wsrv.nl/?url=s.wordpress.com%2Fmshots%2Fv1%2Fhttps%253A%252F%252Ftoolverse-official.vercel.app%252F%3Fw%3D800%26h%3D500&output=jpg'],
  ['mshots-workers', 'https://test.cors.workers.dev/?https://s.wordpress.com/mshots/v1/https%253A%252F%252Ftoolverse-official.vercel.app%252F%3Fw%3D800%26h%3D500'],
  ['pollinations-direct', 'https://image.pollinations.ai/prompt/test%20logo%20design?width=256&height=256&nologo=true&seed=42'],
];

for (const [name, url] of targets) {
  const r = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(45000) });
      const blob = await res.blob();
      return { ok: res.ok, status: res.status, type: blob.type, size: blob.size };
    } catch (e) {
      return { ok: false, err: String(e).slice(0, 70) };
    }
  }, url);
  console.log(name.padEnd(20), JSON.stringify(r));
}

// also test <img> loading of mshots (works without CORS for display)
const imgOk = await page.evaluate(
  (u) =>
    new Promise((res) => {
      const i = new Image();
      i.onload = () => res(`${i.naturalWidth}x${i.naturalHeight}`);
      i.onerror = () => res('error');
      setTimeout(() => res('timeout'), 40000);
      i.src = u;
    }),
  'https://s.wordpress.com/mshots/v1/https%3A%2F%2Ftoolverse-official.vercel.app%2F?w=800&h=500'
);
console.log('mshots-img-load'.padEnd(20), imgOk);

await browser.close();
