/**
 * platformGuide.js — The "WHERE & HOW TO POST" brain of the bundle.
 *
 * The exported ZIP used to ship prompts + captions with zero orientation:
 * the user made the visuals and then had no idea WHICH platform the post
 * belonged to, HOW to publish it there, and WHAT to write when the platform
 * has its own limits (X 280 chars!). This module fixes that by generating:
 *
 *   1. buildPlatformPostingGuide() — PLATFORM_POSTING_GUIDE.md
 *      Per selected platform: assigned posts, exact app-flow posting steps,
 *      caption rules/limits (kya likhna hai), ready-to-paste adapted captions
 *      for short-form platforms, and pro tips.
 *   2. buildMasterCopywritingPrompt() — MASTER_BRAND_COPYWRITING_PROMPT.txt
 *      A DEDICATED copywriting engine prompt (was a byte-identical duplicate
 *      of the all-in-one prompt before).
 *   3. buildStartHere() — START_HERE.txt (read-me-first orientation page).
 *   4. buildCampaignOverview() — the enriched CAMPAIGN_OVERVIEW.md body.
 *
 * Everything is plain deterministic JS — no AI call can leave the user with
 * an empty guide, and every rebuild stays in sync with the real posts.
 */

// ---------------------------------------------------------------------------
// Platform knowledge base — concrete, evergreen, app-flow accurate.
// ---------------------------------------------------------------------------

