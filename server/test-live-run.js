import axios from 'axios';

async function testFullFlow() {
  console.log('Testing /api/analyze on Toolverse with autonomous tool testing...');
  const analyzeRes = await axios.post('http://localhost:5000/api/analyze', {
    url: 'https://toolverse-official.vercel.app/',
    geminiApiKey: process.env.GEMINI_API_KEY || ''
  }, { timeout: 240000 });

  console.log('Analyze finished!');
  console.log('Discovered Tools count:', analyzeRes.data.websiteData.discoveredTools?.length);
  console.log('Captured Screenshots count:', analyzeRes.data.websiteData.capturedScreenshots?.length);
  console.log('Sample Screenshots:', analyzeRes.data.websiteData.capturedScreenshots?.slice(0, 5).map(s => `${s.title} (${s.studio}) -> ${s.testAction}`));

  console.log('\nNow generating 3 sample posts campaign with video reel...');
  const campRes = await axios.post('http://localhost:5000/api/generate-campaign', {
    websiteData: analyzeRes.data.websiteData,
    strategy: analyzeRes.data.strategy,
    days: 7,
    totalPosts: 3,
    geminiApiKey: process.env.GEMINI_API_KEY || ''
  }, { timeout: 180000 });

  console.log('Campaign generated successfully!');
  campRes.data.posts.forEach((p, idx) => {
    console.log(`[Post ${idx + 1}] Format: ${p.contentType} | Tool: ${p.toolName} (${p.studio})`);
    console.log(`  Hook: ${p.hook}`);
    console.log(`  Image: ${p.generatedImageUrl}`);
    console.log(`  Video: ${p.videoUrl || 'N/A'}`);
  });
}

testFullFlow().catch(err => {
  console.error('Test error:', err.response?.data || err.message);
});
