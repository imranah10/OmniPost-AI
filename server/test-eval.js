import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://toolverse-official.vercel.app/studio/developer', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Click GitScope Pro
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /GitScope/i.test(b.innerText));
    if (btn) btn.click();
  });
  await page.waitForTimeout(1000);

  // Click sample repo button e.g. "facebook/react" or "vercel/next.js"
  const sampleClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /facebook\/react|vercel\/next\.js/i.test(b.innerText));
    if (btn) {
      btn.click();
      return btn.innerText;
    }
    return null;
  });
  console.log('Clicked sample button:', sampleClicked);
  await page.waitForTimeout(1000);

  // Click "Analyze" button
  const analyzeClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => /^Analyze/i.test(b.innerText.trim()));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked Analyze button:', analyzeClicked);
  await page.waitForTimeout(3000);

  // Now capture screenshot or inspect state
  const testState = await page.evaluate(() => {
    return {
      bodySnippet: document.body.innerText.slice(0, 500).replace(/\n+/g, ' | ')
    };
  });
  console.log('Live Active State:', testState);

  await browser.close();
}

main().catch(console.error);
