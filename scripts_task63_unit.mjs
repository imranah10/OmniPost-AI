/**
 * scripts_task63_unit.mjs — Task 63 unit tests.
 * User gap: "master prompt se image/video bana li, ab platform ke according
 * KYA LIKHNA hai — wo to diya hi nahi". Fix = MASTER_ASSET_POSTING_KIT.md
 * (buildMasterAssetPostingKit) + START_HERE/CAMPAIGN_OVERVIEW map updates.
 *
 * Run: node scripts_task63_unit.mjs
 */
import {
  buildMasterAssetPostingKit,
  buildPlatformPostingGuide,
  buildStartHere,
  buildCampaignOverview,
  buildMasterCopywritingPrompt,
} from './client/src/lib/platformGuide.js';

const strategy = {
  brandName: 'iLovePDF',
  industry: 'PDF & Document Productivity',
  brandTone: 'Helpful, fast, no-nonsense',
  targetAudience: 'Students, office teams, freelancers',
  uniqueSellingPoint: 'Every PDF tool you need in one free, browser-based suite',
};
const websiteData = {
  title: 'iLovePDF — Online PDF Tools',
  domain: 'ilovepdf.com',
  url: 'https://www.ilovepdf.com/',
  studios: ['Organize PDF', 'Convert PDF', 'Edit & Sign'],
};
const posts = [
  { id: 1, day: 'Day-1', platform: 'Instagram', contentType: 'Image Post', toolName: 'Merge PDF', studio: 'Organize PDF', hook: 'Merge 100 PDFs in one drag', caption: 'cap', hashtags: ['#pdf', '#merge'], bestTime: '9:00 AM', callToAction: 'Try free →' },
  { id: 2, day: 'Day-2', platform: 'LinkedIn', contentType: 'Carousel Graphic', toolName: 'Compress PDF', studio: 'Organize PDF', hook: 'Send big files without the "file too large" error', caption: 'cap', hashtags: ['#pdf'], bestTime: '10:00 AM', callToAction: 'Try free →' },
  { id: 3, day: 'Day-3', platform: 'Twitter/X', contentType: 'Video Reel / Short', toolName: 'PDF to Word', studio: 'Convert PDF', hook: 'PDF to Word in one tap', caption: 'cap', hashtags: ['#pdf'], bestTime: '11:00 AM', callToAction: 'Try free →' },
  { id: 4, day: 'Day-4', platform: 'TikTok', contentType: 'Video Reel / Short', toolName: 'OCR PDF', studio: 'Edit & Sign', hook: 'Scanned pages become searchable', caption: 'cap', hashtags: ['#pdf'], bestTime: '8:00 PM', callToAction: 'Try free →' },
];
const selectedPlatforms = ['Instagram', 'LinkedIn', 'Twitter/X', 'TikTok'];

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('\n=== buildMasterAssetPostingKit ===');
const kit = buildMasterAssetPostingKit({ strategy, websiteData, posts, selectedPlatforms });

check('kit is non-empty & substantial', typeof kit === 'string' && kit.length > 4000, `len=${kit?.length}`);
check('kit title present', kit.includes('MASTER ASSET POSTING KIT'));
check('brand name present', kit.includes('iLovePDF'));
check('answers the "sirf upload?" question head-on', /Do NOT just upload/i.test(kit));
check('explains both master assets', kit.includes('MASTER IMAGE') && kit.includes('MASTER VIDEO'));
check('references the two master prompt files', kit.includes('MASTER_IMAGE_PROMPT.txt') && kit.includes('MASTER_VIDEO_PROMPT.txt'));
check('has launch-week plan', /SUGGESTED LAUNCH WEEK/i.test(kit));

