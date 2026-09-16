import { chromium } from 'playwright';

async function checkAllStudios() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const studios = [
    '/studio/developer',
    '/studio/shield',
    '/studio/image',
    '/studio/pdf',
    '/studio/calculator',
    '/studio/text',
    '/studio/generator',
    '/studio/ai-pro'
  ];

  for (const s of studios) {
    try {
      await page.goto(`https://toolverse-official.vercel.app${s}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      const title = await page.title();
      const tools = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a[class*="btn"], [role="tab"]')).map(b => 
          (b.innerText || '').trim().replace(/\s+/g, ' ')
        ).filter(t => 
          t.length > 2 && 
          t.length < 35 && 
          !/^(back|menu|search|home|settings|more|copy|view|quick start|theme|cli|contact)/i.test(t)
        );
        return [...new Set(btns)].slice(0, 10);
      });
      console.log(`[STUDIO ${s}] Title: ${title.slice(0, 30)}... Tools:`, tools);
    } catch (e) {
      console.log(`Failed studio ${s}:`, e.message);
    }
  }

  await browser.close();
}

checkAllStudios();
