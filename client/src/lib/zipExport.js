/**
 * zipExport.js — One-click full campaign ZIP, 100% client-side (JSZip).
 *
 * Structure:
 *   00_README_HOW_TO_USE.txt
 *   01_MASTER_PROMPTS/ master-brand.md · master-image.md · master-video.md · brand-blueprint.md
 *   02_DAY_WISE_PLAN/ plan.md · schedule.csv · posts/post-XX-*.txt (caption + prompts + script)
 *   03_AI_IMAGES/ post-XX-ai.jpg · post-XX-branded.png
 *   04_ALL_WEBSITE_SCREENSHOTS/ desktop.jpg · section-N.jpg
 *   05_CAMPAIGN_SUMMARY/ strategy.json
 *   06_CAROUSELS/ post-XX/slide-N.png (branded, ready-to-post)
 */
import JSZip from 'jszip';
import { proxyImageBlob } from './net.js';
import { renderFullCarousel } from './carousel.js';

function slug(s = '') {
  return String(s).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'post';
}

export function buildDayWisePlanMarkdown(strategy, posts, websiteData) {
  const byDay = {};
  posts.forEach((p) => {
    (byDay[p.day] = byDay[p.day] || []).push(p);
  });
  const days = Object.keys(byDay).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));

  let md = `# ${strategy.brandName} — ${days.length}-Day Social Media Campaign\n\n`;
  md += `**Website:** ${websiteData.url}\n**Industry:** ${strategy.industry}\n**Audience:** ${strategy.targetAudience}\n**Tone:** ${strategy.brandTone}\n**USP:** ${strategy.uniqueSellingPoint}\n\n`;
  md += `**Why this plan:** ${strategy.rationale}\n\n---\n`;

  for (const day of days) {
    md += `\n## ${day}\n`;
    for (const p of byDay[day]) {
      md += `\n### ${p.contentType} — ${p.toolName} (${p.studio})\n`;
      md += `- **Platform:** ${p.platform}  \n- **Best time:** ${p.bestTime}\n`;
      md += `- **Hook:** ${p.hook}\n`;
      md += `\n**Caption:**\n\n\`\`\`\n${p.caption}\n${p.hashtags.join(' ')}\n\`\`\`\n`;
      md += `\n**AI Image Prompt (unique per post):**\n\n\`\`\`\n${p.imagePrompt || p.aiImagePrompt}\n\`\`\`\n`;
      if (p.videoScript) {
        md += `\n**Video Script (${p.videoScript.duration}, ${p.videoScript.audioVibe}):**\n\n`;
        for (const s of p.videoScript.scenes) {
          md += `#### Scene ${s.sceneNumber} (${s.time})\n- Visual: ${s.visualDirection}\n- On-screen text: ${s.onScreenText}\n- Voiceover: ${s.voiceoverAudio}\n`;
        }
      }
      md += `\n---\n`;
    }
  }
  return md;
}

