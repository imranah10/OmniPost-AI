import { chromium } from 'playwright';

async function extractAllTools() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Visiting landing page...');
  await page.goto('https://toolverse-official.vercel.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const allTools = [];

  // Extract from landing page
  const homeTools = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('h3, h4, [class*="card"], a[href*="tool"], button'))
      .map(e => (e.innerText || '').trim().replace(/\s+/g, ' '))
      .filter(t => t.length > 2 && t.length < 50 && !/^(back|menu|search|home|explore|browse|view|instant|private|no signup|free)/i.test(t));
    return [...new Set(cards)];
  });

  homeTools.forEach(t => {
    allTools.push({ name: t, studio: 'Popular / Core Tools', source: 'Home' });
  });

  console.log(`Extracted ${homeTools.length} tools from home!`);

  const studios = [
    { name: 'Developer Studio', path: '/studio/developer' },
    { name: 'Shield Studio', path: '/studio/shield' },
    { name: 'Image Studio', path: '/studio/image' },
    { name: 'PDF Studio', path: '/studio/pdf' },
    { name: 'Calculator Studio', path: '/studio/calculator' },
    { name: 'Text Studio', path: '/studio/text' },
    { name: 'Generator Studio', path: '/studio/generator' },
    { name: 'AI Pro Studio', path: '/studio/ai-pro' }
  ];

  for (const s of studios) {
    try {
      await page.goto(`https://toolverse-official.vercel.app${s.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);

      const studioTools = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('button, h2, h3, h4, [class*="card"], [role="tab"], div[class*="item"]'))
          .map(e => (e.innerText || '').trim().replace(/\s+/g, ' '))
          .filter(t => 
            t.length > 2 && 
            t.length < 45 && 
            !/^(back|menu|search|home|settings|more|copy|view|quick start|theme|cli|contact|tools|advertisement|try|install)/i.test(t)
          );
        return [...new Set(items)];
      });

      console.log(`[${s.name}] extracted ${studioTools.length} tools!`);
      studioTools.forEach(toolRaw => {
        const clean = toolRaw.replace(/\s*(NEW|VIRAL|PRO|LIVE|INVENTION|FX|SECRET|✨|\d+\s*tools|arrow_forward|\d+MODES|\d+EYES|AI|4×)$/gi, '').trim();
        if (clean.length > 2 && !allTools.some(x => x.name.toLowerCase() === clean.toLowerCase())) {
          allTools.push({ name: clean, studio: s.name, source: s.path });
        }
      });
    } catch (e) {
      console.log(`Failed studio ${s.name}:`, e.message);
    }
  }

  console.log(`\n🎉 TOTAL TOOLS EXTRACTED: ${allTools.length}!`);
  console.log('Sample tools (first 25):', allTools.slice(0, 25).map(t => `${t.name} (${t.studio})`));

  await browser.close();
}

extractAllTools().catch(console.error);
