// Test which CORS proxies actually work from a real browser
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  headless: true,
});
const page = await browser.newPage();
await page.goto('https://example.com', { waitUntil: 'load', timeout: 30000 }).catch(() => {});

const proxies = [
  ['allorigins-raw', 'https://api.allorigins.win/raw?url=https%3A%2F%2Ftoolverse-official.vercel.app%2F'],
  ['allorigins-get', 'https://api.allorigins.win/get?url=https%3A%2F%2Ftoolverse-official.vercel.app%2F'],
  ['codetabs', 'https://api.codetabs.com/v1/proxy?quest=https://toolverse-official.vercel.app/'],
  ['corspx', 'https://corsproxy.io/?url=https%3A%2F%2Ftoolverse-official.vercel.app%2F'],
  ['cors-workers-dev', 'https://test.cors.workers.dev/?https://toolverse-official.vercel.app/'],
  ['corsfix-demo', 'https://proxy.corsfix.com/?https://toolverse-official.vercel.app/'],
  ['corslol', 'https://api.cors.lol/?url=https://toolverse-official.vercel.app/'],
  ['whateverorigin', 'http://www.whateverorigin.org/get?url=https://toolverse-official.vercel.app/'],
  ['thingproxy', 'https://thingproxy.freeboard.io/fetch/https://toolverse-official.vercel.app/'],
];

for (const [name, url] of proxies) {
  const r = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      return { ok: res.ok, status: res.status, len: text.length, head: text.slice(0, 60).replace(/\n/g, ' ') };
    } catch (e) {
      return { ok: false, err: String(e).slice(0, 80) };
    }
  }, url);
  console.log(name.padEnd(18), JSON.stringify(r).slice(0, 130));
}

await browser.close();