const PLATFORM_KB = {
  instagram: {
    id: 'Instagram',
    emoji: '📸',
    formats: {
      video: 'Reel — 9:16 vertical (1080×1920), 15–90s (15–30s is the sweet spot)',
      image: 'Feed image — 4:5 portrait (1080×1350) fills the most screen',
      carousel: 'Carousel — 4:5 slides, up to 20 swipeable cards',
    },
    captionLimit: '2,200 characters — only the first ~125 show before “…more”, so line 1 must be the hook',
    hashtagRule: '3–5 tight, relevant hashtags (1 brand + 1 industry + 2–3 niche). Ends of caption or first comment both work.',
    linkRule: 'Links are NOT clickable in captions. Put your site in bio and write “Link in bio 🔗”, or add a link sticker in Stories on the same day.',
    steps: [
      'Open Instagram → tap the ➕ (Create) button.',
      'Video post → tap “Reel” → upload the generated video. Image/Carousel → tap “Post” → select the generated image(s).',
      'Tap Next → (optional) pick a filter → Next again.',
      'Paste the caption + hashtags from the day folder’s “post_ready_to_publish.txt”.',
      'Tap “Advanced settings” → “Add automatically” share to Facebook if you also run the FB page.',
      'Tap Share. Publish at the BEST TIME listed for that post.',
    ],
    tips: [
      'Keep a consistent cover style for Reels — the profile grid is your storefront.',
      'First 1.5 seconds decide everything: open with the folder’s HOOK line as on-screen text.',
      'Reply to every comment in the first 60 minutes — the algorithm rewards early conversation.',
      'Re-post the same Reel to Stories with a “New” sticker for a second life.',
    ],
  },
  linkedin: {
    id: 'LinkedIn',
    emoji: '💼',
    formats: {
      video: 'Native video — 1:1 or 9:16, under 10 min (30–90s performs best)',
      image: 'Single image — 1:1 (1200×1200) or 4:5',
      carousel: 'Document post — upload your slides as a PDF (this IS LinkedIn’s carousel)',
    },
    captionLimit: '3,000 characters — the first ~210 show before “see more”, so the hook line must stand alone',
    hashtagRule: '3–5 professional hashtags. More looks spammy and hurts reach.',
    linkRule: 'External links in the body reduce reach. Write the post, then drop the link in the FIRST COMMENT (“link in comments 👇”).',
    steps: [
      'Open LinkedIn → “Start a post” box on Home.',
      'Image post → “Add a photo”. Video → “Add a video”. Carousel → “Add a document” → upload the slides exported as PDF.',
      'Paste the caption — make sure the HOOK is the complete first line (nothing important after character 210).',
      'Do NOT put the website link in the post body — add it as the first comment right after posting.',
      'Tag relevant people/companies only if genuinely relevant.',
      'Post. Tue–Thu mornings (8–10 AM) are LinkedIn’s prime window.',
    ],
    tips: [
      'PDF documents (carousels) get 3× dwell time — turn carousel_prompt.txt slides into a PDF via any free image→PDF tool.',
      'Write for “see more”: hook → blank line → story/insight → takeaway → soft CTA.',
      'Comment on your own post 1 hour later with an extra insight to restart the feed push.',
      'Never use Instagram-style emoji walls — LinkedIn rewards substance.',
    ],
  },
  'twitter/x': {
    id: 'Twitter/X',
    emoji: '🐦',
    formats: {
      video: 'Video — 9:16 or 16:9, up to 2:20 (10–45s ideal)',
      image: 'Image — 16:9 (1600×900) or 1:1, max 4 per post',
      carousel: 'Thread — a chain of connected posts (X’s native carousel)',
    },
    captionLimit: '280 characters per post (X Premium: 25,000). Short platform = short copy.',
    hashtagRule: '1–2 hashtags MAX. Hashtag-stuffed X posts read as spam and die.',
    linkRule: 'Links are allowed but put them at the END of the post (or in the reply) — mid-text links hurt clicks and reach.',
    steps: [
      'Open X → tap the ➕ / “Post” button.',
      'Paste the ready X caption from PLATFORM_POSTING_GUIDE.md (or the folder’s hook ≤ 280 chars).',
      'Tap the 🖼 media icon → attach the generated image/video.',
      'Longer story? Tap ➕ inside the composer to continue as a THREAD — one idea per post.',
      'Add the website link in the LAST post of the thread (or as the first reply).',
      'Post. Weekday mornings 9–11 AM travel best on X.',
    ],
    tips: [
      'One idea per post — X punishes paragraphs.',
      'Threads with a numbered structure (“1/ … 2/ …”) get bookmarked and re-shared.',
      'Quote-tweet yourself the next day with “in case you missed it” for a second wave.',
      'Retweet your own post with an added insight after 24h instead of posting a duplicate.',
    ],
  },
  tiktok: {
    id: 'TikTok',
    emoji: '🎵',
    formats: {
      video: 'TikTok video — 9:16 (1080×1920), 21–34s sweet spot, up to 10 min',
      image: 'Photo mode — swipeable photo set with music',
      carousel: 'Photo mode — up to 35 images',
    },
    captionLimit: '2,200 characters — but only the first line shows on the grid; make it the hook',
    hashtagRule: '3–5 hashtags: 1 broad + 1 niche + 1 trending. Check the “TikTok Creative Center” for trending tags.',
    linkRule: 'No clickable links in captions. Business accounts may add a website link on the profile; say “link in bio”.',
    steps: [
      'Open TikTok → tap the ➕ button.',
      'Upload the generated vertical video (9:16).',
      'Paste a SHORT caption — hook line + 3–5 hashtags (the folder caption works; trim to the hook + one benefit line).',
      'Tap “Add sound” → pick a trending audio at low volume under the video’s own audio.',
      'Choose a clear cover frame (the tool’s name in big text works).',
      'Post. Evening 6–10 PM is TikTok’s global prime time.',
    ],
    tips: [
      'Native-feeling videos win: avoid corporate intros — jump straight into the tool doing something.',
      'On-screen text captions boost watch time massively (most users watch muted first).',
      'Reply to top comments with a video reply — free extra content.',
      'Post consistently (1/day beats 7 in one day).',
    ],
  },
  'youtube shorts': {
    id: 'YouTube Shorts',
    emoji: '🔴',
    formats: {
      video: 'Short — 9:16 (1080×1920), up to 3 min (≤60s safest for reach)',
      image: 'Community post image (channel posts, weaker reach)',
      carousel: '—',
    },
    captionLimit: 'Title ≤100 characters + description ≤5,000 — the TITLE is the hook, the description carries details + link',
    hashtagRule: '#Shorts is optional now but harmless; add 2–3 topical keywords in the description for search.',
    linkRule: 'Put the site link in the description AND pin a comment with it. First 3 description lines show on mobile.',
    steps: [
      'Open the YouTube app → tap the ➕ → “Create a Short”.',
      'Upload the generated 9:16 video (≤60s).',
      'Title = the folder’s HOOK (under 100 chars, no clickbait lies — retention matters).',
      'In the description: 1-line what it is + the website link + 2–3 keywords.',
      'Pick a frame for the cover, add #Shorts, upload.',
      'Upload. 12–3 PM and 7–10 PM are strong Shorts windows.',
    ],
    tips: [
      'Shorts loop — end the video so it flows back into the start.',
      'The pinned comment link gets real clicks; pin it right after upload.',
      'Consistency > perfection: 3 Shorts/week beats 1 perfect one.',
      'Reuse the SAME video as TikTok/IG Reel — one render, three platforms.',
    ],
  },
  facebook: {
    id: 'Facebook',
    emoji: '👥',
    formats: {
      video: 'Reel — 9:16, up to 90s, or feed video 1:1/4:5',
      image: 'Feed image — 4:5 (1080×1350) or 1:1',
      carousel: 'Carousel ad format (organic multi-image posts also allowed)',
    },
    captionLimit: '63,206 characters technically — but only the first ~3 lines show (“See more”); keep it under ~500 for organic',
    hashtagRule: '1–2 hashtags max — Facebook hashtags barely move reach; the first line + image carry the post.',
    linkRule: 'Links work in FB posts. For max reach: put the link in the FIRST COMMENT and keep the post clean.',
    steps: [
      'Open Facebook → “What’s on your mind” composer (or Meta Business Suite → Posts → for scheduling).',
      'Photo/Video → attach the generated visual. For Reels use the ➕ Reels flow.',
      'Paste the caption — hook first line, keep it tight.',
      'Add the website link in the first comment after posting.',
      'In Business Suite you can SCHEDULE to the exact best time instead of posting live.',
      'Cross-post to relevant Groups you moderate for extra reach (never spam groups you don’t own).',
    ],
    tips: [
      'Facebook rewards conversation — end with a simple question (“Which tool would you try first?”).',
      'Reels uploaded natively outperform YouTube links pasted into FB — always upload the file itself.',
      'The same 9:16 render works as IG Reel + FB Reel + TikTok — batch your publishing.',
      'Pin the campaign launch post to the page top during launch week.',
    ],
  },
  generic: {
    id: 'Platform',
    emoji: '🌐',
    formats: { video: 'Vertical 9:16 video where supported', image: 'Clean 4:5 or 1:1 image', carousel: 'Swipeable image set where supported' },
    captionLimit: 'Keep the hook in the first line — every platform truncates somewhere.',
    hashtagRule: '3–5 relevant hashtags; drop them entirely on platforms that don’t use them.',
    linkRule: 'Where links aren’t clickable, put the site in bio/profile and point to it.',
    steps: [
      'Open the platform’s create/compose flow.',
      'Upload the generated visual from the day folder.',
      'Paste the caption + hashtags from post_ready_to_publish.txt (trim to the platform’s limit).',
      'Add the website link where the platform allows it (body, comment, or bio reference).',
      'Publish at the listed BEST TIME.',
    ],
    tips: [
      'Adapt tone to the platform — professional (LinkedIn) vs playful (TikTok).',
      'Native uploads always beat external links.',
    ],
  },
};

