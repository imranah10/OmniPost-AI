import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function testStudioDeepCrawl() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating to Developer Studio...');
  await page.goto('https://toolverse-official.vercel.app/studio/developer', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Find tool buttons inside this studio
  const toolButtons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).map((b, i) => ({
      index: i,
      text: (b.innerText || '').trim().replace(/\s+/g, ' ')
    })).filter(b => 
      b.text.length > 2 && 
      b.text.length < 35 && 
      !/^(back|menu|search|home|settings|more|copy|view|quick start|theme|cli)/i.test(b.text)
    );
    return btns;
  });

  console.log('Detected tool buttons inside Developer Studio:', toolButtons);

  // Click on GitScope Pro
  const targetTool = toolButtons.find(b => /gitscope/i.test(b.text));
  if (targetTool) {
    console.log(`Clicking tool button: ${targetTool.text}...`);
    await page.evaluate((idx) => {
      const btns = Array.from(document.querySelectorAll('button'));
      if (btns[idx]) btns[idx].click();
    }, targetTool.index);
    await page.waitForTimeout(1500);

    // Click sample repo
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sample = btns.find(b => /react|next\.js|vscode/i.test(b.innerText));
      if (sample) sample.click();
    });
    await page.waitForTimeout(800);

    // Click Analyze
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const analyze = btns.find(b => /^analyze/i.test(b.innerText.trim()));
      if (analyze) analyze.click();
    });
    await page.waitForTimeout(2500);

    const testDir = './test_shots';
    fs.mkdirSync(testDir, { recursive: true });
    await page.screenshot({ path: path.join(testDir, 'gitscope_active.jpg') });
    console.log('Captured live screenshot of GitScope Pro!');
  }

  await browser.close();
}

testStudioDeepCrawl().catch(console.error);
