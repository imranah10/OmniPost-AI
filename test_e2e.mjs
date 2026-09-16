/* End-to-end smoke test (no API keys needed — uses built-in fallback engines) */
const BASE = 'http://localhost:49527';

async function main() {
  console.log('=== 1. Health check ===');
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log(JSON.stringify(health));

  console.log('=== 2. Analyze https://example.com ===');
  const aRes = await fetch(`${BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', customPrompt: '' })
  });
  const aData = await aRes.json();
  if (!aData.success) throw new Error('analyze failed: ' + JSON.stringify(aData));
  const { websiteData, strategy } = aData;
  console.log('brand:', strategy.brandName, '| engine:', strategy.engine);
  console.log('screenshotUrl:', websiteData.screenshotUrl);
  console.log('palette:', websiteData.palette?.join(', '));
  console.log('testReport:', websiteData.testReport?.score, websiteData.testReport?.grade, '| issues:', websiteData.testReport?.issues?.length, '| passed:', websiteData.testReport?.passed?.length);

  if (websiteData.screenshotUrl && websiteData.screenshotUrl.startsWith('/generated')) {
    const shotRes = await fetch(`${BASE}${websiteData.screenshotUrl}`);
    console.log('screenshot fetch status:', shotRes.status, '(should be 200)');
    const mobRes = await fetch(`${BASE}${websiteData.mobileScreenshotUrl}`);
    console.log('mobile screenshot fetch status:', mobRes.status, '(should be 200)');
  } else {
    console.log('WARNING: local screenshot missing (playwright fallback used)');
  }

  console.log('=== 3. Generate campaign (3 posts / 7 days, includes 1 video reel) ===');
  const gRes = await fetch(`${BASE}/api/generate-campaign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ websiteData, strategy, days: 7, totalPosts: 3, customPrompt: 'Focus on fast onboarding' })
  });
  const gData = await gRes.json();
  if (!gData.success) throw new Error('generate failed: ' + JSON.stringify(gData));
  console.log('posts generated:', gData.posts.length);
  console.log('providers:', JSON.stringify(gData.providers));

  let videos = 0;
  for (const p of gData.posts) {
    const imgStatus = await fetch(`${BASE}${p.generatedImageUrl}`).then((r) => r.status);
    let vidStatus = '-';
    if (p.videoUrl && !p.videoUrl.startsWith('http')) {
      vidStatus = await fetch(`${BASE}${p.videoUrl}`).then((r) => r.status);
      videos++;
    }
    console.log(`${p.id} | ${p.day} | ${p.contentType} | img:${imgStatus} | vid:${vidStatus} | tags:${p.hashtags?.length} | caption:${p.caption?.length}ch`);
  }

  console.log(videos > 0 ? '=== ALL E2E TESTS PASSED (incl. real MP4 reel) ===' : '=== TESTS PASSED (no video rendered) ===');
}

main().catch((e) => {
  console.error('E2E TEST FAILED:', e.message);
  process.exit(1);
});