const normalizePlatform = (p) =>
  String(p || '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

export function kbForPlatform(platform) {
  const key = normalizePlatform(platform);
  if (PLATFORM_KB[key]) return PLATFORM_KB[key];
  if (key.includes('instagram')) return PLATFORM_KB.instagram;
  if (key.includes('linkedin')) return PLATFORM_KB.linkedin;
  if (key.includes('twitter') || key === 'x') return PLATFORM_KB['twitter/x'];
  if (key.includes('tiktok')) return PLATFORM_KB.tiktok;
  if (key.includes('youtube') || key.includes('shorts')) return PLATFORM_KB['youtube shorts'];
  if (key.includes('facebook') || key.includes('meta')) return PLATFORM_KB.facebook;
  return PLATFORM_KB.generic;
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const fmtLimit = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// Exact replica of the ZIP day-folder naming in CampaignDashboard.handleExportZip
export function dayFolderName(post, index = 0) {
  const daySlug = (post.day || `Day-${index + 1}`).replace(/\s+/g, '-');
  const platSlug = (post.platform || 'Social').replace(/[^a-zA-Z0-9]/g, '');
  const toolSlug = (post.toolName || `Post_${index + 1}`).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  return `${daySlug}_${platSlug}_${toolSlug}`;
}

const formatRole = (ct) => {
  if (String(ct || '').includes('Video')) return 'video';
  if (String(ct || '').includes('Carousel')) return 'carousel';
  return 'image';
};

// A post's single-line "what to make" instruction
const makeInstruction = (p) => {
  const role = formatRole(p.contentType);
  if (role === 'video') return 'Generate the 9:16 video with ai_video_prompt.txt (start frame: screenshot_tool_live.jpg)';
  if (role === 'carousel') return 'Generate the slides with carousel_prompt.txt (attach screenshot_tool_live.jpg), export as images/PDF';
  return 'Generate the visual with ai_image_prompt.txt (attach screenshot_tool_live.jpg for 1:1 brand match)';
};

// Ready-to-paste SHORT caption for strict-limit platforms (X etc.)
export function buildShortCaption(post, limit = 275) {
  const tags = (post.hashtags || []).slice(0, 2).join(' ');
  const body = `${post.hook || ''}\n\n${post.callToAction || ''}\n${tags}`.trim();
  return fmtLimit(body, limit);
}

// ---------------------------------------------------------------------------
// 1. PLATFORM_POSTING_GUIDE.md
// ---------------------------------------------------------------------------

export function buildPlatformPostingGuide({ strategy, websiteData, posts, selectedPlatforms }) {
  const brand = strategy?.brandName || 'Brand';
  const domain = websiteData?.domain || websiteData?.url || '';
  const allPosts = Array.isArray(posts) ? posts : [];

  const selected = (Array.isArray(selectedPlatforms) && selectedPlatforms.length
    ? selectedPlatforms
    : [...new Set(allPosts.map((p) => p.platform))]) || [];

  // Merge: a platform that earned posts but wasn't in the selection still shows
  const platformIds = [...selected, ...allPosts.map((p) => p.platform).filter(Boolean)]
    .map((p) => kbForPlatform(p).id)
    .filter((id, i, a) => a.indexOf(id) === i);

  const L = [];
  L.push(`# 📍 WHERE & HOW TO POST — Platform Publishing Playbook`);
  L.push(`**Brand:** ${brand}${domain ? ` (${domain})` : ''}`);
  L.push('');
  L.push(`**Platforms selected for this campaign:** ${platformIds.map((id) => `${kbForPlatform(id).emoji} ${id}`).join('  ·  ')}`);
  L.push('');
  L.push(`Every post below already has its caption, hashtags and prompt inside its own day folder. This guide tells you the other half: **which platform each post goes to, how to publish it there step-by-step, and exactly what to write** (with each platform's limits and rules).`);
  L.push('');
  L.push(`---`);
  L.push('');
  L.push(`## 🗓 Master Publishing Checklist (all ${allPosts.length} posts)`);
  L.push('');
  L.push(`| Day | Platform | Format | Make This | Publish At |`);
  L.push(`|---|---|---|---|---|`);
  allPosts.forEach((p, i) => {
    const role = formatRole(p.contentType);
    const asset = role === 'video' ? 'ai_video_prompt.txt' : role === 'carousel' ? 'carousel_prompt.txt' : 'ai_image_prompt.txt';
    L.push(`| ${p.day || `Day-${i + 1}`} | ${kbForPlatform(p.platform).emoji} ${p.platform} | ${p.contentType} | ${asset} → visual | ${p.bestTime || '9:00 AM'} |`);
  });
  L.push('');
  L.push(`Folder for every row: \`<Day>_<Platform>_<Tool>/\` — the name tells you the destination platform.`);
  L.push('');
  L.push(`---`);

  platformIds.forEach((platformId) => {
    const kb = kbForPlatform(platformId);
    const own = allPosts.filter((p) => kbForPlatform(p.platform).id === platformId);

    L.push('');
    L.push(`## ${kb.emoji} ${kb.id.toUpperCase()}`);
    L.push('');

    if (!own.length) {
      L.push(`*You selected this platform, but this run produced no posts for it. Regenerate or add posts to cover it.*`);
      L.push('');
      return;
    }

    L.push(`### Your ${own.length} post${own.length > 1 ? 's' : ''} on ${kb.id}`);
    L.push('');
    L.push(`| Day | Format | Topic | Day Folder | Time |`);
    L.push(`|---|---|---|---|---|`);
    own.forEach((p, i) => {
      L.push(`| ${p.day} | ${p.contentType} | ${fmtLimit(`${p.toolName} — ${p.studio || ''}`, 60)} | \`${dayFolderName(p, allPosts.indexOf(p))}\` | ${p.bestTime || '9:00 AM'} |`);
    });
    L.push('');

    L.push(`### What to publish (formats on ${kb.id})`);
    L.push('');
    Object.entries(kb.formats).forEach(([role, spec]) => {
      if (spec && spec !== '—') L.push(`- **${role.charAt(0).toUpperCase() + role.slice(1)}:** ${spec}`);
    });
    L.push('');

    L.push(`### How to post — step by step`);
    L.push('');
    kb.steps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
    L.push('');

    L.push(`### What to write on ${kb.id}`);
    L.push('');
    L.push(`- **Caption source:** each day folder's \`post_ready_to_publish.txt\` already contains the full caption + hashtags for that exact post.`);
    L.push(`- **Length:** ${kb.captionLimit}`);
    L.push(`- **Hashtags:** ${kb.hashtagRule}`);
    L.push(`- **Link policy:** ${kb.linkRule}`);
    if (platformId === 'Twitter/X') {
      L.push('');
      L.push(`**Ready-to-paste X captions (≤280 chars each)** — copy straight from here:`);
      L.push('');
      own.forEach((p) => {
        L.push(`**${p.day}**`);
        L.push('```');
        L.push(buildShortCaption(p, 275));
        L.push('```');
      });
    }
    if (platformId === 'TikTok' || platformId === 'YouTube Shorts') {
      L.push('');
      L.push(`**Ready-to-paste first lines** (hook + tags; full story lives in the video):`);
      L.push('');
      own.forEach((p) => {
        L.push(`**${p.day}** \`${fmtLimit((p.hook || '') + ' ' + (p.hashtags || []).slice(0, 3).join(' '), 150)}\``);
      });
    }
    L.push('');
    L.push(`### ${kb.id} pro tips`);
    L.push('');
    kb.tips.forEach((t) => L.push(`- ${t}`));
    L.push('');
    L.push(`---`);
  });

  L.push('');
  L.push(`## ✅ Final 60-second pre-publish routine`);
  L.push('');
  L.push(`1. Visual generated and looks brand-accurate (screenshot attached in the prompt)?`);
  L.push(`2. Caption + hashtags pasted from the day folder — trimmed to platform limit?`);
  L.push(`3. Link placed per platform rule (bio / first comment / description)?`);
  L.push(`4. Publishing inside the post's best-time window?`);
  L.push(`5. Folder marked done (rename with a leading ✔ or track in campaign_schedule.csv)?`);
  L.push('');
  L.push(`*Generated by OmniPost AI — your campaign, published like a pro on every platform.*`);

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// 2. Dedicated MASTER_BRAND_COPYWRITING_PROMPT (no longer a duplicate)
// ---------------------------------------------------------------------------

export function buildMasterCopywritingPrompt({ strategy, websiteData, posts }) {
  const brand = strategy?.brandName || 'Brand';
  const domain = websiteData?.domain || websiteData?.url || '';
  const platformIds = [...new Set((Array.isArray(posts) ? posts : []).map((p) => p.platform).filter(Boolean))]
    .map((id) => kbForPlatform(id).id);
  const platformsLine = platformIds.length ? platformIds.join(', ') : 'Instagram, LinkedIn, Twitter/X, TikTok';

  const postIndex = (Array.isArray(posts) ? posts : [])
    .map((p, i) => `${i + 1}. [${p.platform}] ${p.day} — ${p.contentType} — ${p.toolName}: hook "${fmtLimit(p.hook, 90)}"`)
    .join('\n');

  return `================================================================================
MASTER BRAND COPYWRITING PROMPT (PASTE INTO CHATGPT / GEMINI / CLAUDE)
================================================================================
This is the WRITING engine of the campaign. It is intentionally different from
MASTER_ALL_IN_ONE_PROMPT.txt (brand DNA + image/video prompt specs) and from
MASTER_BRAND_BLUEPRINT.md (site architecture). This file's only job: produce
platform-perfect TEXT for ${brand} on demand, forever.

ROLE
You are the Head of Brand Copy for ${brand}${domain ? ` (${domain})` : ''}.
You write scroll-stopping, platform-native copy that sounds human, converts
curiosity into clicks, and never repeats a sentence pattern.

BRAND DNA
- Brand: ${brand}
- Industry: ${strategy?.industry || 'Technology'}
- Voice & tone: ${strategy?.brandTone || 'Bold, modern, authoritative'}
- Audience: ${strategy?.targetAudience || 'our target market'}
- USP: ${strategy?.uniqueSellingPoint || 'our core value proposition'}
- Site: ${domain || '(the brand website)'}

VOICE RULES (apply to everything you write)
1. First line = hook: a question, a number, a contrarian claim, or a pain-point.
2. Short sentences. Active voice. Zero corporate filler ("leverage", "solutions").
3. One idea per paragraph. Show outcomes, not features.
4. Always end with one clear CTA pointing to ${domain || 'the site'}.
5. Never invent facts about the brand — only use the DNA above.

PLATFORM FORMAT RULES
- Instagram: hook first 125 chars; 3-5 hashtags; "link in bio" (links don't work in captions).
- LinkedIn: first line stands alone before "see more" (~210 chars); 3-5 hashtags; link in first comment.
- Twitter/X: 280 chars per post; 1-2 hashtags; thread for long; link at the end or in reply.
- TikTok: first line = hook; 3-5 hashtags incl. one trending; link-in-bio phrasing.
- YouTube Shorts: title <=100 chars = hook; description carries details + link.
- Facebook: first ~3 lines visible; 1-2 hashtags; link in first comment for reach.

COPY REQUEST MENU (copy any line, fill the blank, paste into the AI)
- "Write 10 hook variations for ${brand}'s ____________ feature."
- "Turn this caption into an X post under 280 characters: ____"
- "Rewrite this caption for LinkedIn with a story-style first line: ____"
- "Write a 6-slide LinkedIn document (carousel) outline about ____________."
- "Write 5 Facebook post variants with a question CTA for ____________."
- "Write a 30s TikTok script (hook / demo / payoff) for ____________."
- "Give me 8 trending-adjacent hashtag sets for ____________."
- "Write a launch-week announcement thread (7 posts) for ____________."

THIS CAMPAIGN'S POST INDEX (for context and rewrites)
${postIndex || '(generated posts will appear here when the campaign exists)'}

ANTI-REPETITION CONTRACT
Across any batch: no repeated hook angle, no repeated opening word, no
sentence pattern reused. Rotate angles: question / stat / pain-point /
contrarian / listicle / how-to / myth-bust / social-proof / curiosity / benefit.
================================================================================`;
}

// ---------------------------------------------------------------------------
// 3. START_HERE.txt — the ZIP's front door
// ---------------------------------------------------------------------------

export function buildStartHere({ strategy, websiteData, posts }) {
  const brand = strategy?.brandName || 'Brand';
  const domain = websiteData?.domain || websiteData?.url || '';
  const n = (Array.isArray(posts) ? posts : []).length;
  const platforms = [...new Set((Array.isArray(posts) ? posts : []).map((p) => p.platform).filter(Boolean))].join(', ') || 'your selected platforms';

  return `================================================================================
START HERE — READ ME FIRST (2 minutes)
${brand}${domain ? ` · ${domain}` : ''} · ${n} posts · ${platforms}
================================================================================

WHAT THIS BUNDLE IS
A complete, ready-to-publish social campaign: every post's caption, hashtags,
AI visual prompt and reference screenshot — plus the exact steps to publish
each post on each platform. No special software needed; everything opens on
any phone or laptop.

YOUR DAILY LOOP (about 15 minutes per post)
1. Open today's day folder (name = Day-X_PLATFORM_ToolName — the middle part
   IS the platform you post on).
2. Make the visual: open ai_image_prompt.txt / ai_video_prompt.txt /
   carousel_prompt.txt, copy the prompt into the Gemini app, ChatGPT,
   Midjourney, Higgsfield or Runway — attach screenshot_tool_live.jpg from the
   same folder for a 1:1 brand match. Save the result.
3. Copy the caption + hashtags from post_ready_to_publish.txt.
4. Open PLATFORM_POSTING_GUIDE.md, find that platform's section, follow its
   step-by-step posting flow, and publish at the listed BEST TIME.

MADE THE MASTER IMAGE OR MASTER VIDEO?
Those two hero assets are brand-level, not tied to a day folder — so they ship
their own caption kit: open MASTER_ASSET_POSTING_KIT.md, find your platform,
and copy the ready-to-paste caption written for exactly that asset.

READ IN THIS ORDER
1. START_HERE.txt                 <- you are here
2. CAMPAIGN_OVERVIEW.md           <- the full schedule at a glance
3. PLATFORM_POSTING_GUIDE.md      <- where & how to post + what to write on each platform
4. MASTER_ASSET_POSTING_KIT.md    <- captions for the master image & video, per platform
5. Today's Day-X folder           <- make the visual, copy the caption, post

WHAT'S INSIDE (root map)
- START_HERE.txt                    this file
- CAMPAIGN_OVERVIEW.md              brand summary + full ${n}-post schedule table
- PLATFORM_POSTING_GUIDE.md         per-platform publishing playbook (apps steps,
                                    caption limits, link rules, pro tips)
- MASTER_ASSET_POSTING_KIT.md       ready-to-paste captions for the master image
                                    & video, per selected platform
- MASTER_BRAND_BLUEPRINT.md         100% site-accurate brand reference for any AI
- MASTER_ALL_IN_ONE_PROMPT.txt      brand DNA + image & video prompt specs (one doc)
- MASTER_BRAND_COPYWRITING_PROMPT.txt  dedicated TEXT-writing engine prompt
- MASTER_IMAGE_PROMPT.txt           master commercial image prompt
- MASTER_VIDEO_PROMPT.txt           master video reel prompt
- campaign_schedule.csv             import into Buffer / Hootsuite / Metricool
- all_website_screenshots/          every captured page, with a README map
- Day-X_* folders                   one folder per post — your daily units

TODAY'S FIRST 3 ACTIONS
1. Open PLATFORM_POSTING_GUIDE.md and read your platform's section once.
2. Open the Day-1 folder, make its visual, copy its caption.
3. Publish it at today's best time. Momentum beats perfection — start now.
================================================================================`;
}

// ---------------------------------------------------------------------------
// 4. Enriched CAMPAIGN_OVERVIEW.md body
// ---------------------------------------------------------------------------

export function buildCampaignOverview({ strategy, websiteData, posts, selectedPlatforms }) {
  const brand = strategy?.brandName || 'Brand';
  const allPosts = Array.isArray(posts) ? posts : [];

  const selected = (Array.isArray(selectedPlatforms) && selectedPlatforms.length
    ? selectedPlatforms
    : [...new Set(allPosts.map((p) => p.platform))]) || [];
  const platformIds = [...selected, ...allPosts.map((p) => p.platform).filter(Boolean)]
    .map((id) => kbForPlatform(id).id)
    .filter((id, i, a) => a.indexOf(id) === i);

  const perPlatform = platformIds
    .map((id) => {
      const count = allPosts.filter((p) => kbForPlatform(p.platform).id === id).length;
      return `- ${kbForPlatform(id).emoji} **${id}:** ${count} post${count === 1 ? '' : 's'}`;
    })
    .join('\n');

  const fmtCounts = ['Video Reel / Short', 'Carousel Graphic', 'Image Post']
    .map((ct) => {
      const c = allPosts.filter((p) => String(p.contentType || '').includes(ct.split(' ')[0])).length;
      return c ? `- **${ct}:** ${c}` : null;
    })
    .filter(Boolean)
    .join('\n');

  let md = `# ${brand} — Autonomous Multi-Platform Campaign\n\n`;
  md += `**Website:** ${websiteData?.url || websiteData?.domain || '-'}\n`;
  md += `**Industry:** ${strategy?.industry || '-'}\n`;
  md += `**Target Audience:** ${strategy?.targetAudience || '-'}\n`;
  md += `**Brand Voice & Tone:** ${strategy?.brandTone || '-'}\n`;
  md += `**USP:** ${strategy?.uniqueSellingPoint || '-'}\n`;
  md += `**Total Posts:** ${allPosts.length}\n\n`;

  md += `## 📍 Platforms in this campaign\n\n`;
  md += `${platformIds.map((id) => `${kbForPlatform(id).emoji} ${id}`).join('  ·  ')}\n\n`;
  md += `${perPlatform}\n\n`;
  if (fmtCounts) {
    md += `**Formats:**\n${fmtCounts}\n\n`;
  }
  md += `> Where to post what, and the exact app steps per platform? → **PLATFORM_POSTING_GUIDE.md**\n\n`;

  md += `## 🗂 What's inside this ZIP\n\n`;
  md += `| File / Folder | Purpose |\n|---|---|\n`;
  md += `| START_HERE.txt | Read-me-first: the daily loop |\n`;
  md += `| CAMPAIGN_OVERVIEW.md | This file — schedule + brand summary |\n`;
  md += `| PLATFORM_POSTING_GUIDE.md | Per-platform publishing playbook |\n`;
  md += `| MASTER_ASSET_POSTING_KIT.md | Ready-to-paste captions for the master image & video on every platform |\n`;
  md += `| MASTER_BRAND_BLUEPRINT.md | 100% site-accurate brand reference |\n`;
  md += `| MASTER_ALL_IN_ONE_PROMPT.txt | Brand DNA + image & video specs in one doc |\n`;
  md += `| MASTER_BRAND_COPYWRITING_PROMPT.txt | Dedicated text/caption writing engine |\n`;
  md += `| MASTER_IMAGE_PROMPT.txt / MASTER_VIDEO_PROMPT.txt | Master visual prompts |\n`;
  md += `| campaign_schedule.csv | Scheduler import (Buffer / Hootsuite) |\n`;
  md += `| all_website_screenshots/ | Every captured page + README map |\n`;
  md += `| Day-X_* folders | One folder per post (prompt + caption + screenshot) |\n\n`;

  md += `## Campaign Schedule & Content Breakdown\n\n`;
  md += `| Day | Platform | Format | Focus Area | Hook |\n`;
  md += `|---|---|---|---|---|\n`;
  allPosts.forEach((p) => {
    md += `| ${p.day} | ${p.platform} | ${p.contentType} | ${p.toolName} (${p.studio || 'Core'}) | ${(p.hook || '').replace(/\|/g, '-')} |\n`;
  });
  md += `\n---\n*Generated by OmniPost AI — Autonomous URL Marketing Machine*\n`;
  return md;
}

// ---------------------------------------------------------------------------
// 5. MASTER_ASSET_POSTING_KIT.md — the "banane ke BAAD kya" answer.
//    The user makes the master hero image (MASTER_IMAGE_PROMPT.txt) and the
//    master brand reel (MASTER_VIDEO_PROMPT.txt) — then asks: "kis platform
//    pe post karu, aur uske saath KYA LIKHU?" Until now nothing answered
//    that. This kit ships a ready-to-paste caption for BOTH master assets on
//    EVERY selected platform, within each platform's limits, with link rules,
//    best times and hero-level tips. 100% deterministic — no AI call can
//    leave this file empty.
// ---------------------------------------------------------------------------

const cleanTag = (s) =>
  `#${String(s || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;

function masterContext({ strategy, websiteData, posts }) {
  const brand = strategy?.brandName || websiteData?.title || 'Brand';
  const domain = websiteData?.domain || websiteData?.url || '';
  const industry = (strategy?.industry || 'Digital Solutions').trim();
  const usp = (strategy?.uniqueSellingPoint || '').trim();
  const audience = (strategy?.targetAudience || '').trim();
  const studios = (websiteData?.studios || []).filter(Boolean);
  const tools = [...new Set((Array.isArray(posts) ? posts : []).map((p) => p.toolName).filter(Boolean))];
  const showcase = (tools.length ? tools : studios).slice(0, 4);
  const tagList = [
    cleanTag((brand.split(/\s+/)[0] || '').trim()),
    ...industry.split(/[^a-zA-Z0-9]+/).filter((w) => w.length > 3).slice(0, 2).map(cleanTag),
    ...showcase.slice(0, 3).map((t) => cleanTag(String(t).split(/[^a-zA-Z0-9]+/)[0] || '')),
  ].filter((t, i, a) => t.length > 3 && a.indexOf(t) === i);
  return { brand, domain, industry, usp, audience, studios, showcase, tags: tagList };
}

// Deterministic hook rotation — every platform gets a DIFFERENT opening line
// for the same asset, and video hooks differ from image hooks.
const MASTER_HOOKS = {
  image: [
    (c) => `${c.brand} puts your whole ${c.industry} workflow in one place.`,
    (c) => `Meet ${c.brand} — ${c.usp ? c.usp.replace(/\.$/, '') : `the smarter way to run your ${c.industry}`}.`,
    (c) => `Everything you do in ${c.industry}, now on one screen.`,
    (c) => `Stop switching tabs — ${c.brand} does the heavy lifting.`,
    (c) => `${c.brand} is built for ${c.audience || 'teams that move fast'}.`,
    (c) => `One dashboard. Zero chaos. That's ${c.brand}.`,
  ],
  video: [
    (c) => `Watch ${c.brand} work — this is your new ${c.industry} routine.`,
    (c) => `60 seconds inside ${c.brand} will save you hours every week.`,
    (c) => `From zero to done — that's how ${c.brand} feels.`,
    (c) => `This is what a smarter ${c.industry} workflow looks like.`,
    (c) => `${c.brand} in motion — see it before you believe it.`,
    (c) => `No scripts, no cuts — just ${c.brand} doing real work.`,
  ],
};

const masterHook = (c, kind, platformId) =>
  MASTER_HOOKS[kind][(String(platformId).length + (kind === 'video' ? 3 : 0)) % MASTER_HOOKS[kind].length](c);

// Per-platform READY-TO-PASTE captions for the two master assets.
// Every builder returns plain text the user can copy 1:1.
const MASTER_CAPTIONS = {
  Instagram: {
    image: (c) => `${masterHook(c, 'image', 'Instagram')}

${c.usp || `${c.brand} brings your ${c.industry} work into one clean, fast dashboard.`}

Inside ${c.brand}:
${c.showcase.map((t) => `✅ ${t}`).join('\n') || '✅ Everything you need, nothing you don’t'}

No installs. No learning curve. Open it and go.

🔗 Link in bio — ${c.domain}

${c.tags.slice(0, 5).join(' ')}`,
    video: (c) => `${masterHook(c, 'video', 'Instagram')} 👀

${c.usp ? `${c.usp.replace(/\.$/, '')}.` : `One dashboard for your entire ${c.industry} stack.`}

Follow ${c.brand} for weekly ${c.industry} shortcuts — new demo every week.

🔗 Full site in bio — ${c.domain}

${c.tags.slice(0, 4).join(' ')}`,
  },
  LinkedIn: {
    image: (c) => `${masterHook(c, 'image', 'LinkedIn')}

Most teams run their ${c.industry} work across 4–6 different tools — and pay for it in lost hours and context switching.

${c.brand} consolidates it into a single workspace:${c.showcase.length ? ` ${c.showcase.join(', ')}.` : ' everything in one place.'}

If your week is full of tool juggling, this is worth five minutes of your time.

🔗 Website link in the first comment.

${c.tags.slice(0, 4).join(' ')}`,
    video: (c) => `${masterHook(c, 'video', 'LinkedIn')}

We recorded a short walkthrough of ${c.brand} — no cuts, no script polish. Just the real workflow:${c.showcase.length ? ` ${c.showcase[0]}, end to end.` : ' start to finish.'}

Teams lose real hours every week to switching between ${c.industry} tools. Consolidating that stack into one place is the simplest productivity fix we know.

Full walkthrough + access: link in the first comment 👇

${c.tags.slice(0, 3).join(' ')}`,
  },
  'Twitter/X': {
    image: (c) => `${masterHook(c, 'image', 'Twitter/X')}

${c.showcase.length ? `${c.showcase.slice(0, 3).join(' · ')} — all in one.` : `Your ${c.industry} stack, unified.`}

Try it → ${c.domain}

${c.tags.slice(0, 2).join(' ')}`,
    video: (c) => [
      `1/ ${masterHook(c, 'video', 'Twitter/X')} Here's a 30-second look 👇`,
      `2/ What you're seeing: ${c.brand} running ${c.showcase.length ? c.showcase.slice(0, 3).join(', ') : `the full ${c.industry} workflow`} in one dashboard. No installs, no setup marathon.`,
      `3/ Try it free → ${c.domain} ${c.tags.slice(0, 2).join(' ')}`,
    ].join('\n\n---\n\n'),
  },
  TikTok: {
    image: (c) => `${masterHook(c, 'image', 'TikTok')}

POV: your ${c.industry} work finally lives in one place ${c.tags.slice(0, 4).join(' ')}`,
    video: (c) => `${masterHook(c, 'video', 'TikTok')} ${c.tags.slice(0, 4).join(' ')}`,
  },
  'YouTube Shorts': {
    image: (c) => `TITLE: ${c.brand} — one dashboard for your ${c.industry} work

COMMUNITY POST CAPTION:
${masterHook(c, 'image', 'YouTube Shorts')}
${c.tags.slice(0, 3).join(' ')}
${c.domain}`,
    video: (c) => `TITLE: ${fmtLimit(`${masterHook(c, 'video', 'YouTube Shorts')}`, 97)}

DESCRIPTION:
${masterHook(c, 'video', 'YouTube Shorts')}

${c.brand} — ${c.usp || `one clean dashboard for your entire ${c.industry} stack`}.
Try it: ${c.domain ? `https://${c.domain}` : '(your site link)'}

${c.tags.slice(0, 3).join(' ')}`,
  },
  Facebook: {
    image: (c) => `${masterHook(c, 'image', 'Facebook')}

${c.usp || `${c.brand} brings your ${c.industry} work together in one clean, fast dashboard — so you spend time doing, not switching.`}

${c.showcase.length ? `Inside: ${c.showcase.join(', ')}.` : ''}

Which one would you try first? Tell us in the comments 👇

🔗 Website link in the first comment.

${c.tags.slice(0, 2).join(' ')}`,
    video: (c) => `${masterHook(c, 'video', 'Facebook')}

A quick real-time look at ${c.brand}${c.showcase.length ? ` — ${c.showcase[0]} and more` : ''}, all running in one dashboard.

Tag someone who's still juggling five tabs for this 😄

🔗 Website link in the first comment.

${c.tags.slice(0, 2).join(' ')}`,
  },
  generic: {
    image: (c) => `${masterHook(c, 'image', 'Generic')}

${c.usp || `${c.brand} brings your ${c.industry} work into one clean, fast dashboard.`}

${c.showcase.length ? `Inside: ${c.showcase.join(', ')}.` : ''}

Learn more → ${c.domain}

${c.tags.slice(0, 3).join(' ')}`,
    video: (c) => `${masterHook(c, 'video', 'Generic')}

${c.usp || `A quick look inside ${c.brand} — your whole ${c.industry} workflow, one dashboard.`}

Watch, then try it → ${c.domain}

${c.tags.slice(0, 3).join(' ')}`,
  },
};

const MASTER_BEST_TIME = {
  Instagram: '11 AM–1 PM or 7–9 PM (local audience time)',
  LinkedIn: 'Tue–Thu, 8–10 AM',
  'Twitter/X': 'Weekdays, 9–11 AM',
  TikTok: '6–10 PM',
  'YouTube Shorts': '12–3 PM or 7–10 PM',
  Facebook: '1–4 PM',
};

const MASTER_HERO_TIP = {
  Instagram: 'Pin this post to your profile grid for launch week, and re-share it to Stories the next day with a “New” sticker — hero posts deserve two lives.',
  LinkedIn: 'After posting, add this to your profile’s Featured section — it keeps working as a first impression for weeks.',
  'Twitter/X': 'Post the video first, then pin it to your profile; quote-tweet it 24h later with an extra insight instead of posting a duplicate.',
  TikTok: 'Choose a cover frame with the brand name in big text — TikTok profiles are search-driven, and a clear cover wins clicks.',
  'YouTube Shorts': 'Pin a comment with your site link right after upload — the pinned comment gets the real clicks.',
  Facebook: 'Pin the launch post to the top of your page during launch week, and re-share it to any Groups you moderate.',
  generic: 'Pin or feature this post wherever your platform allows — hero assets should stay visible all launch week.',
};

export function buildMasterAssetPostingKit({ strategy, websiteData, posts, selectedPlatforms }) {
  const c = masterContext({ strategy, websiteData, posts });
  const allPosts = Array.isArray(posts) ? posts : [];

  const selected = (Array.isArray(selectedPlatforms) && selectedPlatforms.length
    ? selectedPlatforms
    : [...new Set(allPosts.map((p) => p.platform))]) || [];
  const platformIds = [...selected, ...allPosts.map((p) => p.platform).filter(Boolean)]
    .map((p) => kbForPlatform(p).id)
    .filter((id, i, a) => a.indexOf(id) === i);
  // Never ship a thin kit: if nothing is derivable, fall back to the app's
  // default platform set (the ZIP must ALWAYS answer "kya likhna hai").
  if (!platformIds.length) {
    ['Instagram', 'LinkedIn', 'Twitter/X', 'TikTok'].forEach((p) => platformIds.push(kbForPlatform(p).id));
  }

  const L = [];
  L.push(`================================================================================
MASTER ASSET POSTING KIT — the visuals are done. Now WHAT DO YOU WRITE?
Brand: ${c.brand}${c.domain ? ` (${c.domain})` : ''}
================================================================================

ANSWER FIRST — READ THIS (30 seconds)
You made the master image and/or the master video. Do NOT just upload the
file and hit post — on EVERY platform a post needs TEXT with it: a caption,
hashtags, and the link placed the right way (bio / first comment /
description — depends on the platform). This file contains a READY-TO-PASTE
caption for BOTH master assets on each platform you selected. Copy, paste,
publish. Nothing left to figure out.

WHAT ARE THE "MASTER ASSETS"? (2 hero files)
1. MASTER IMAGE — the big brand hero visual you made with
   MASTER_IMAGE_PROMPT.txt (attach your screenshots in the AI chat for a
   1:1 match).
2. MASTER VIDEO — the brand reel you made with MASTER_VIDEO_PROMPT.txt
   (use your hero image or desktop.jpg as the start frame).
These two are BRAND-LEVEL posts — different from the per-day posts (those
already have captions inside their own Day-X folders). This kit is ONLY for
the two master assets.

SUGGESTED LAUNCH WEEK (simple + effective)
- Day 1, evening: master video → TikTok + Instagram Reels + YouTube Shorts
  (the SAME 9:16 file works on all three — post natively on each).
- Day 2, morning: master image → LinkedIn (professional audience) + Facebook.
- Day 2, same morning: master video (or its thread version) → X, then PIN it.
- Day 3: re-share the image to Instagram Stories + pin the best performer
  on each platform. Done — your launch looks everywhere at once.`);

  platformIds.forEach((platformId) => {
    const kb = kbForPlatform(platformId);
    const capSet = MASTER_CAPTIONS[platformId] || MASTER_CAPTIONS.generic;
    const isX = platformId === 'Twitter/X';

    L.push('');
    L.push('================================================================================');
    L.push(`${kb.emoji} ${kb.id.toUpperCase()}`);
    L.push('================================================================================');
    L.push('');
    L.push(`FORMAT: image → ${kb.formats.image}${platformId === 'LinkedIn' ? ' (crop your hero to 1:1 or 4:5)' : ''}`);
    L.push(`        video → ${kb.formats.video}`);
    L.push(`BEST TIME: ${MASTER_BEST_TIME[platformId] || 'mornings on weekdays works safest'}`);
    L.push('');
    L.push(`▶ CAPTION — MASTER IMAGE (ready-to-paste):`);
    L.push('```');
    L.push(capSet.image(c));
    L.push('```');
    L.push('');
    L.push(`▶ CAPTION — MASTER VIDEO${isX ? ' (THREAD — 3 posts)' : ' (ready-to-paste)'}:`);
    L.push('```');
    L.push(capSet.video(c));
    L.push('```');
    L.push('');
    L.push(`LINK RULE on ${kb.id}: ${kb.linkRule}`);
    L.push(`CAPTION LIMIT: ${kb.captionLimit}`);
    L.push(`HERO TIP: ${MASTER_HERO_TIP[platformId] || MASTER_HERO_TIP.generic}`);
  });

  L.push('');
  L.push('================================================================================');
  L.push('♻ REPOST WITHOUT REPEATING (alternate opening lines)');
  L.push('================================================================================');
  L.push('');
  L.push('Re-posting the same hero asset later? Keep the caption, swap ONLY line 1');
  L.push('with one of these — your feed never looks repetitive:');
  L.push('');
  L.push('MASTER IMAGE — alternates:');
  MASTER_HOOKS.image.slice(1).forEach((h, i) => L.push(`  ${i + 1}. ${h(c)}`));
  L.push('');
  L.push('MASTER VIDEO — alternates:');
  MASTER_HOOKS.video.slice(1).forEach((h, i) => L.push(`  ${i + 1}. ${h(c)}`));
  L.push('');
  L.push('================================================================================');
  L.push('✅ 60-SECOND FINAL CHECK (before you hit post)');
  L.push('================================================================================');
  L.push('');
  L.push('1. Visual looks brand-accurate (you attached the screenshots in the prompt)?');
  L.push('2. Caption pasted from THIS kit for the right asset + right platform?');
  L.push('3. Link placed per the platform’s rule (bio / first comment / description)?');
  L.push('4. Posting inside the platform’s best-time window?');
  L.push('5. Pin/feature the post after it publishes (see HERO TIP)?');
  L.push('');
  L.push('*Master assets, professional captions — OmniPost AI.*');

  return L.join('\n');
}
