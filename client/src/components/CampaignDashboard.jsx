import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';
import { 
  Sparkles, 
  Calendar, 
  Download, 
  Copy, 
  Check, 
  Video, 
  Image as ImageIcon, 
  Share2, 
  Layers, 
  Filter, 
  FileSpreadsheet, 
  Archive,
  RefreshCw,
  ExternalLink,
  Play,
  ChevronDown,
  ChevronUp,
  GalleryHorizontal,
  AlertTriangle,
  Globe,
  Wand2,
  Loader2,
  Clapperboard
} from 'lucide-react';
import { generateLanguagePack } from '../lib/aiClient.js';
import { generateAIImage, generateAIVideo, cleanPrompt } from '../lib/aiMedia.js';
import VideoReelModal from './VideoReelModal.jsx';
import CarouselModal from './CarouselModal.jsx';
import MasterStudioModal from './MasterStudioModal.jsx';
import { renderFullCarousel } from '../lib/carousel.js';
import { API_BASE } from '../config.js';
import { proxyImageBlob } from '../lib/net.js';

export function getUnifiedScreenshots(websiteData) {
  if (!websiteData) return [];
  const list = [];
  const seen = new Set();

  const addShot = (shot) => {
    if (!shot) return;
    let url = typeof shot === 'string' ? shot : (shot.webUrl || shot.screenshotUrl || shot.url || '');
    if (!url || typeof url !== 'string') return;

    let fn = '';
    if (typeof shot === 'object' && shot.fileName) {
      fn = shot.fileName;
    } else {
      const parts = url.split('/');
      fn = parts[parts.length - 1].split('?')[0];
    }
    if (!fn || !fn.includes('.')) {
      fn = `screenshot_${list.length + 1}.jpg`;
    }

    const key = url.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      list.push({
        title: (typeof shot === 'object' && (shot.title || shot.name)) || fn,
        studio: (typeof shot === 'object' && shot.studio) || 'Core Offering',
        type: (typeof shot === 'object' && shot.type) || 'screenshot',
        webUrl: url,
        fileName: fn,
        description: (typeof shot === 'object' && shot.description) || 'Captured Website UI'
      });
    }
  };

  // 1. Primary Desktop Hero
  if (websiteData.screenshotUrl) {
    addShot({
      title: 'Main Desktop Interface',
      studio: 'Homepage',
      type: 'desktop_hero',
      webUrl: websiteData.screenshotUrl,
      fileName: 'desktop.jpg',
      description: 'Full high-res viewport capture of primary landing screen'
    });
  }

  // 2. Mobile Responsive Viewport
  if (websiteData.mobileScreenshotUrl) {
    addShot({
      title: 'Mobile Viewport (9:16)',
      studio: 'Mobile UX',
      type: 'mobile_hero',
      webUrl: websiteData.mobileScreenshotUrl,
      fileName: 'mobile.jpg',
      description: 'Mobile 9:16 responsive portrait viewport capture'
    });
  }

  // 3. Captured Screenshots / Page Sections / Tested tools
  const captured = websiteData.capturedScreenshots || websiteData.screenshots || [];
  captured.forEach((s) => addShot(s));

  // 4. Discovered tools with inputScreenshotUrl, outputScreenshotUrl, and screenshotUrl
  (websiteData.discoveredTools || []).forEach((t) => {
    if (t.inputScreenshotUrl) {
      addShot({
        title: `${t.name} (Input State)`,
        studio: t.studio || 'Tools Suite',
        type: 'tool_input_screenshot',
        webUrl: t.inputScreenshotUrl,
        fileName: t.inputScreenshotUrl.split('/').pop() || `tool_${t.name.replace(/[^a-zA-Z0-9]/g, '_')}_input.jpg`,
        description: `Autonomous live input test of ${t.name} (parameters/files loaded)`
      });
    }
    if (t.outputScreenshotUrl) {
      addShot({
        title: `${t.name} (Live Output)`,
        studio: t.studio || 'Tools Suite',
        type: 'tool_output_screenshot',
        webUrl: t.outputScreenshotUrl,
        fileName: t.outputScreenshotUrl.split('/').pop() || `tool_${t.name.replace(/[^a-zA-Z0-9]/g, '_')}_output.jpg`,
        description: `Autonomous live execution output of ${t.name} (result rendered)`
      });
    }
    if (t.screenshotUrl) {
      addShot({
        title: t.name,
        studio: t.studio || 'Tools Suite',
        type: 'tool_screenshot',
        webUrl: t.screenshotUrl,
        fileName: t.screenshotUrl.split('/').pop() || `tool_${t.name.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`,
        description: t.description || `Autonomous live test of ${t.name}`
      });
    }
  });

  return list;
}

