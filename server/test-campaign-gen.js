import axios from 'axios';
import fs from 'fs';

async function main() {
  const analysisPath = './generated/e6dce15929/analysis.json';
  const data = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));

  console.log('Sending /api/generate-campaign for 3 posts...');
  const res = await axios.post('http://localhost:5000/api/generate-campaign', {
    websiteData: data.websiteData,
    strategy: data.strategy,
    days: 7,
    totalPosts: 3,
    geminiApiKey: process.env.GEMINI_API_KEY || ''
  }, { timeout: 180000 });

  console.log('Campaign generation result:');
  for (const p of res.data.posts) {
    console.log(`- [${p.day}] ${p.contentType}: ${p.toolName} (${p.studio})`);
    console.log(`    Image: ${p.generatedImageUrl}`);
    console.log(`    Video: ${p.videoUrl}`);
  }
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
});
