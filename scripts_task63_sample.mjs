import { buildMasterAssetPostingKit } from './client/src/lib/platformGuide.js';
const kit = buildMasterAssetPostingKit({
  strategy: { brandName: 'iLovePDF', industry: 'PDF & Document Productivity', targetAudience: 'Students, office teams, freelancers', uniqueSellingPoint: 'Every PDF tool you need in one free, browser-based suite' },
  websiteData: { domain: 'ilovepdf.com', studios: ['Organize PDF', 'Convert PDF', 'Edit & Sign'] },
  posts: [
    { day: 'Day-1', platform: 'Instagram', contentType: 'Image Post', toolName: 'Merge PDF' },
    { day: 'Day-2', platform: 'TikTok', contentType: 'Video Reel / Short', toolName: 'OCR PDF' },
  ],
  selectedPlatforms: ['Instagram', 'LinkedIn', 'Twitter/X', 'TikTok'],
});
console.log(kit);
console.log('\n\n=== KIT LENGTH:', kit.length, 'chars ===');