export default function CampaignDashboard({ 
  posts, 
  strategy, 
  websiteData, 
  masterBrandPrompt,
  masterImagePrompt,
  masterVideoPrompt,
  masterBlueprint,
  higgsfieldApiKey, 
  geminiApiKey = '',
  onRegenerate,
  isGeneratingCampaign = false,
  onReset 
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedVideoPost, setSelectedVideoPost] = useState(null);
  const [copiedPostId, setCopiedPostId] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedMasterPrompt, setCopiedMasterPrompt] = useState(false);
  const [copiedMasterImage, setCopiedMasterImage] = useState(false);
  const [copiedMasterVideo, setCopiedMasterVideo] = useState(false);
  const [copiedMasterBlueprint, setCopiedMasterBlueprint] = useState(false);
  const [isMasterStudioOpen, setIsMasterStudioOpen] = useState(false);
  const [copiedPromptKey, setCopiedPromptKey] = useState(null);
  const [expandedPromptPostId, setExpandedPromptPostId] = useState(null);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'calendar'
  const [mediaViewMode, setMediaViewMode] = useState({}); // { [postId]: 'poster' | 'ai' | 'screenshot' }
  const [carouselPost, setCarouselPost] = useState(null);
  const [langPack, setLangPack] = useState(null);
  const [langState, setLangState] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [langError, setLangError] = useState('');
  const [copiedLang, setCopiedLang] = useState('');

  // === REAL AI media generation (Gemini image models + Google Veo) ===
  // aiMedia[postId] = { phase, imgUrl, imgModel, imgError, vidUrl, vidModel, vidError, status }
  // Prompts-first: every post always ships a copy-paste prompt; manual per-post
  // generation stays available for keyed users — NO mass auto-queue anymore.
  const [aiMedia, setAiMedia] = useState({});
  const aiMediaRef = useRef({});
  const inFlightRef = useRef({});

  const updateMedia = (postId, patch) => {
    aiMediaRef.current = { ...aiMediaRef.current, [postId]: { ...(aiMediaRef.current[postId] || {}), ...patch } };
    setAiMedia(aiMediaRef.current);
  };

  const handleGenerateAiImage = async (post, { skipIfDone = false } = {}) => {
    if (inFlightRef.current[`${post.id}:img`]) return false;
    if (skipIfDone && aiMediaRef.current[post.id]?.imgUrl) return true;
    if (!geminiApiKey) {
      updateMedia(post.id, { phase: 'img-error', imgError: 'Add your free Gemini API key in Settings (⚙️) → API Keys — images then render right here, one tap.' });
      return false;
    }
    inFlightRef.current[`${post.id}:img`] = true;
    updateMedia(post.id, { phase: 'img-loading', imgError: '', status: 'Painting with Gemini…' });
    try {
      const prompt = cleanPrompt(post.geminiImagePrompt || post.imagePrompt || post.aiImagePrompt || '');
      const { dataUrl, model } = await generateAIImage({
        apiKey: geminiApiKey,
        prompt,
        aspectRatio: '4:5',
        onStatus: (s) => updateMedia(post.id, { status: s }),
      });
      updateMedia(post.id, { phase: 'img-done', imgUrl: dataUrl, imgModel: model, status: '' });
      return true;
    } catch (err) {
      const raw = err.message || 'Image generation failed';
      updateMedia(post.id, { phase: 'img-error', imgError: `${raw} — no worries: Copy Image Prompt above and paste it into the Gemini app / ChatGPT / Midjourney to make this visual yourself.` });
      return false;
    } finally {
      delete inFlightRef.current[`${post.id}:img`];
    }
  };

  const handleGenerateAiVideo = async (post) => {
    if (inFlightRef.current[`${post.id}:vid`]) return;
    if (!geminiApiKey) {
      updateMedia(post.id, { phase: 'vid-error', vidError: 'Add your free Gemini API key in Settings (⚙️) first. Note: Veo AI video needs a billed key — the built-in Reel renderer stays 100% free.' });
      return;
    }
    inFlightRef.current[`${post.id}:vid`] = true;
    updateMedia(post.id, { phase: 'vid-loading', vidError: '', status: 'Submitting to Veo…' });
    try {
      const prompt = cleanPrompt(post.geminiVideoPrompt || post.aiVideoPrompt || '');
      const { dataUrl, model } = await generateAIVideo({
        apiKey: geminiApiKey,
        prompt,
        aspectRatio: '9:16',
        onStatus: (s) => updateMedia(post.id, { status: s }),
      });
      updateMedia(post.id, { phase: 'vid-done', vidUrl: dataUrl, vidModel: model, status: '' });
    } catch (err) {
      updateMedia(post.id, { phase: 'vid-error', vidError: err.message || 'Video generation failed' });
    } finally {
      delete inFlightRef.current[`${post.id}:vid`];
    }
  };

  // Filter posts
  const filteredPosts = posts.filter(post => {
    if (activeTab === 'all') return true;
    if (activeTab === 'videos') return post.contentType?.includes('Video');
    if (activeTab === 'carousels') return post.contentType?.includes('Carousel');
    if (activeTab === 'images') return !post.contentType?.includes('Video');
    return post.platform.toLowerCase().includes(activeTab.toLowerCase());
  });

  const screenshots = getUnifiedScreenshots(websiteData);
  const shotListStr = screenshots.slice(0, 10).map((s) => {
    return `📸 [${s.fileName}] -> ${s.title} (${s.description})`;
  }).join('\n') || '📸 [desktop.jpg] -> Full landing page & hero\n📸 [mobile.jpg] -> Responsive mobile interface';

  const effectiveMasterImagePrompt = masterImagePrompt || `================================================================================
🌟 MASTER BRAND AI IMAGE GENERATION PROMPT (ENTIRE WEBSITE & HERO COMMERCIAL ART)
================================================================================
TARGET AI ENGINES: ChatGPT (GPT-4o DALL-E 3), Google Gemini (Imagen 3), Midjourney v6, Leonardo AI

[CRITICAL INSTRUCTIONS FOR 100% "HUBAHU" ACCURATE BRAND VISUALS]:
1. Before generating the visual, ATTACH the following screenshots from the /all_website_screenshots/ folder directly into your AI chat:
${shotListStr}
2. Instruct the AI: "Use the attached screenshots as strict visual reference for the user interface, brand styling, color palette, and layout. Recreate this authentic UI faithfully within the 3D showcase below."

--------------------------------------------------------------------------------
[PROMPT TO COPY & PASTE INTO CHATGPT / GEMINI / MIDJOURNEY]:
--------------------------------------------------------------------------------
"Create a breathtaking, ultra-high-definition commercial brand advertising hero visual for '${strategy?.brandName || 'Brand'}' (${websiteData?.domain || ''}).

BRAND DNA & MISSION:
- Brand: ${strategy?.brandName || 'Brand'}
- Industry: ${strategy?.industry || 'Technology'}
- Value Proposition: ${strategy?.uniqueSellingPoint || ''}
- Tone & Aesthetic: ${strategy?.brandTone || 'Ultra-modern, authoritative, premium tech aesthetic'}

COMPLETE PLATFORM CAPABILITIES (REPRESENT ALL OF THESE MODULES):
${(websiteData?.studios || []).map(s => `- ${s}`).join('\n') || '- Complete enterprise offerings'}

ART DIRECTION & 3D COMPOSITION:
- Centerpiece: A multi-layered, floating glassmorphic futuristic workstation displaying the real live web platform (matching the attached reference screenshots with exact typography and UI structure).
- Orbiting Modular Displays: Sleek isometric glowing UI panels floating around the central workstation, each spotlighting key platform suites.
- Visual Details: Neon cybernetic edge-lighting, subtle holographic data charts, ultra-crisp glass reflections, dynamic light trails connecting the modules.
- Environment & Lighting: Dark obsidian luxury studio background with vibrant brand glow, cinematic volumetric rim lighting, ray-traced shadows, 8k resolution, photorealistic Unreal Engine 5 render style.
- Quality: Commercial advertising benchmark, crisp depth of field, photorealistic textures, zero distortion."
================================================================================`;

  const effectiveMasterVideoPrompt = masterVideoPrompt || `================================================================================
🎬 MASTER BRAND AI VIDEO REEL PROMPT (VIRAL COMMERCIAL & ECOSYSTEM SHOWCASE)
================================================================================
TARGET AI ENGINES: Higgsfield AI, Runway Gen-3 Alpha, Luma Dream Machine, OpenAI Sora, Kling AI, Hailuo

[CRITICAL INSTRUCTIONS FOR 100% "HUBAHU" ACCURATE BRAND REEL]:
1. Starting Frame / Image-to-Video Source: Upload 'desktop.jpg' or the generated visual 'visual_creative.png' as the initial input frame into the video AI tool.
2. Keyframe References: Set 'section-1.jpg' or tool screenshot as mid-transition keyframe.
3. This prompt instructs the AI to animate the real interface without hallucinating generic filler content.

--------------------------------------------------------------------------------
[PROMPT TO COPY & PASTE INTO HIGGSFIELD / RUNWAY / LUMA / SORA]:
--------------------------------------------------------------------------------
"A cinematic, viral 30-second commercial brand showcase reel for '${strategy?.brandName || 'Brand'}' (${websiteData?.domain || ''}). Format: 9:16 vertical short-form reel (or 16:9 widescreen commercial).

CINEMATIC SCENE PROGRESSION:
- Scene 1 (0:00 - 0:04) THE VIRAL HOOK:
  Fast dynamic push-in camera into the sleek interface from the uploaded reference frame. Glowing digital shockwave ripples across the screen. On-screen bold typography: 'The new standard in ${strategy?.industry || 'Technology'}.'
- Scene 2 (0:04 - 0:12) COMPLETE ECOSYSTEM WALKTHROUGH:
  Snappy seamless 3D camera pan touring all key suites: ${(websiteData?.studios || []).join(' ➔ ') || 'Platform Ecosystem'}. Holographic data points light up as modules seamlessly activate with instant 0-second latency.
- Scene 3 (0:12 - 0:20) LIVE FEATURE DEMONSTRATION:
  Macro close-up on live interactive capabilities. High-speed execution, fluid particle transitions, crisp glass reflections, demonstrating effortless speed and enterprise-grade reliability.
- Scene 4 (0:20 - 0:26) AUTHORITY & BUSINESS IMPACT:
  Epic wide pull-back showing global scale, seamless collaboration, trusted compliance, and unstoppable growth.
- Scene 5 (0:26 - 0:30) FINAL CALL-TO-ACTION:
  Cinematic deceleration onto a glowing 3D obsidian emblem of '${strategy?.brandName}'. Bold CTA banner: 'Experience ${strategy?.brandName} Today ➔ Visit ${websiteData?.domain}'.

CAMERA & TECHNICAL SPECIFICATIONS:
- Motion: Smooth robotic gimbal motion, seamless speed ramps, fast whip pans between scenes, 4k 60fps photorealistic commercial grade.
- Lighting & Color: Sleek obsidian black background, electric cyber accents, volumetric rim lighting, high-contrast HDR.
- Audio Vibe: Futuristic cinematic bass drop into an energetic, upbeat tech beat (128 BPM)."
================================================================================`;

  const effectiveMasterBrandPrompt = masterBrandPrompt || `================================================================================
MASTER BRAND & CAMPAIGN AI PROMPT (FOR CHATGPT / GEMINI / CLAUDE / MIDJOURNEY)
================================================================================
ROLE: You are the Chief Marketing Officer (CMO) and Lead Creative Director for ${strategy?.brandName || 'Brand'}.

[BRAND ARCHITECTURE & POSITIONING]
- Brand Name: ${strategy?.brandName || 'Brand'}
- Website / Platform: ${websiteData?.domain || websiteData?.url || ''}
- Primary Industry: ${strategy?.industry || 'Digital Solutions'}
- Brand Voice & Tone: ${strategy?.brandTone || 'High conversion, authoritative'}
- Target Audience: ${strategy?.targetAudience || 'Target market'}
- Unique Value Proposition (USP): ${strategy?.uniqueSellingPoint || ''}

[CORE SUITES / STUDIOS / SECTIONS]
${(websiteData?.studios || []).join(', ') || 'Core Offerings'}

[CORE CAMPAIGN OBJECTIVE]
Produce high-converting, viral, multi-platform social media posts, advertising creatives, video scripts, and marketing assets that position ${strategy?.brandName} as the undeniable industry leader.

[HOW TO USE THIS MASTER PROMPT]
1. Copy this entire prompt into ChatGPT (GPT-4o), Google Gemini, or Claude.
2. Ask the AI to write:
   - "Create a 30-day Instagram Reel & TikTok viral video campaign script"
   - "Write 10 high-converting LinkedIn thought leadership carousels for B2B executives"
   - "Generate 5 Facebook conversion ad copy angles with high-CTR hooks"
   - "Produce Midjourney / DALL-E image prompts with brand color grading"
3. Whenever asking for visuals, attach the raw screenshots captured from the site for exact UI matching!

================================================================================
ATTACHED MASTER AI IMAGE & VIDEO PROMPTS:
================================================================================

${effectiveMasterImagePrompt}

${effectiveMasterVideoPrompt}
================================================================================`;

  const effectiveMasterBrandBlueprint = masterBlueprint || `# ==============================================================================
# MASTER BRAND BLUEPRINT & 100% "HUBAHU" RE-CREATION GUIDE
# Platform: ${strategy?.brandName || 'Brand'} (${websiteData?.domain || ''})
# ==============================================================================

## 1. BRAND ARCHITECTURE & POSITIONING
- **Brand Name:** ${strategy?.brandName || 'Brand'}
- **Official Domain:** ${websiteData?.domain || websiteData?.url || ''}
- **Industry & Domain:** ${strategy?.industry || 'Technology & Digital Solutions'}
- **Brand Voice & Personality:** ${strategy?.brandTone || 'Authoritative, high conversion'}
- **Target Audience:** ${strategy?.targetAudience || 'Target market'}
- **Core Value Proposition (USP):** ${strategy?.uniqueSellingPoint || ''}

## 2. COMPLETE SUITES, STUDIOS & CORE CAPABILITIES
${(websiteData?.studios || []).map((s, i) => `### Suite ${i + 1}: ${s}\n- Interactive studio / core section verified on live platform\n- Designed for instant zero-friction execution`).join('\n\n') || '- Verified Core Platform Capabilities'}