export function buildScheduleCsv(posts) {
  const clean = (s) => `"${String(s || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
  const rows = [['Day', 'Platform', 'ContentType', 'Studio', 'Tool', 'Hook', 'Caption', 'Hashtags', 'BestTime', 'ImageURL', 'VideoScript']];
  posts.forEach((p) => {
    rows.push([
      p.day, p.platform, p.contentType, p.studio, p.toolName, p.hook, p.caption,
      p.hashtags.join(' '), p.bestTime, p.generatedImageUrl || '', p.videoScript ? 'yes' : 'no',
    ].map(clean));
  });
  return rows.map((r) => r.join(',')).join('\n');
}

function readme(strategy, websiteData, posts) {
  return `OMNIPOST AI — FULL MARKETING KIT
==================================
Brand   : ${strategy.brandName}
Website : ${websiteData.url}
Posts   : ${posts.length} over ${strategy.recommendedDays || ''} days
Engine  : Browser standalone (no server) ${strategy.engine ? '+ ' + strategy.engine + ' strategy' : ''}

WHAT'S INSIDE
-------------
01_MASTER_PROMPTS/      Copy-paste prompts that recreate your brand's marketing in ANY AI tool
02_DAY_WISE_PLAN/       plan.md (complete calendar) + schedule.csv (import to Sheets/Notion)
02_DAY_WISE_PLAN/posts/ One .txt per post: caption, hashtags, image prompt, video script
03_AI_IMAGES/           Ready AI artwork (post-XX-ai.jpg) + branded post cards (post-XX-branded.png)
04_ALL_WEBSITE_SCREENSHOTS/  Live captures of the site — attach these in ChatGPT/Gemini/Midjourney for 100% brand-accurate visuals
05_CAMPAIGN_SUMMARY/    strategy.json
06_CAROUSELS/           Ready-to-post branded carousel slides (PNG) for each carousel post

HOW TO USE (3 STEPS)
--------------------
1. Open 01_MASTER_PROMPTS/master-brand.md — copy it into ChatGPT / Gemini / Claude. Ask for more posts, ad copy, emails...
2. For visuals: copy a post's image prompt from 02_DAY_WISE_PLAN/posts/, ATTACH the matching screenshot(s) from 04_ALL_WEBSITE_SCREENSHOTS/, paste into ChatGPT (DALL-E), Gemini, Midjourney or Leonardo.
3. For video: copy 01_MASTER_PROMPTS/master-video.md (or the post's video script) into Higgsfield / Runway Gen-3 / Luma / Sora / Kling — upload the screenshot as the START FRAME.

Everything works without any login or server. Regenerate anytime at the app.
`;
}

export async function buildCampaignZip({ strategy, websiteData, posts, masterBrandPrompt, masterImagePrompt, masterVideoPrompt, masterBlueprint }) {
  const zip = new JSZip();

  zip.file('00_README_HOW_TO_USE.txt', readme(strategy, websiteData, posts));

  const prompts = zip.folder('01_MASTER_PROMPTS');
  prompts.file('master-brand.md', masterBrandPrompt || '');
  prompts.file('master-image.md', masterImagePrompt || '');
  prompts.file('master-video.md', masterVideoPrompt || '');
  prompts.file('brand-blueprint.md', masterBlueprint || '');

  const plan = zip.folder('02_DAY_WISE_PLAN');
  plan.file('plan.md', buildDayWisePlanMarkdown(strategy, posts, websiteData));
  plan.file('schedule.csv', buildScheduleCsv(posts));
  const postsDir = plan.folder('posts');
  posts.forEach((p, i) => {
    const n = String(i + 1).padStart(2, '0');
    let txt = `${p.day} — ${p.contentType} — ${p.platform} — ${p.bestTime}\n`;
    txt += `Studio: ${p.studio} | Tool: ${p.toolName}\n\nHOOK:\n${p.hook}\n\nCAPTION:\n${p.caption}\n\n${p.hashtags.join(' ')}\n\nCTA:\n${p.callToAction}\n`;
    txt += `\n==== AI IMAGE PROMPT (UNIQUE per post — copy into ChatGPT/Gemini/Midjourney + attach screenshots) ====\n${p.imagePrompt || p.aiImagePrompt}\n`;
    if (p.aiVideoPrompt) txt += `\n==== AI VIDEO PROMPT (copy into Higgsfield/Runway/Luma/Sora) ====\n${p.aiVideoPrompt}\n`;
    if (p.videoScript) {
      txt += `\n==== VIDEO SCRIPT (${p.videoScript.duration}) ====\n`;
      p.videoScript.scenes.forEach((s) => {
        txt += `\nScene ${s.sceneNumber} (${s.time})\n  Visual : ${s.visualDirection}\n  Text   : ${s.onScreenText}\n  Voice  : ${s.voiceoverAudio}\n`;
      });
    }
    postsDir.file(`post-${n}-${slug(p.toolName)}.txt`, txt);
  });

  const images = zip.folder('03_AI_IMAGES');
  const shots = zip.folder('04_ALL_WEBSITE_SCREENSHOTS');

  // Real Gemini-generated media (from the Visualize All flow) — data URLs
  await Promise.all(
    posts.map(async (p, i) => {
      const n = String(i + 1).padStart(2, '0');
      if (p.__aiImgUrl) {
        try {
          const b = await (await fetch(p.__aiImgUrl)).blob();
          images.file(`post-${n}-gemini.png`, b);
        } catch { /* keep exporting */ }
      }
      if (p.__aiVidUrl) {
        try {
          const v = await (await fetch(p.__aiVidUrl)).blob();
          const videos = zip.folder('08_AI_VIDEOS');
          videos.file(`post-${n}-veo.mp4`, v);
        } catch { /* keep exporting */ }
      }
    })
  );

  // Fetch generated AI images via proxy chain (tolerant — keep going on failure)
  await Promise.all(
    posts.map(async (p, i) => {
      const n = String(i + 1).padStart(2, '0');
      const tries = [];
      if (p.cardDataUrl) {
        try {
          const b = await (await fetch(p.cardDataUrl)).blob();
          images.file(`post-${n}-branded.png`, b);
        } catch {}
      }
      if (p.rawAiUrl) tries.push(['post-XX-ai.jpg', p.rawAiUrl, `post-${n}-ai.jpg`]);
      if (p.generatedImageUrl && p.generatedImageUrl !== p.rawAiUrl) {
        tries.push(['gen', p.generatedImageUrl, `post-${n}-image.jpg`]);
      }
      for (const [, url, name] of tries) {
        const blob = await proxyImageBlob(url, { timeout: 45000 }).catch(() => null);
        if (blob) images.file(name, blob);
      }
    })
  );

  await Promise.all(
    (websiteData.capturedScreenshots || websiteData.screenshots || []).map(async (s, i) => {
      const name = s.localName || (i === 0 ? 'desktop.jpg' : `section-${i}.jpg`);
      const blob = await proxyImageBlob(s.webUrl, { timeout: 45000 }).catch(() => null);
      if (blob) shots.file(name, blob);
    })
  );

  const summary = zip.folder('05_CAMPAIGN_SUMMARY');
  summary.file('strategy.json', JSON.stringify({ strategy, websiteData: { ...websiteData, rawSummary: undefined } }, null, 2));

  // 06_CAROUSELS — branded slide decks for every carousel-type post
  const carouselPosts = posts.filter((p) => !p.videoScript);
  if (carouselPosts.length) {
    const carouselRoot = zip.folder('06_CAROUSELS');
    for (let ci = 0; ci < carouselPosts.length; ci++) {
      const p = carouselPosts[ci];
      const n = String(posts.indexOf(p) + 1).padStart(2, '0');
      const pdir = carouselRoot.folder(`post-${n}-${slug(p.toolName)}`);
      try {
        const slides = await renderFullCarousel(p, strategy, websiteData);
        for (let si = 0; si < slides.length; si++) {
          const b = await (await fetch(slides[si])).blob();
          pdir.file(`slide-${String(si + 1).padStart(2, '0')}.png`, b);
        }
      } catch {
        /* carousel render failed for this post — keep exporting */
      }
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