for (const pid of ['INSTAGRAM', 'LINKEDIN', 'TWITTER/X', 'TIKTOK']) {
  check(`section: ${pid}`, kit.toUpperCase().includes(pid.toUpperCase()));
}
const imgBlocks = (kit.match(/CAPTION — MASTER IMAGE/g) || []).length;
const vidBlocks = (kit.match(/CAPTION — MASTER VIDEO/g) || []).length;
check('image caption block per platform (4)', imgBlocks === 4, `got ${imgBlocks}`);
check('video caption block per platform (4)', vidBlocks === 4, `got ${vidBlocks}`);
check('every caption inside copy-paste fence (8+ blocks)', (kit.match(/```/g) || []).length >= 16, `fences=${(kit.match(/```/g) || []).length}`);

// X caption limit: image caption fence for X must be ≤280 chars
const xSection = kit.split('🐦 TWITTER/X')[1] || '';
const xFences = [...xSection.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
check('X section has 2 caption fences', xFences.length >= 2, `got ${xFences.length}`);
const xImg = xFences[0] || '';
const xVid = xFences[1] || '';
const xVidPosts = xVid.split('\n\n---\n\n');
check('X image caption ≤280 chars', xImg.length <= 280, `len=${xImg.length}`);
check('X video is a thread of 3 short posts', xVidPosts.length >= 3 && xVidPosts.every((p) => p.length <= 280), xVidPosts.map((p) => p.length).join(','));

// YT Shorts title ≤100 — dedicated call because YT is only rendered when selected
const ytKit = buildMasterAssetPostingKit({ strategy, websiteData, posts, selectedPlatforms: [...selectedPlatforms, 'YouTube Shorts'] });
const ytSection = (ytKit.split(/🔴 YOUTUBE SHORTS/i)[1] || '').split('REPOST WITHOUT REPEATING')[0] || '';
const ytFences = [...ytSection.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
check('YT Shorts section has 2 caption fences', ytFences.length >= 2, `got ${ytFences.length}`);
const ytTitle = ((ytFences[1] || '').match(/TITLE: (.*)/) || [])[1] || '';
check('YT Shorts video title ≤100 chars', ytTitle.length > 0 && ytTitle.length <= 100, `len=${ytTitle.length}`);

check('link rules included per platform', (kit.match(/LINK RULE on /g) || []).length === 4);
check('caption limits included per platform', (kit.match(/CAPTION LIMIT:/g) || []).length === 4);
check('hero tips included per platform', (kit.match(/HERO TIP:/g) || []).length === 4);
check('repost alternates section (no-duplicate reposts)', /REPOST WITHOUT REPEATING/i.test(kit));
check('final 60-second checklist', /60-SECOND FINAL CHECK/i.test(kit));
check('deterministic: rebuild is byte-identical', buildMasterAssetPostingKit({ strategy, websiteData, posts, selectedPlatforms }) === kit);

console.log('\n=== empty-input robustness (never blank) ===');
const kitBare = buildMasterAssetPostingKit({ strategy: {}, websiteData: {}, posts: [], selectedPlatforms: [] });
check('empty inputs still produce a full kit', kitBare.length > 3000, `len=${kitBare?.length}`);
check('bare kit falls back to generic platform section', kitBare.includes('INSTAGRAM') || kitBare.includes('PLATFORM'));

console.log('\n=== integration: START_HERE / OVERVIEW maps ===');
const startHere = buildStartHere({ strategy, websiteData, posts });
check('START_HERE mentions MASTER_ASSET_POSTING_KIT.md', startHere.includes('MASTER_ASSET_POSTING_KIT.md'));
check('START_HERE reading order includes the kit', /4\. MASTER_ASSET_POSTING_KIT\.md/.test(startHere));
check('START_HERE has "MADE THE MASTER..." section', /MADE THE MASTER IMAGE OR MASTER VIDEO\?/.test(startHere));

const overview = buildCampaignOverview({ strategy, websiteData, posts, selectedPlatforms });
check('CAMPAIGN_OVERVIEW ZIP map lists the kit', overview.includes('MASTER_ASSET_POSTING_KIT.md'));

const guide = buildPlatformPostingGuide({ strategy, websiteData, posts, selectedPlatforms });
check('PLATFORM_POSTING_GUIDE unaffected (still full)', guide.length > 3000, `len=${guide?.length}`);

const cw = buildMasterCopywritingPrompt({ strategy, websiteData, posts });
check('copywriting prompt still distinct doc', cw.length > 1500 && cw !== kit);

console.log(`\nTASK63 UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