## 3. REAL CAPTURED SCREENSHOTS MAPPING
The \`/all_website_screenshots/\` folder contains the following captured references:
- **desktop.jpg**: Primary desktop landing view (attach for visual grounding)
- **mobile.jpg**: Mobile 9:16 portrait viewport
${screenshots.map((s) => `- **${s.fileName}**: ${s.title} (${s.description})`).join('\n')}

## 4. HOW TO PRODUCE 100% "HUBAHU" VISUALS (CHATGPT / GEMINI / MIDJOURNEY)
1. Open ChatGPT (GPT-4o) or Google Gemini.
2. Click the '+' or attachment icon and upload **desktop.jpg** and the specific section screenshot from \`/all_website_screenshots/\`.
3. Paste the contents of \`MASTER_IMAGE_PROMPT.txt\` or individual day prompts.
4. The AI will cross-reference the actual UI colors, typography, buttons, and layout to ensure 0% hallucination!

## 5. HOW TO GENERATE 100% ACCURATE BRAND REELS (HIGGSFIELD / RUNWAY / SORA)
1. Open Higgsfield AI, Runway Gen-3, or Luma Dream Machine.
2. Select **Image-to-Video** mode.
3. Upload **desktop.jpg** or the generated visual creative as the **Start Frame**.
4. Paste the prompt from \`MASTER_VIDEO_PROMPT.txt\`.
5. The video model will animate the actual website UI with 3D camera pan, glowing highlights, and zero generic filler!
`;

  const handleCopyCaption = (post) => {
    const fullContent = `${post.caption}\n\n${post.hashtags.join(' ')}`;
    navigator.clipboard.writeText(fullContent);
    setCopiedPostId(post.id);
    setTimeout(() => setCopiedPostId(null), 1800);
  };

  const handleCopyPrompt = (post, type) => {
    const textToCopy = type === 'image'
      ? (post.aiImagePrompt || post.imagePrompt)
      : (post.aiVideoPrompt || `9:16 vertical video reel showing dynamic execution of ${post.toolName} on ${strategy.brandName}`);
    navigator.clipboard.writeText(textToCopy);
    setCopiedPromptKey(`${post.id}-${type}`);
    setTimeout(() => setCopiedPromptKey(null), 2000);
  };

  const handleCopyMasterPrompt = () => {
    navigator.clipboard.writeText(effectiveMasterBrandPrompt);
    setCopiedMasterPrompt(true);
    setTimeout(() => setCopiedMasterPrompt(false), 2500);
  };

  const handleCopyMasterImagePrompt = () => {
    navigator.clipboard.writeText(effectiveMasterImagePrompt);
    setCopiedMasterImage(true);
    setTimeout(() => setCopiedMasterImage(false), 2500);
  };

  const handleCopyMasterVideoPrompt = () => {
    navigator.clipboard.writeText(effectiveMasterVideoPrompt);
    setCopiedMasterVideo(true);
    setTimeout(() => setCopiedMasterVideo(false), 2500);
  };

  const handleCopyMasterBlueprint = () => {
    navigator.clipboard.writeText(effectiveMasterBrandBlueprint);
    setCopiedMasterBlueprint(true);
    setTimeout(() => setCopiedMasterBlueprint(false), 2500);
  };

  const handleCopyAll = () => {
    const allText = posts.map(p => `--- ${p.day} | ${p.platform} (${p.contentType}) ---\nHook: ${p.hook}\n\n${p.caption}\n\nHashtags: ${p.hashtags.join(' ')}\n`).join('\n\n');
    navigator.clipboard.writeText(allText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2200);
  };

  const handleExportZip = async () => {
    setIsExportingZip(true);
    try {
      const zip = new JSZip();

      // Dedup blob cache — every unique URL fetched ONCE (parallel pre-fetch below)
      const blobCache = new Map();
      const getBlobCached = (url) => {
        if (!url) return Promise.resolve(null);
        if (blobCache.has(url)) return blobCache.get(url);
        const pr = (async () => {
          try {
            if (url.startsWith('blob:') || url.startsWith('data:')) {
              const res = await fetch(url);
              return await res.blob();
            }
            return await proxyImageBlob(url, { timeout: 60000 });
          } catch {
            return null;
          }
        })();
        blobCache.set(url, pr);
        return pr;
      };

      // 0. Root: MASTER_BRAND_BLUEPRINT.md
      zip.file("MASTER_BRAND_BLUEPRINT.md", effectiveMasterBrandBlueprint);

      // 1. Root: MASTER_IMAGE_PROMPT.txt (with exact screenshot reference guide)
      zip.file("MASTER_IMAGE_PROMPT.txt", effectiveMasterImagePrompt);

      // 2. Root: MASTER_VIDEO_PROMPT.txt (with starting frame & keyframe guide)
      zip.file("MASTER_VIDEO_PROMPT.txt", effectiveMasterVideoPrompt);

      // 3. Root: MASTER_BRAND_COPYWRITING_PROMPT.txt
      zip.file("MASTER_BRAND_COPYWRITING_PROMPT.txt", effectiveMasterBrandPrompt);

      // 4. Root: MASTER_ALL_IN_ONE_PROMPT.txt (Complete briefing document)
      zip.file("MASTER_ALL_IN_ONE_PROMPT.txt", effectiveMasterBrandPrompt);

      // 5. Root: CAMPAIGN_OVERVIEW.md
      let overviewMd = `# ${strategy.brandName} - Autonomous Multi-Platform Campaign\n\n`;
      overviewMd += `**Industry:** ${strategy.industry}\n`;
      overviewMd += `**Target Audience:** ${strategy.targetAudience}\n`;
      overviewMd += `**Brand Voice & Tone:** ${strategy.brandTone}\n`;
      overviewMd += `**USP:** ${strategy.uniqueSellingPoint}\n`;
      overviewMd += `**Website:** ${websiteData.url}\n`;
      overviewMd += `**Total Posts:** ${posts.length}\n\n`;
      overviewMd += `## Campaign Schedule & Content Breakdown\n\n`;
      overviewMd += `| Day | Platform | Format | Focus Area | Hook |\n`;
      overviewMd += `|---|---|---|---|---|\n`;
      posts.forEach(p => {
        overviewMd += `| ${p.day} | ${p.platform} | ${p.contentType} | ${p.toolName} (${p.studio || 'Core'}) | ${(p.hook || '').replace(/\|/g, '-')} |\n`;
      });
      overviewMd += `\n\n---\n*Generated by OmniPost AI — Autonomous URL Marketing Machine*\n`;
      zip.file("CAMPAIGN_OVERVIEW.md", overviewMd);

      // 6. Root: campaign_schedule.csv (for social schedulers like Buffer/Hootsuite)
      let csvContent = "Day,Platform,Format,Studio,Capability,Hook,Caption,Hashtags,Best_Time,Image_URL,Video_URL\n";
      posts.forEach(p => {
        const clean = (val) => `"${(val || '').replace(/"/g, '""')}"`;
        const tags = clean((p.hashtags || []).join(' '));
        csvContent += `${clean(p.day)},${clean(p.platform)},${clean(p.contentType)},${clean(p.studio)},${clean(p.toolName)},${clean(p.hook)},${clean(p.caption)},${tags},${clean(p.bestTime)},${clean(p.remoteAiUrl || p.generatedImageUrl)},${clean(p.videoUrl || '')}\n`;
      });
      zip.file("campaign_schedule.csv", csvContent);

      // 7. Root: /all_website_screenshots/ folder
      // Contains all captured screenshots so user can attach them to ChatGPT / Gemini / Higgsfield
      const allShotsFolder = zip.folder("all_website_screenshots");
      const shotsToBundle = getUnifiedScreenshots(websiteData);

      let readmeContent = `================================================================================
ALL WEBSITE SCREENSHOTS & ASSET REFERENCE GUIDE
Brand: ${strategy?.brandName || 'Brand'} (${websiteData?.domain || ''})
================================================================================

This directory contains real browser screenshots captured directly from ${websiteData?.url || websiteData?.domain}.

FILES INCLUDED (${shotsToBundle.length} Total):
${shotsToBundle.map(s => `- ${s.fileName}: ${s.title} (${s.description})`).join('\n')}

HOW TO USE THESE ASSETS FOR 100% "HUBAHU" GENERATION:
1. FOR IMAGES (ChatGPT / Gemini / Midjourney):
   - Upload '${shotsToBundle[0]?.fileName || 'desktop.jpg'}' alongside 'MASTER_IMAGE_PROMPT.txt'
   - Instruct the AI: "Match the exact typography, color scheme, and UI layout shown in this screenshot."

2. FOR VIDEOS (Higgsfield / Runway / Luma / Sora):
   - Upload '${shotsToBundle[0]?.fileName || 'desktop.jpg'}' as the Starting Frame / Image-to-Video source.
   - Paste the prompt from 'MASTER_VIDEO_PROMPT.txt'.
   - The AI will animate the real interface without hallucinating generic elements!
================================================================================`;
      allShotsFolder.file("README_SCREENSHOTS.txt", readmeContent);

      for (let sIdx = 0; sIdx < shotsToBundle.length; sIdx++) {
        const shot = shotsToBundle[sIdx];
        if (shot.webUrl) {
          try {
            const sBlob = await getBlobCached(shot.webUrl);
            if (sBlob) {
              allShotsFolder.file(shot.fileName, sBlob);
            }
          } catch (e) {
            console.warn('Could not bundle screenshot in all_website_screenshots:', shot.webUrl);
          }
        }
      }

      // 8. DAY-WISE FOLDERS
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        const daySlug = (p.day || `Day-${i + 1}`).replace(/\s+/g, '-');
        const platSlug = (p.platform || 'Social').replace(/[^a-zA-Z0-9]/g, '');
        const toolSlug = (p.toolName || `Post_${i + 1}`).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
        const folderName = `${daySlug}_${platSlug}_${toolSlug}`;
        const dayFolder = zip.folder(folderName);

        // a) post_ready_to_publish.txt
        const readyText = `================================================================================
DAY: ${p.day}
PLATFORM: ${p.platform}
CONTENT FORMAT: ${p.contentType}
SECTION / SUITE: ${p.studio || 'Core Offerings'}
TOOL / CAPABILITY: ${p.toolName}
BEST PUBLISHING TIME: ${p.bestTime || '9:00 AM'}
================================================================================

HOW TO POST THIS POST (4 STEPS):
1. Open 'ai_image_prompt.txt' — copy the prompt, paste it into the Gemini app /
   ChatGPT / Midjourney (attach 'screenshot_before_input.jpg' for a 100%
   brand-accurate visual) — save the generated photo or video.
2. Come back here — copy the FULL POST CAPTION + HASHTAGS below.
3. Open ${p.platform}, create the post, attach your generated visual.
4. Paste the caption + hashtags → publish at ${p.bestTime || '9:00 AM'}. Done!

[VIRAL HOOK / HEADLINE]
${p.hook}

[FULL POST CAPTION]
${p.caption}

[HASHTAGS]
${(p.hashtags || []).join(' ')}

[CALL TO ACTION]
${p.callToAction}

================================================================================
OmniPost AI Automated Strategy Note:
Publish on ${p.platform} at ${p.bestTime || '9:00 AM'} for maximum reach and engagement.
================================================================================`;
        dayFolder.file("post_ready_to_publish.txt", readyText);

        // b) ai_image_prompt.txt (UNIQUE per post — visual angle rotation)
        const imgPromptText = p.imagePrompt || p.aiImagePrompt || `PROMPT FOR CHATGPT (DALL-E 3) / GEMINI / MIDJOURNEY:
(💡 TIP: Attach 'raw_screenshot.jpg' alongside this prompt into ChatGPT or Gemini for 100% brand UI matching!)

Create a high-converting, photorealistic commercial product advertising hero visual for "${strategy.brandName}" (${strategy.industry}).
- Subject: A sleek glassmorphic 3D device mockup showcasing "${p.toolName}" from the "${p.studio || 'Core'}" section.
- Visual Style: Ultra-clean enterprise aesthetic, luxury minimalist studio lighting, subtle neon cyber accents.
- Composition: Centered social media format, crisp depth of field, high dynamic range (HDR), 8K render.`;
        dayFolder.file("ai_image_prompt.txt", imgPromptText);

        // c) ai_video_prompt.txt
        const vidPromptText = p.aiVideoPrompt || `PROMPT FOR HIGGSFIELD / RUNWAY GEN-3 / LUMA / SORA:
(💡 TIP: Upload 'raw_screenshot.jpg' or 'visual_creative.png' as the starting frame / image-to-video source)

9:16 vertical social video commercial reel.
- Scene 1 (0-2s): Fast cinematic macro zoom-in to the "${p.toolName}" interface on ${strategy.brandName}.
- Scene 2 (2-5s): Interactive UI animation, glowing cursor point triggering "${p.hook}", vibrant particle waves.
- Scene 3 (5-8s): Dynamic split-second showcase of instant results with high-end corporate motion graphics.
- Camera: Smooth floating motion, 4k 60fps, photorealistic reflections, cinematic depth of field.`;
        dayFolder.file("ai_video_prompt.txt", vidPromptText);

        // d) visual_creative (AI generated visual — blob reused when already in memory)
        {
          try {
            const imgBlob = p.rawBlob || (p.generatedImageUrl ? await getBlobCached(p.generatedImageUrl) : null);
            if (imgBlob) {
              const isPng = (imgBlob.type || '').includes('png');
              dayFolder.file(`visual_creative.${isPng ? 'png' : 'jpg'}`, imgBlob);
            }
            if (p.cardDataUrl) {
              const cardBlob = await getBlobCached(p.cardDataUrl);
              if (cardBlob) dayFolder.file("branded_card.png", cardBlob);
            }
          } catch (err) {
            console.warn(`Could not bundle visual for ${p.day}:`, err.message);
          }
        }

        // d2) REAL Gemini-generated media (AI image + Veo video) — one-tap generations from the dashboard
        const am = aiMedia[p.id];
        if (am?.imgUrl) {
          try {
            const gemBlob = await getBlobCached(am.imgUrl);
            if (gemBlob) dayFolder.file(`gemini_ai_image.${(gemBlob.type || '').includes('jpeg') ? 'jpg' : 'png'}`, gemBlob);
          } catch (err) {
            console.warn(`Could not bundle Gemini image for ${p.day}:`, err.message);
          }
        }
        if (am?.vidUrl) {
          try {
            const gemVid = await getBlobCached(am.vidUrl);
            if (gemVid) dayFolder.file('gemini_ai_video.mp4', gemVid);
          } catch (err) {
            console.warn(`Could not bundle Veo video for ${p.day}:`, err.message);
          }
        }

        // e) Before (Input) and After (Output) live screenshots —
        //    cycle through ALL captured pages so every day gets DIFFERENT real shots
        const allShots = websiteData.screenshots || websiteData.capturedScreenshots || [];
        const inputUrl = p.inputScreenshotUrl || (allShots.length ? allShots[i % allShots.length]?.webUrl : '');
        const outputUrl = p.outputScreenshotUrl || (allShots.length ? allShots[(i + 1) % allShots.length]?.webUrl : p.screenshotUrl || '');

        if (inputUrl) {
          try {
            const inBlob = await getBlobCached(inputUrl);
            if (inBlob) {
              dayFolder.file("screenshot_before_input.jpg", inBlob);
            }
          } catch (err) {
            console.warn(`Could not bundle input screenshot for ${p.day}:`, err.message);
          }
        }

        if (outputUrl) {
          try {
            const outBlob = await getBlobCached(outputUrl);
            if (outBlob) {
              dayFolder.file("screenshot_after_output.jpg", outBlob);
            }
          } catch (err) {
            console.warn(`Could not bundle output screenshot for ${p.day}:`, err.message);
          }
        }

        // e2) raw_screenshot.jpg (Primary live proof for backwards compatibility)
        const shotUrl = p.screenshotUrl || outputUrl || inputUrl || (websiteData.screenshots && websiteData.screenshots[0]?.webUrl) || '';
        if (shotUrl) {
          try {
            const shotBlob = await getBlobCached(shotUrl);
            if (shotBlob) {
              dayFolder.file("raw_screenshot.jpg", shotBlob);
            }
          } catch (err) {
            console.warn(`Could not bundle raw screenshot for ${p.day}:`, err.message);
          }
        }

        // f) If video post: video_reel.webm/.mp4 and video_script.md
        if (p.contentType?.includes('Video') || p.videoScript) {
          if (p.videoBlob) {
            const isWebm = (p.videoBlob.type || '').includes('webm');
            dayFolder.file(`video_reel.${isWebm ? 'webm' : 'mp4'}`, p.videoBlob);
          } else if (p.videoUrl) {
            try {
              const vidRes = await fetch(p.videoUrl);
              if (vidRes.ok) {
                const vBlob = await vidRes.blob();
                const isWebm = (vBlob.type || '').includes('webm');
                dayFolder.file(`video_reel.${isWebm ? 'webm' : 'mp4'}`, vBlob);
              }
            } catch (err) {
              console.warn(`Could not bundle video for ${p.day}:`, err.message);
            }
          }

          if (p.videoScript) {
            let scriptDoc = `# ${strategy.brandName} - Video Reel Script (${p.day})\n\n`;
            scriptDoc += `**Hook:** ${p.hook}\n`;
            scriptDoc += `**Duration:** ${p.videoScript.duration || '30s'} | **Audio Vibe:** ${p.videoScript.audioVibe || 'Energetic Lo-Fi Beat'}\n\n`;
            (p.videoScript.scenes || []).forEach(s => {
              scriptDoc += `### Scene ${s.sceneNumber} (${s.time || ''})\n`;
              scriptDoc += `- Visual Direction: ${s.visualDirection}\n`;
              scriptDoc += `- On-Screen Text: ${s.onScreenText}\n`;
              scriptDoc += `- Voiceover Audio: ${s.voiceoverAudio}\n\n`;
            });
            scriptDoc += `**Call To Action:** ${p.callToAction}\n`;
            dayFolder.file("video_script.md", scriptDoc);
          }
        }

        // g) Branded carousel slides — every image post ships as a ready-to-post
        //    swipeable carousel (rendered on-canvas with the live brand palette)
        if (!p.contentType?.includes('Video') && !p.videoScript) {
          try {
            const slides = await renderFullCarousel(p, strategy, websiteData);
            for (let si = 0; si < slides.length; si++) {
              const sBlob = await (await fetch(slides[si])).blob();
              dayFolder.file(`carousel_slide_${si + 1}.png`, sBlob);
            }
          } catch (err) {
            console.warn(`Could not bundle carousel for ${p.day}:`, err.message);
          }
        }
      }

      // 9. WORLD_LANGUAGES — AI-transcreated hero posts per market
      if (langPack && langPack.languages && Object.keys(langPack.languages).length) {
        const langFolder = zip.folder("WORLD_LANGUAGES_5");
        langFolder.file("README_LANGUAGES.txt", "One .txt per language — your 3 hero posts transcreated by Gemini for native audiences (cultural adaptation, not word-by-word translation).\nPaste straight into the native-market account.\n");
        for (const [langName, data] of Object.entries(langPack.languages)) {
          let langTxt = `${strategy.brandName} — ${langName} Campaign Posts (AI-transcreated)\n${'='.repeat(64)}\n\n`;
          (data.posts || []).forEach((lp, li) => {
            langTxt += `--- POST ${li + 1} ---\nHOOK: ${lp.hook}\n\nCAPTION:\n${lp.caption}\n\nHASHTAGS: ${(lp.hashtags || []).join(' ')}\n\n`;
          });
          langFolder.file(`${langName.replace(/[^a-zA-Z0-9]/g, '_') || 'Language'}.txt`, langTxt);
        }
      }

      // Generate & Trigger download
      const content = await zip.generateAsync({ type: "blob" });
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(content);
      downloadLink.download = `${strategy.brandName.replace(/\s+/g, '_')}_Campaign_Bundle.zip`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      confetti({
        particleCount: 140,
        spread: 90,
        origin: { y: 0.6 }
      });
    } catch (e) {
      console.error("Export zip error:", e);
      alert("Failed to create ZIP bundle. Individual downloads are still available.");
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleDownloadSingleImage = async (post) => {
    try {
      const mode = mediaViewMode[post.id] || 'poster';
      let targetUrl = post.generatedImageUrl;
      let suffix = 'visual';
      if (mode === 'ai' && post.rawAiUrl) {
        targetUrl = post.rawAiUrl;
        suffix = 'ai_art';
      } else if (mode === 'input' && post.inputScreenshotUrl) {
        targetUrl = post.inputScreenshotUrl;
        suffix = 'before_input_state';
      } else if (mode === 'output' && (post.outputScreenshotUrl || post.screenshotUrl)) {
        targetUrl = post.outputScreenshotUrl || post.screenshotUrl;
        suffix = 'after_live_output';
      } else if (mode === 'screenshot' && post.screenshotUrl) {
        targetUrl = post.screenshotUrl;
        suffix = 'screenshot';
      }

      const blob = await proxyImageBlob(targetUrl);
      if (!blob) throw new Error('could not fetch');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${post.day}_${strategy.brandName}_${suffix}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      window.open(post.generatedImageUrl, '_blank');
    }
  };

  const loadLanguages = async () => {
    if (langState === 'loading') return;
    if (!geminiApiKey) {
      setLangError('no-gemini-key');
      setLangState('error');
      return;
    }
    setLangState('loading');
    setLangError('');
    try {
      const pack = await generateLanguagePack({ strategy, posts, userApiKey: geminiApiKey });
      setLangPack(pack);
      setLangState('ready');
    } catch (err) {
      setLangError(err.message || 'Gemini could not build the language pack');
      setLangState('error');
    }
  };

  const handleCopyLanguage = async (langName, data) => {
    const text = (data.posts || []).map((lp, i) => `POST ${i + 1}\n${lp.hook}\n\n${lp.caption}\n${(lp.hashtags || []).join(' ')}`).join('\n\n----------\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLang(langName);
      setTimeout(() => setCopiedLang(''), 1600);
    } catch { /* clipboard blocked */ }
  };

  // Honest skip-reason classification — the amber banner must NEVER tell a
  // user with a healthy key to "fix the key" (503/404 are not key problems).
  const geminiErrRaw = posts.find((p) => p.geminiError)?.geminiError || '';
  const errKind = /404|no longer available|unavailable for this key/i.test(geminiErrRaw) ? 'model'
    : /503|overloaded|high demand/i.test(geminiErrRaw) ? 'busy'
      : /429|quota/i.test(geminiErrRaw) ? 'quota'
        : /403|restricted|invalid|not valid/i.test(geminiErrRaw) ? 'key'
          : /MAX_TOKENS/i.test(geminiErrRaw) ? 'maxtok'
            : 'other';
  const bannerAdvice = {
    model: 'Your key is FINE — Google retired that model. The app auto-retried every model your key offers, including any replacement Google named. Tap Regenerate — it re-discovers Google\'s current models automatically.',
    busy: 'Your key is fine — Gemini servers are just overloaded right now. The Smart Engine output below is ready to post as-is. Tap Regenerate in a minute for full AI-written copy.',
    quota: 'Free-tier quota (429) is used up for now. The Smart Engine output below is ready to post as-is — wait a minute and tap Regenerate, or add a fresh free key in Settings (⚙️).',
    key: 'The key was rejected — check it in Settings (⚙️). Get a free one at aistudio.google.com/app/apikey. The Smart Engine output below is still ready to post.',
    maxtok: 'Gemini hit its output limit mid-write. The app auto-retried with a larger budget — tap Regenerate to run it again. The Smart Engine output below is ready to post.',
    other: 'Gemini was busy or unavailable even after automatic retries. The Smart Engine output below is ready to post as-is — tap Regenerate in a minute.',
  }[errKind];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-500">
      
      {/* Campaign Control Bar */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-700/80 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        
        {/* Left Brand Summary */}
        <div className="space-y-1.5 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white text-[11px] font-bold transition cursor-pointer"
              title="Back to the URL input — analyze another website"
            >
              ← Back / New URL
            </button>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Live Automated Campaign Ready
            </span>
          </div>
          <h2 className="font-heading text-2xl font-black text-white flex items-center gap-2.5">
            <span>{strategy.brandName}</span>
            <span className="text-sm font-semibold px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {posts.length} Posts
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            Targeting: <span className="text-slate-300">{strategy.targetAudience}</span>
          </p>
        </div>

        {/* Right Global Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCopyAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/80 transition cursor-pointer"
          >
            {copiedAll ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>All Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy All Captions</span>
              </>
            )}
          </button>

          {/* Master AI Prompts Studio Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsMasterStudioOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/25 via-purple-500/25 to-pink-500/25 hover:from-amber-500/40 hover:to-pink-500/40 text-amber-300 hover:text-white text-xs font-bold border border-amber-500/40 shadow-lg shadow-amber-500/15 transition cursor-pointer"
            title="Open Master AI Prompts Studio (Image & Video Prompts with Screenshot Guidance)"
          >
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>🌟 Master AI Prompts Studio</span>
          </button>

          {/* Quick Copy Master Image Prompt */}
          <button
            type="button"
            onClick={handleCopyMasterImagePrompt}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-white text-xs font-semibold border border-amber-500/30 transition cursor-pointer"
            title="Quick Copy Master Image Prompt (Entire Website) for ChatGPT / Gemini / Midjourney"
          >
            {copiedMasterImage ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Image Copied!</span>
              </>
            ) : (
              <>
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>🎨 Master Image Prompt</span>
              </>
            )}
          </button>

          {/* Quick Copy Master Video Prompt */}
          <button
            type="button"
            onClick={handleCopyMasterVideoPrompt}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 hover:text-white text-xs font-semibold border border-purple-500/30 transition cursor-pointer"
            title="Quick Copy Master Video Reel Prompt for Higgsfield / Runway / Luma / Sora"
          >
            {copiedMasterVideo ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Video Copied!</span>
              </>
            ) : (
              <>
                <Video className="w-3.5 h-3.5 text-purple-400" />
                <span>🎬 Master Video</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isExportingZip}
            onClick={handleExportZip}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-60"
          >
            {isExportingZip ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Packaging ZIP Bundle...</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                <span>Export Full Campaign (ZIP)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onReset}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/80 transition cursor-pointer"
            title="Start New Website"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Engine transparency notice — Gemini failure is never silent anymore */}
      {geminiErrRaw && (
        <div className="mb-3 p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-white">Gemini couldn't write this run: </span>
            {geminiErrRaw}
            <span className="block mt-1 text-amber-300/80">
              {bannerAdvice}
            </span>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={isGeneratingCampaign}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black shadow-lg shadow-amber-500/25 transition cursor-pointer disabled:opacity-50"
              >
                {isGeneratingCampaign ? 'Regenerating…' : '🔁 Regenerate now'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs & View Mode Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-2 border-b border-slate-800">
        {/* Category filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'All Posts' },
            { id: 'videos', label: '🎬 Video Reels' },
            { id: 'carousels', label: '🎠 Carousels' },
            { id: 'images', label: '📸 Visual Cards' },
            { id: 'instagram', label: 'Instagram' },
            { id: 'linkedin', label: 'LinkedIn' },
            { id: 'twitter', label: 'Twitter / X' },
            { id: 'languages', label: '🌍 World Languages' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs self-end sm:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Grid View
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              viewMode === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Timeline View
          </button>
        </div>
      </div>

      {/* World Languages — AI-transcreated multi-market pack */}
      {activeTab === 'languages' && (
        <div className="space-y-5">
          <div className="p-5 rounded-3xl glass-panel border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="font-bold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-400" />
                One Campaign, Every Market
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Gemini transcreates your 3 hero posts into Hindi, Spanish, French, Arabic &amp; Japanese — native-level phrasing a local marketer would actually post, never robotic translation.
              </p>
            </div>
            {langState !== 'loading' && (
              <button
                type="button"
                onClick={loadLanguages}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer whitespace-nowrap"
              >
                {langState === 'ready' ? '🔁 Regenerate Pack' : '🌍 Generate 5-Language Pack'}
              </button>
            )}
          </div>

          {langState === 'loading' && (
            <div className="p-8 rounded-3xl glass-panel border border-indigo-500/20 text-center">
              <div className="w-8 h-8 mx-auto border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
              <p className="text-sm font-bold text-white mt-3">Gemini is transcreating in 5 languages…</p>
              <p className="text-xs text-slate-400 mt-1">Hindi · Spanish · French · Arabic · Japanese — usually 10-20 seconds.</p>
            </div>
          )}

          {langState === 'error' && (
            <div className="p-5 rounded-3xl glass-panel border border-amber-500/30 text-xs text-amber-200">
              {langError === 'no-gemini-key' ? (
                <>
                  <p className="font-bold text-white text-sm">🌍 This one runs on real AI</p>
                  <p className="mt-1.5 text-amber-200/90">World Languages uses your own free Gemini key — add it in Settings (⚙️) (free at aistudio.google.com/app/apikey, takes 30 seconds) and this tab writes native-market copy for your brand. We won't fake it with templates.</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-white">Gemini couldn't build the language pack:</p>
                  <p className="mt-1.5">{langError}</p>
                  <p className="mt-1.5 text-amber-300/80">Your posts above are unaffected. Try again in a minute — the app auto-retries on Google's newest models.</p>
                </>
              )}
              <button
                type="button"
                onClick={loadLanguages}
                className="mt-3 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100 font-bold transition cursor-pointer"
              >
                🔁 Try Again
              </button>
            </div>
          )}

          {langState === 'ready' && langPack && Object.entries(langPack.languages).map(([langName, data]) => (
            <div key={langName} className="p-5 rounded-3xl glass-panel border border-slate-800/80">
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="font-bold text-white flex items-center gap-2">
                  {langName}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">{data.code}</span>
                  <span className="text-[10px] text-slate-500 font-normal">AI-transcreated · ready to post</span>
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyLanguage(langName, data)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  {copiedLang === langName ? (<><Check className="w-3 h-3 text-emerald-400" /> Copied!</>) : (<><Copy className="w-3 h-3" /> Copy {langName} Posts</>)}
                </button>
              </div>
              <div dir={data.code === 'ar' ? 'rtl' : 'ltr'} className="grid md:grid-cols-3 gap-3">
                {data.posts.map((lp, li) => (
                  <div key={li} className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
                    <p className="font-bold text-amber-300 leading-snug">{lp.hook}</p>
                    <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{lp.caption}</p>
                    <p className="text-indigo-300">{(lp.hashtags || []).join(' ')}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid View */}
      {activeTab !== 'languages' && viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map((post) => {
            const isVideo = post.contentType?.includes('Video');

            return (
              <div
                key={post.id}
                className="rounded-3xl glass-panel border border-slate-800/80 overflow-hidden flex flex-col hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 text-left group"
              >
                {/* Visual Header / Media */}
                <div className="relative aspect-square bg-slate-950 overflow-hidden">
                  {/* View Mode Switcher on card */}
                  {(post.rawAiUrl || post.inputScreenshotUrl || post.outputScreenshotUrl || post.screenshotUrl) && (
                    <div className="absolute top-10 inset-x-3 flex items-center gap-1 z-20 flex-wrap">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setMediaViewMode(prev => ({ ...prev, [post.id]: 'poster' })); }}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition cursor-pointer backdrop-blur-md ${
                          (mediaViewMode[post.id] || 'poster') === 'poster'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-black/60 text-slate-300 hover:text-white'
                        }`}
                      >
                        🎨 AI Poster
                      </button>
                      {post.rawAiUrl && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMediaViewMode(prev => ({ ...prev, [post.id]: 'ai' })); }}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold transition cursor-pointer backdrop-blur-md ${
                            mediaViewMode[post.id] === 'ai'
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'bg-black/60 text-slate-300 hover:text-white'
                          }`}
                        >
                          📸 Pure AI Art
                        </button>
                      )}
                      {post.inputScreenshotUrl && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMediaViewMode(prev => ({ ...prev, [post.id]: 'input' })); }}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold transition cursor-pointer backdrop-blur-md ${
                            mediaViewMode[post.id] === 'input'
                              ? 'bg-amber-600 text-white shadow-sm'
                              : 'bg-black/60 text-amber-300 hover:text-white'
                          }`}
                        >
                          📥 Input State
                        </button>
                      )}
                      {(post.outputScreenshotUrl || post.screenshotUrl) && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMediaViewMode(prev => ({ ...prev, [post.id]: 'output' })); }}
                          className={`px-2 py-0.5 rounded text-[9px] font-bold transition cursor-pointer backdrop-blur-md ${
                            mediaViewMode[post.id] === 'output'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-black/60 text-emerald-300 hover:text-white'
                          }`}
                        >
                          🚀 Live Output
                        </button>
                      )}
                    </div>
                  )}

                  <img
                    src={
                      mediaViewMode[post.id] === 'ai' && post.rawAiUrl
                        ? post.rawAiUrl
                        : mediaViewMode[post.id] === 'input' && post.inputScreenshotUrl
                        ? post.inputScreenshotUrl
                        : mediaViewMode[post.id] === 'output' && (post.outputScreenshotUrl || post.screenshotUrl)
                        ? (post.outputScreenshotUrl || post.screenshotUrl)
                        : mediaViewMode[post.id] === 'screenshot' && post.screenshotUrl
                        ? post.screenshotUrl
                        : post.generatedImageUrl
                    }
                    alt={post.hook}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    onError={(e) => {
                      if (post.screenshotFallbackUrl) e.target.src = post.screenshotFallbackUrl;
                    }}
                  />

                  {/* Gradient bottom shadow */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none" />

                  {/* Top Badges */}
                  <div className="absolute top-3 inset-x-3 flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-white text-[11px] font-bold font-mono">
                      {post.day}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-slate-200 text-[11px] font-semibold flex items-center gap-1.5">
                      {post.platform}
                    </span>
                  </div>

                  {/* Video Reel Play Overlay Button */}
                  {isVideo && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        onClick={() => setSelectedVideoPost(post)}
                        className="w-14 h-14 rounded-full bg-purple-600/90 hover:bg-purple-500 hover:scale-110 text-white flex items-center justify-center shadow-2xl shadow-purple-500/40 backdrop-blur-md transition-all cursor-pointer group/btn"
                      >
                        <Play className="w-6 h-6 ml-0.5 fill-white group-hover/btn:scale-110 transition" />
                      </button>
                    </div>
                  )}

                  {/* Content Type Tag */}
                  <div className="absolute bottom-3 left-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider backdrop-blur-md flex items-center gap-1 ${
                      isVideo
                        ? 'bg-purple-900/80 text-purple-200 border border-purple-500/40'
                        : 'bg-indigo-900/80 text-indigo-200 border border-indigo-500/40'
                    }`}>
                      {isVideo ? <Video className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                      {post.contentType}
                    </span>
                  </div>

                  {/* Download Image Button */}
                  <button
                    onClick={() => handleDownloadSingleImage(post)}
                    title="Download Visual Image"
                    className="absolute bottom-3 right-3 p-2 rounded-xl bg-black/70 hover:bg-black/90 text-white backdrop-blur-md border border-white/10 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                  
                  {/* Studio & Tool Highlight */}
                  {(post.studio || post.toolName) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {post.studio && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold">
                          🏛️ {post.studio}
                        </span>
                      )}
                      {post.toolName && (
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold">
                          ⚡ {post.toolName}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Hook */}
                  <div>
                    <h3 className="font-heading text-base font-bold text-white leading-snug line-clamp-2">
                      {post.hook}
                    </h3>

                    {/* Caption preview */}
                    <div className="mt-2.5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-line scrollbar-thin">
                      {post.caption}
                    </div>

                    {/* Hashtags */}
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {post.hashtags.map((tag, idx) => (
                        <span key={idx} className="text-[11px] text-indigo-400 font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* AI Provider Info */}
                  <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-800/50 pt-2">
                    <span className="truncate flex items-center gap-1 text-slate-300">
                      <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="truncate">{post.imageProvider || 'OmniPost Visual'}</span>
                    </span>
                    {aiMedia[post.id]?.imgUrl && (
                      <span className="flex items-center gap-1 text-[9px] font-bold text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/30 px-1.5 py-0.5 rounded-full shrink-0">
                        <Wand2 className="w-2.5 h-2.5" />
                        Gemini Visual ✓
                      </span>
                    )}
                    {isVideo && post.videoProvider && (
                      <span className="truncate flex items-center gap-1 text-purple-300 shrink-0">
                        <Video className="w-3 h-3 text-purple-400 shrink-0" />
                        <span>{post.videoProvider}</span>
                      </span>
                    )}
                  </div>

                  {/* Expandable AI Prompts Drawer */}
                  <div className="pt-2 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => setExpandedPromptPostId(expandedPromptPostId === post.id ? null : post.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white text-[11px] font-semibold transition cursor-pointer border border-slate-800"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>AI Prompts (Image & Video)</span>
                      </span>
                      {expandedPromptPostId === post.id ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>

                    {expandedPromptPostId === post.id && (
                      <div className="mt-2.5 p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3 text-[11px] text-left animate-in fade-in duration-200">
                        {/* ChatGPT / Gemini Prompt */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-amber-300 flex items-center gap-1">
                              🎨 ChatGPT / Gemini Prompt
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyPrompt(post, 'image')}
                              className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold border border-amber-500/30 transition cursor-pointer flex items-center gap-1"
                            >
                              {copiedPromptKey === `${post.id}-image` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Image Prompt</span>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 italic mb-1">
                            💡 Attach <code className="text-amber-300 font-mono">screenshot_before_input.jpg</code> & <code className="text-emerald-300 font-mono">screenshot_after_output.jpg</code> for authentic Before/After commercial visual!
                          </p>
                          <pre className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-24 overflow-y-auto">
                            {post.imagePrompt || post.aiImagePrompt}
                          </pre>

                          {/* REAL Gemini image generation — one tap, right here */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleGenerateAiImage(post)}
                              disabled={(aiMedia[post.id]?.phase || '') === 'img-loading'}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 text-white text-[10px] font-bold shadow-lg shadow-fuchsia-600/25 transition cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                            >
                              {(aiMedia[post.id]?.phase || '') === 'img-loading' ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>{aiMedia[post.id]?.status || 'Painting…'}</span>
                                </>
                              ) : (
                                <>
                                  <Wand2 className="w-3 h-3" />
                                  <span>Generate with Gemini</span>
                                </>
                              )}
                            </button>
                            {aiMedia[post.id]?.imgUrl && (
                              <a
                                href={aiMedia[post.id].imgUrl}
                                download={`${String(post.toolName || 'post').replace(/[^a-zA-Z0-9]+/g, '_')}_gemini_ai.png`}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 transition"
                              >
                                ⬇ Download Image
                              </a>
                            )}
                            {aiMedia[post.id]?.imgModel && (
                              <span className="text-[9px] text-fuchsia-300 font-semibold">via {aiMedia[post.id].imgModel}</span>
                            )}
                          </div>
                          {(aiMedia[post.id]?.phase || '') === 'img-error' && (
                            <p className="mt-1.5 text-[10px] text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg px-2 py-1.5">{aiMedia[post.id]?.imgError}</p>
                          )}
                          {aiMedia[post.id]?.imgUrl && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-fuchsia-500/30 bg-slate-900">
                              <img src={aiMedia[post.id].imgUrl} alt={`Gemini AI visual for ${post.toolName}`} className="w-full max-h-80 object-contain" />
                            </div>
                          )}
                        </div>

                        {/* Higgsfield / Video Prompt */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-purple-300 flex items-center gap-1">
                              🎬 Higgsfield / Runway Prompt
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyPrompt(post, 'video')}
                              className="px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[10px] font-bold border border-purple-500/30 transition cursor-pointer flex items-center gap-1"
                            >
                              {copiedPromptKey === `${post.id}-video` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Video Prompt</span>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 italic mb-1">
                            💡 Start Frame: <code className="text-amber-300 font-mono">screenshot_before_input.jpg</code> ➔ Climax Frame: <code className="text-emerald-300 font-mono">screenshot_after_output.jpg</code>!
                          </p>
                          <pre className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-24 overflow-y-auto">
                            {post.aiVideoPrompt || `9:16 vertical video reel showing dynamic execution of ${post.toolName} on ${strategy.brandName}`}
                          </pre>

                          {/* REAL Veo video generation — one tap */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleGenerateAiVideo(post)}
                              disabled={(aiMedia[post.id]?.phase || '') === 'vid-loading'}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-[10px] font-bold shadow-lg shadow-purple-600/25 transition cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                            >
                              {(aiMedia[post.id]?.phase || '') === 'vid-loading' ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>{aiMedia[post.id]?.status || 'Rendering…'}</span>
                                </>
                              ) : (
                                <>
                                  <Clapperboard className="w-3 h-3" />
                                  <span>Generate AI Video (Veo)</span>
                                </>
                              )}
                            </button>
                            {aiMedia[post.id]?.vidUrl && (
                              <a
                                href={aiMedia[post.id].vidUrl}
                                download={`${String(post.toolName || 'post').replace(/[^a-zA-Z0-9]+/g, '_')}_veo_ai.mp4`}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 transition"
                              >
                                ⬇ Download Video
                              </a>
                            )}
                            {aiMedia[post.id]?.vidModel && (
                              <span className="text-[9px] text-purple-300 font-semibold">via {aiMedia[post.id].vidModel}</span>
                            )}
                          </div>
                          {(aiMedia[post.id]?.phase || '') === 'vid-error' && (
                            <p className="mt-1.5 text-[10px] text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded-lg px-2 py-1.5">{aiMedia[post.id]?.vidError}</p>
                          )}
                          {aiMedia[post.id]?.vidUrl && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-purple-500/30 bg-slate-900 flex justify-center">
                              <video src={aiMedia[post.id].vidUrl} controls playsInline className="max-h-80" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    {isVideo ? (
                      <div className="flex items-center gap-2 flex-1">
                        <button
                          onClick={() => setSelectedVideoPost(post)}
                          className="flex-1 py-2 px-3 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-purple-500/20"
                        >
                          <Play className="w-3.5 h-3.5 text-purple-300 fill-purple-300" />
                          <span>Watch 9:16 Video Reel</span>
                        </button>
                        {post.videoUrl && (
                          <a
                            href={post.videoUrl}
                            download={`${post.day}_${post.toolName || 'reel'}.mp4`}
                            className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition cursor-pointer shrink-0"
                            title="Download Video Reel (.MP4)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-[11px] text-slate-400 line-clamp-1 flex-1" title={post.callToAction}>
                          {post.callToAction}
                        </span>
                        <button
                          onClick={() => setCarouselPost(post)}
                          className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-pink-600/20 hover:bg-pink-600/40 border border-pink-500/40 text-pink-200 text-xs font-semibold transition cursor-pointer shrink-0"
                          title="Open branded carousel preview (auto-built from this post)"
                        >
                          <GalleryHorizontal className="w-3.5 h-3.5" />
                          <span>Carousel</span>
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => handleCopyCaption(post)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer shrink-0"
                      title="Copy Caption & Hashtags"
                    >
                      {copiedPostId === post.id ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline / Calendar View */}
      {activeTab !== 'languages' && viewMode === 'calendar' && (
        <div className="space-y-4">
          {filteredPosts.map((post, idx) => (
            <div
              key={post.id}
              className="p-5 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-indigo-500/40 transition text-left"
            >
              {/* Day & Visual */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0">
                  <img
                    src={post.generatedImageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-sm font-extrabold text-white">
                      {post.day}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium">
                      {post.platform}
                    </span>
                    <span className="text-xs text-indigo-400 font-medium">
                      {post.contentType}
                    </span>
                  </div>
                  <h4 className="mt-1 text-sm text-slate-200 font-semibold line-clamp-1">
                    {post.hook}
                  </h4>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                {post.videoScript && (
                  <button
                    onClick={() => setSelectedVideoPost(post)}
                    className="px-3.5 py-1.5 rounded-xl bg-purple-600/20 text-purple-200 hover:bg-purple-600/30 text-xs font-semibold border border-purple-500/30 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>View Reel</span>
                  </button>
                )}
                <button
                  onClick={() => handleCopyCaption(post)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Caption</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Carousel Preview Modal */}
      {carouselPost && (
        <CarouselModal
          post={carouselPost}
          strategy={strategy}
          websiteData={websiteData}
          onClose={() => setCarouselPost(null)}
        />
      )}

      {/* Video Reel Modal */}
      {selectedVideoPost && (
        <VideoReelModal
          isOpen={Boolean(selectedVideoPost)}
          onClose={() => setSelectedVideoPost(null)}
          post={selectedVideoPost}
          brandName={strategy.brandName}
          higgsfieldApiKey={higgsfieldApiKey}
          strategy={strategy}
          websiteData={websiteData}
        />
      )}

      {/* Master AI Prompts Studio Modal */}
      {isMasterStudioOpen && (
        <MasterStudioModal
          isOpen={isMasterStudioOpen}
          onClose={() => setIsMasterStudioOpen(false)}
          strategy={strategy}
          websiteData={websiteData}
          masterBrandPrompt={effectiveMasterBrandPrompt}
          masterImagePrompt={effectiveMasterImagePrompt}
          masterVideoPrompt={effectiveMasterVideoPrompt}
          masterBlueprint={effectiveMasterBrandBlueprint}
          onDownloadScreenshotsZip={handleDownloadScreenshotsZip}
          isDownloadingScreenshotsZip={isDownloadingScreenshotsZip}
        />
      )}

    </div>
  );
}
