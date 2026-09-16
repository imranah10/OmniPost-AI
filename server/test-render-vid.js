import { renderReelVideo } from './videoEngine.js';
import path from 'path';
import fs from 'fs';

async function testVideo() {
  const outDir = './test_video_out';
  fs.mkdirSync(outDir, { recursive: true });

  const post = {
    hook: 'Meet GitScope Pro in Developer Studio',
    callToAction: 'Try it free at toolverse.app',
    studio: 'Developer Studio',
    toolName: 'GitScope Pro'
  };

  const strategy = {
    brandName: 'Toolverse'
  };

  const websiteData = {
    domain: 'toolverse-official.vercel.app',
    palette: ['#6366f1', '#38bdf8', '#a855f7'],
    capturedScreenshots: [
      {
        title: 'GitScope Pro',
        studio: 'Developer Studio',
        localPath: './test_shots/gitscope_active.jpg'
      }
    ]
  };

  console.log('Rendering test video reel...');
  const res = await renderReelVideo({
    post,
    imagePath: './test_shots/gitscope_active.jpg',
    strategy,
    websiteData,
    outDir,
    webPrefix: '/generated/test',
    index: 1
  });

  console.log('Video render result:', res);
  if (res && res.path) {
    const stat = fs.statSync(res.path);
    console.log(`Rendered MP4 file size: ${stat.size} bytes (${Math.round(stat.size / 1024)} KB)`);
  }
}

testVideo().catch(console.error);
