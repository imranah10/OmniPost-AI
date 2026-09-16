/**
 * aiClient.js — Browser port of the server AI engine.
 *
 * Two engines, same contracts as the server:
 *  • Gemini REST (works directly from the browser with the user's key —
 *    generativelanguage.googleapis.com sends permissive CORS headers)
 *  • 100% free heuristic + dynamic-template fallback (no key needed)
 */

const GEMINI_MODEL = 'gemini-2.0-flash';

export function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/```json/gi, '```').split('```')[0].trim() || t;
  const start = Math.min(...['{', '['].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
  if (start === Infinity) return null;
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function geminiText(apiKey, prompt, timeoutMs = 60000) {
  if (!apiKey) throw new Error('no-gemini-key');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
      }),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Step 1 — Strategy                                                   */
/* ------------------------------------------------------------------ */
export async function analyzeWebsiteStrategy(websiteData, customPrompt = '', userApiKey = '') {
  if (userApiKey) {
    try {
      const toolsCount = (websiteData.discoveredTools || []).length;
      const studiosCount = (websiteData.studios || []).length;
      const isStudioPlatform = Boolean(websiteData.isStudioPlatform);
      const toolsList =
        (websiteData.discoveredTools || []).slice(0, 20).map((t) => t.name).join(', ') || 'Comprehensive suite';
      const studiosList = (websiteData.studios || []).join(', ') || 'Core Platform Suite';

      const prompt = `You are an elite, CMO-level marketing strategist and viral social media architect.
Analyze this real-world website crawl and formulate a tailored, non-generic social media campaign:

BRAND / DOMAIN: ${websiteData.domain}
PAGE TITLE: ${websiteData.title}
META DESCRIPTION: ${websiteData.description}
PLATFORM TYPE: ${isStudioPlatform ? 'Multi-Studio Tool Suite' : 'Corporate / SaaS / Agency Platform'}
DISCOVERED SECTIONS COUNT: ${studiosCount} (${studiosList})
DISCOVERED TOOLS / CAPABILITIES: ${toolsCount}
FEATURED TOOLS PREVIEW: ${toolsList}
KEY FEATURES: ${(websiteData.features || []).slice(0, 8).join(' | ')}
HEADINGS: ${(websiteData.h1s || []).join(' | ')}
SITE HEALTH SCORE: ${websiteData.testReport?.score ?? 'n/a'}/100
CONTENT OVERVIEW: ${String(websiteData.rawSummary || '').slice(0, 1500)}
${customPrompt ? `USER SPECIAL GOAL/PROMPT: ${customPrompt}` : ''}

CRITICAL DYNAMIC REQUIREMENT:
The post count, duration, and video-to-image breakdown MUST BE STRICTLY DYNAMIC based on this website's exact nature:
- For massive multi-tool platforms with 30+ tools: 18-22 posts over 21-30 days.
- For modern corporate SaaS or agency platforms with several services: 8-11 posts over 10-14 days.
- For small single-product or micro-tools (1-3 features): 5-7 posts over 7 days.

Return ONLY a valid JSON object:
{
  "brandName": "Exact Brand Name",
  "industry": "e.g. Developer Tools / SaaS / Agency",
  "targetAudience": "Detailed audience profile",
  "brandTone": "e.g. Authoritative & Futuristic",
  "uniqueSellingPoint": "One punchy value proposition sentence",
  "recommendedDays": 7,
  "recommendedPostCount": 10,
  "recommendedBreakdown": { "videoReels": 4, "imagePosts": 6 },
  "rationale": "Why this exact plan fits this website's scale",
  "primaryPlatforms": ["Instagram", "LinkedIn", "Twitter/X", "TikTok"]
}`;

      const raw = await geminiText(userApiKey, prompt, 60000);
      const parsed = parseJsonLoose(raw);
      if (parsed && parsed.brandName) {
        const defaultPosts = isStudioPlatform && toolsCount > 30 ? 18 : studiosCount >= 6 ? 9 : 6;
        const postCount = parseInt(parsed.recommendedPostCount) || defaultPosts;
        const videoRatio =
          parsed.recommendedBreakdown?.videoReels
            ? parseInt(parsed.recommendedBreakdown.videoReels)
            : Math.max(2, Math.round(postCount * 0.4));
        parsed.recommendedPostCount = postCount;
        parsed.recommendedDays = parseInt(parsed.recommendedDays) || (isStudioPlatform && toolsCount > 30 ? 21 : studiosCount >= 6 ? 12 : 7);
        parsed.recommendedBreakdown = { videoReels: videoRatio, imagePosts: Math.max(1, postCount - videoRatio) };
        parsed.engine = 'gemini';
        return parsed;
      }
    } catch {
      /* heuristic fallback below */
    }
  }
  return heuristicStrategy(websiteData);
}

function heuristicStrategy(websiteData) {
  const blob = `${websiteData.title} ${websiteData.description} ${websiteData.rawSummary}`;
  const isSaaS = /software|app\b|\bai\b|api|platform|tool|cloud|data|bot|dashboard|analytics|toolverse/i.test(blob);
  const isEcom = /shop|store|buy|cart|order|shipping|collection|product|price/i.test(blob);
  const isAgency = /agency|service|consulting|marketing|studio|hire|expert|solutions|talent|offshore|staffing/i.test(blob);

  const toolsCount = (websiteData.discoveredTools || []).length;
  const studiosCount = (websiteData.studios || []).length;
  const isStudioPlatform = Boolean(websiteData.isStudioPlatform);

  const industry = isAgency
    ? 'Tech Services & Consultancy'
    : isSaaS
      ? 'Tech & AI SaaS'
      : isEcom
        ? 'E-Commerce Brand'
        : 'Digital Innovation Platform';

  let recommendedDays, recommendedPostCount, videoReels;
  if (isStudioPlatform && (toolsCount > 40 || studiosCount >= 8)) {
    recommendedDays = 21; recommendedPostCount = 18; videoReels = 7;
  } else if (!isStudioPlatform && studiosCount >= 6) {
    recommendedDays = 12; recommendedPostCount = Math.min(11, Math.max(8, studiosCount + 1)); videoReels = 3;
  } else if (toolsCount > 15 || studiosCount >= 4) {
    recommendedDays = 14; recommendedPostCount = 12; videoReels = 5;
  } else {
    recommendedDays = 7; recommendedPostCount = 6; videoReels = 2;
  }

  const imagePosts = recommendedPostCount - videoReels;
  const rationale = isStudioPlatform
    ? `Because ${websiteData.domain} features ${studiosCount} distinct sections and ${toolsCount} discovered capabilities, an extended ${recommendedDays}-day campaign with ${recommendedPostCount} posts (${videoReels} high-energy video reels + ${imagePosts} visual showcases) gives every section dedicated viral spotlight without audience fatigue.`
    : `Because ${websiteData.domain} presents ${studiosCount} core services across ${industry}, an agile ${recommendedDays}-day campaign with ${recommendedPostCount} posts (${videoReels} video reels + ${imagePosts} visual cards) ensures each client solution is systematically highlighted.`;

  return {
    brandName: (websiteData.title || websiteData.domain).split(/[|\-–—:]/)[0].trim().slice(0, 40) || websiteData.domain,
    industry,
    targetAudience: isAgency
      ? 'Business decision-makers, CTOs and founders seeking expert tech partners'
      : isSaaS
        ? 'Developers, creators, and productivity professionals'
        : 'Modern consumers and online businesses',
    brandTone: isAgency ? 'Elite, Authoritative & Globally Trusted' : 'Bold & Cutting-Edge',
    uniqueSellingPoint: (websiteData.h1s && websiteData.h1s[0]) || websiteData.description || 'Global excellence, delivered seamlessly',
    recommendedDays,
    recommendedPostCount,
    recommendedBreakdown: { videoReels, imagePosts },
    rationale,
    primaryPlatforms: isAgency ? ['LinkedIn', 'Twitter/X', 'Instagram'] : ['Instagram', 'LinkedIn', 'Twitter/X', 'TikTok'],
    engine: 'heuristic',
  };
}

/* ------------------------------------------------------------------ */
/* Step 2 — Full campaign                                              */
/* ------------------------------------------------------------------ */
function buildVideoScript({ post, strategy, websiteData, feature }) {
  return {
    duration: '30s',
    audioVibe: 'Energetic Lo-Fi Tech Beat (128 BPM)',
    scenes: [
      {
        sceneNumber: 1,
        time: '0:00 - 0:03',
        visualDirection: `Fast-paced zoom onto ${strategy.brandName} visuals with dynamic text overlay.`,
        onScreenText: String(post.hook).slice(0, 48),
        voiceoverAudio: 'Stop doing this manually. Here is the future you have been waiting for.',
      },
      {
        sceneNumber: 2,
        time: '0:03 - 0:15',
        visualDirection: `Close-up demonstration: ${feature}. Snappy transitions.`,
        onScreenText: 'Built for speed. Designed for results.',
        voiceoverAudio: `${strategy.brandName} handles the heavy lifting instantly, so you can focus on what matters.`,
      },
      {
        sceneNumber: 3,
        time: '0:15 - 0:25',
        visualDirection: 'Showcase premium results and happy customer moments.',
        onScreenText: 'Real results. Zero stress.',
        voiceoverAudio: 'Imagine this running for you 24/7, completely on autopilot.',
      },
      {
        sceneNumber: 4,
        time: '0:25 - 0:30',
        visualDirection: `Final CTA screen with ${websiteData.domain} branding.`,
        onScreenText: `Try it now — ${websiteData.domain}`,
        voiceoverAudio: 'Link in bio. Start today and feel the difference.',
      },
    ],
  };
}

export function buildPostAIPrompts({ strategy, post, toolName, studio, toolObj = {}, websiteData = {} }) {
  const brandName = strategy?.brandName || websiteData?.title || 'Brand';
  const industry = strategy?.industry || 'Technology & Digital Solutions';
  const domain = websiteData?.domain || websiteData?.url || '';

  const inputShot = toolObj?.localName || 'screenshot_before_input.jpg';
  const outputShot = toolObj?.localName || 'screenshot_after_output.jpg';
  const testedInput = toolObj?.testedInput || 'Interactive parameters & source asset';
  const testedOutput = toolObj?.testedOutput || 'Instant 0s latency live execution';

  const aiImagePrompt = `PROMPT FOR CHATGPT (DALL-E 3) / GEMINI / MIDJOURNEY:
(💡 TIP FOR 100% "HUBAHU" BRAND ACCURACY: Attach BOTH '${inputShot}' (Before / Input) AND '${outputShot}' (After / Live Output) alongside this prompt into ChatGPT or Gemini!)

Prompt: Create a high-converting, photorealistic commercial product advertising hero visual for "${brandName}" (${industry}).
- Concept: A dual-display isometric 3D showcase illustrating the instantaneous transformation of "${toolName}" (${studio}).
- Left Display (Before / Input State): Sleek floating glassmorphic window displaying the initial input interface state (${testedInput}) as shown in '${inputShot}'.
- Right Display (After / Live Output): Glowing neon holographic output panel showcasing the verified live transformation (${testedOutput}) as shown in '${outputShot}'.
- Visual Style: Ultra-clean enterprise aesthetic, luxury minimalist studio lighting, subtle neon cyber accents, vibrant holographic reflections.
- Composition: Centered social media format (4:5 / 1:1), crisp depth of field, high dynamic range (HDR), 8K photorealistic render, Unreal Engine 5 commercial lighting.
- Details: A dynamic electric light pulse connecting the input to the output, proving 0-second execution latency without friction.`;

  const aiVideoPrompt = `PROMPT FOR HIGGSFIELD / RUNWAY GEN-3 / LUMA / SORA:
(💡 TIP FOR VIRAL COMMERCIAL REEL: Upload '${inputShot}' as the START FRAME, and use '${outputShot}' as the TRANSFORMATION / CLIMAX FRAME!)

Prompt: A cinematic 9:16 vertical commercial video reel showcasing the live transformation of "${toolName}" on ${brandName}.
- Scene 1 (0:00 - 0:03) START FRAME (INPUT):
  Dynamic push-in camera into the sleek interface shown in '${inputShot}'. The user parameters/file (${testedInput}) are loaded and ready. On-screen bold typography: "${post?.hook || `Instant ${toolName}`}".
- Scene 2 (0:03 - 0:06) TRANSFORMATION PULSE:
  A glowing digital ripple activates across the screen as the execute button is pressed. High-speed cyber particle wave sweeps across the interface.
- Scene 3 (0:06 - 0:09) CLIMAX OUTPUT:
  The interface seamlessly morphs to reveal the live rendered output shown in '${outputShot}' (${testedOutput}) with instant 0-second latency. Glowing success metrics highlight the flawless result.
- Scene 4 (0:09 - 0:10) CALL-TO-ACTION:
  Smooth cinematic pull-back deceleration onto ${brandName}'s glowing 3D obsidian logo. On-screen CTA: "${post?.callToAction || `Try ${toolName} Now ➔ Visit ${domain}`}".
- Camera & Motion: Smooth robotic gimbal motion, speed ramp at transition, 4K 60fps photorealistic commercial grade.
- Audio Vibe: Futuristic bass drop into an energetic, upbeat commercial beat (128 BPM).`;

  return { aiImagePrompt, aiVideoPrompt };
}

export function generateMasterImagePrompt({ strategy, websiteData, tools = [] }) {
  const brandName = strategy?.brandName || websiteData?.title || 'Brand';
  const industry = strategy?.industry || 'Technology & Digital Solutions';
  const domain = websiteData?.domain || websiteData?.url || '';
  const usp = strategy?.uniqueSellingPoint || websiteData?.description || '';
  const tone = strategy?.brandTone || 'Ultra-modern, authoritative, premium tech aesthetic';
  const studiosList = (websiteData?.studios || []).slice(0, 8).join(', ') || 'Enterprise Core Platform';
  const toolList = (tools && tools.length > 0 ? tools : (websiteData?.discoveredTools || [])).slice(0, 16);
  const toolBulletPoints = toolList.map((t) => `- ${t.name} (${t.studio}): ${t.description || 'Verified live module'}`).join('\n');

  const shots = (websiteData?.screenshots || [])
    .map((s) => `📸 [${s.localName || 'screenshot.jpg'}] -> ${s.title || s.description || 'Live section proof'}`)
    .slice(0, 8);
  const screenshotGuide = shots.length > 0
    ? shots.join('\n')
    : `📸 [desktop.jpg] -> Full platform landing page & hero\n📸 [section-1.jpg] -> Primary service & features suite`;

  return `================================================================================
🌟 MASTER BRAND AI IMAGE GENERATION PROMPT (ENTIRE WEBSITE & HERO COMMERCIAL ART)
================================================================================
TARGET AI ENGINES: ChatGPT (GPT-4o DALL-E 3), Google Gemini (Imagen 3), Midjourney v6, Leonardo AI, Stable Diffusion XL

[CRITICAL INSTRUCTIONS FOR 100% "HUBAHU" ACCURATE BRAND VISUALS]:
1. Before generating the visual, ATTACH the following screenshots from the /all_website_screenshots/ folder directly into your AI chat:
${screenshotGuide}
2. Instruct the AI: "Use the attached screenshots as strict visual reference for the user interface, brand styling, color palette, and layout. Recreate this authentic UI faithfully within the 3D showcase below."

--------------------------------------------------------------------------------
[PROMPT TO COPY & PASTE INTO CHATGPT / GEMINI / MIDJOURNEY]:
--------------------------------------------------------------------------------
"Create a breathtaking, ultra-high-definition commercial brand advertising hero visual for '${brandName}' (${domain}).

BRAND DNA & MISSION:
- Brand: ${brandName}
- Website URL: ${domain}
- Industry: ${industry}
- Value Proposition: ${usp}
- Tone & Aesthetic: ${tone}

COMPLETE PLATFORM CAPABILITIES (FAITHFULLY REPRESENT ALL OF THESE MODULES):
${toolBulletPoints || `- All core services and features of ${brandName}`}

ART DIRECTION & 3D COMPOSITION:
- Centerpiece: A multi-layered, floating glassmorphic futuristic workstation displaying ${brandName}'s real live web platform (matching the attached reference screenshots with exact typography and UI structure).
- Orbiting Modular Displays: Sleek isometric glowing UI panels floating around the central workstation, each spotlighting key platform suites: ${studiosList}.
- Visual Details: Neon cybernetic edge-lighting, subtle holographic data charts, ultra-crisp glass reflections, dynamic light trails connecting the modules.
- Environment & Lighting: Dark obsidian luxury studio background with vibrant brand glow, cinematic volumetric rim lighting, ray-traced shadows, 8k resolution, photorealistic Unreal Engine 5 render style.
- Aspect Ratio: 16:9 for website hero & desktop ads, or 4:5 for Instagram/LinkedIn high-CTR feeds.
- Quality: Commercial advertising benchmark, crisp depth of field, photorealistic textures, zero distortion."
================================================================================`;
}

export function generateMasterVideoPrompt({ strategy, websiteData, tools = [] }) {
  const brandName = strategy?.brandName || websiteData?.title || 'Brand';
  const industry = strategy?.industry || 'Technology & Digital Solutions';
  const domain = websiteData?.domain || websiteData?.url || '';
  const tone = strategy?.brandTone || 'High-energy, authoritative, cinematic';
  const studiosList = (websiteData?.studios || []).slice(0, 6).join(' ➔ ') || 'Core Platform Ecosystem';
  const toolList = (tools && tools.length > 0 ? tools : (websiteData?.discoveredTools || [])).slice(0, 10);
  const topTools = toolList.map((t) => t.name).join(', ') || 'All Platform Services';

  const keyframeGuide = (websiteData?.screenshots || [])
    .map((s) => `🎥 [${s.localName || 'screenshot.jpg'}] -> Use as starting frame or mid-transition keyframe for ${s.title || 'tool'}`)
    .slice(0, 5)
    .join('\n') || `🎥 [desktop.jpg] -> Starting Hero Frame\n🎥 [section-1.jpg] -> Mid-Transition Feature Frame`;

  return `================================================================================
🎬 MASTER BRAND AI VIDEO REEL PROMPT (VIRAL COMMERCIAL & ECOSYSTEM SHOWCASE)
================================================================================
TARGET AI ENGINES: Higgsfield AI, Runway Gen-3 Alpha, Luma Dream Machine, OpenAI Sora, Kling AI, Hailuo, Pika 2.0

[CRITICAL INSTRUCTIONS FOR 100% "HUBAHU" ACCURATE BRAND REEL]:
1. Starting Frame / Image-to-Video Source (INPUT): Upload 'desktop.jpg' as the initial input frame into the video AI tool.
2. Climax / Transformation Keyframe (LIVE OUTPUT): Upload a section screenshot as the climax/transformation frame!
3. Keyframe References (for multi-prompt / multi-frame tools):
${keyframeGuide}
4. This prompt instructs the AI to animate the transformation from the real input state to the live generated output without hallucinating generic filler content.

--------------------------------------------------------------------------------
[PROMPT TO COPY & PASTE INTO HIGGSFIELD / RUNWAY / LUMA / SORA]:
--------------------------------------------------------------------------------
"A cinematic, viral 30-second commercial brand showcase reel for '${brandName}' (${domain}). Format: 9:16 vertical short-form reel (or 16:9 widescreen commercial).

CINEMATIC SCENE PROGRESSION:
- Scene 1 (0:00 - 0:04) THE VIRAL HOOK:
  Fast dynamic push-in camera into the sleek ${brandName} interface from the uploaded reference frame. Glowing digital shockwave ripples across the screen. On-screen bold typography: 'The new standard in ${industry}.'
- Scene 2 (0:04 - 0:12) COMPLETE ECOSYSTEM WALKTHROUGH:
  Snappy seamless 3D camera pan touring all key suites in sequence: ${studiosList}. Holographic data points light up as modules seamlessly activate with instant 0-second latency.
- Scene 3 (0:12 - 0:20) LIVE FEATURE DEMONSTRATION:
  Macro close-up on live interactive tools (${topTools}). High-speed execution, fluid particle transitions, crisp glass reflections, demonstrating effortless speed and enterprise-grade reliability.
- Scene 4 (0:20 - 0:26) AUTHORITY & BUSINESS IMPACT:
  Epic wide pull-back showing global scale, seamless collaboration, trusted compliance, and unstoppable growth powered by ${brandName}.
- Scene 5 (0:26 - 0:30) FINAL CALL-TO-ACTION:
  Cinematic deceleration onto a glowing 3D emblem of '${brandName}'. Bold CTA banner: 'Experience ${brandName} Today ➔ Visit ${domain}'.

CAMERA & TECHNICAL SPECIFICATIONS:
- Motion: Smooth robotic gimbal motion, seamless speed ramps, fast whip pans between scenes, 4k 60fps photorealistic commercial grade.
- Lighting & Color: Sleek obsidian black background, electric cyber accents, volumetric rim lighting, high-contrast HDR.
- Audio Vibe: Futuristic cinematic bass drop into an energetic, upbeat tech beat (128 BPM)."
================================================================================`;
}

export function generateMasterBrandPrompt({ strategy, websiteData, tools = [] }) {
  const brandName = strategy?.brandName || websiteData?.title || 'Brand';
  const industry = strategy?.industry || 'Technology & Digital Solutions';
  const audience = strategy?.targetAudience || 'Modern Businesses & Consumers';
  const usp = strategy?.uniqueSellingPoint || websiteData?.description || '';
  const tone = strategy?.brandTone || 'Authoritative, innovative, engaging, high-conversion';
  const domain = websiteData?.domain || websiteData?.url || '';
  const studiosList = (websiteData?.studios || []).join(', ') || 'Core Platform Modules';

  const toolListStr = (tools && tools.length > 0 ? tools : (websiteData?.discoveredTools || []))
    .slice(0, 24)
    .map((t, idx) => `${idx + 1}. ${t.name} (${t.studio || 'Core'}): ${t.description || 'Verified live capability'}`)
    .join('\n');

  const imgPrompt = generateMasterImagePrompt({ strategy, websiteData, tools });
  const vidPrompt = generateMasterVideoPrompt({ strategy, websiteData, tools });

  return `================================================================================
MASTER BRAND & CAMPAIGN AI PROMPT (FOR CHATGPT / GEMINI / CLAUDE / MIDJOURNEY)
================================================================================
ROLE: You are the Chief Marketing Officer (CMO) and Lead Creative Director for ${brandName}.

[BRAND ARCHITECTURE & POSITIONING]
- Brand Name: ${brandName}
- Website / Platform: ${domain}
- Primary Industry: ${industry}
- Brand Voice & Tone: ${tone}
- Target Audience: ${audience}
- Unique Value Proposition (USP): ${usp}

[CORE SUITES / STUDIOS / SECTIONS]
${studiosList}

[KEY CAPABILITIES & TOOLS DISCOVERED LIVE]
${toolListStr}

[CORE CAMPAIGN OBJECTIVE]
Produce high-converting, viral, multi-platform social media posts, advertising creatives, video scripts, and marketing assets that position ${brandName} as the undeniable industry leader.

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

${imgPrompt}

${vidPrompt}
================================================================================`;
}

export function generateMasterBrandBlueprint({ strategy, websiteData, tools = [] }) {
  const brandName = strategy?.brandName || websiteData?.title || 'Brand';
  const industry = strategy?.industry || 'Technology & Digital Solutions';
  const domain = websiteData?.domain || websiteData?.url || '';
  const usp = strategy?.uniqueSellingPoint || websiteData?.description || '';
  const tone = strategy?.brandTone || 'High-conversion, authoritative, executive';
  const audience = strategy?.targetAudience || 'Modern Businesses & Consumers';
  const studios = websiteData?.studios || [];
  const discoveredTools = (tools && tools.length > 0) ? tools : (websiteData?.discoveredTools || []);

  const imgPrompt = generateMasterImagePrompt({ strategy, websiteData, tools: discoveredTools });
  const vidPrompt = generateMasterVideoPrompt({ strategy, websiteData, tools: discoveredTools });

  return `# ==============================================================================
# 🌟 OMNIPOST AI MASTER BRAND BLUEPRINT & MARKETING OPERATING SYSTEM
# BRAND: ${brandName} | PLATFORM: ${domain}
# ==============================================================================

## 1. EXECUTIVE BRAND POSITIONING & ARCHITECTURE
- Official Brand Name: ${brandName}
- Platform URL: ${websiteData?.url || domain}
- Industry & Domain: ${industry}
- Core Unique Selling Proposition (USP): ${usp}
- Target Audience: ${audience}
- Brand Personality & Tone: ${tone}

## 2. COMPLETE WEBSITE ECOSYSTEM & SUITES MAP
Total Core Sections/Studios: ${studios.length}
Total Verified Capabilities: ${discoveredTools.length}

${studios.map((s, idx) => {
    const toolsInStudio = discoveredTools.filter((t) => (t.studio || '').toLowerCase() === s.toLowerCase());
    return `### Suite ${idx + 1}: ${s}
${toolsInStudio.length > 0
  ? toolsInStudio.map((t) => `  - ⚡ ${t.name}: ${t.description || 'Verified enterprise capability'}`).join('\n')
  : `  - Verified core solution for ${s}`}`;
  }).join('\n\n')}

## 3. 100% "HUBAHU" SCREENSHOT REFERENCE PROTOCOL
To generate commercial advertising visuals and viral videos that replicate ${brandName}'s real website without hallucination:
1. Locate the screenshots in the \`/all_website_screenshots/\` folder of your ZIP.
2. For ChatGPT (GPT-4o DALL-E 3) or Gemini Pro (Imagen 3):
   Attach the relevant screenshot(s) directly to your prompt to generate authentic, brand-accurate visuals.
3. For Higgsfield AI or Runway Gen-3 Alpha (Image-to-Video):
   Upload \`desktop.jpg\` as the START FRAME and a section screenshot as the TRANSFORMATION / CLIMAX FRAME.

## 4. MASTER AI IMAGE GENERATION PROMPT (ENTIRE WEBSITE HERO ART)
${imgPrompt}

## 5. MASTER AI VIDEO REEL PROMPT (VIRAL COMMERCIAL & ECOSYSTEM REEL)
${vidPrompt}

## 6. PROMPT TO GENERATE INFINITE CAMPAIGN ASSETS IN CHATGPT / GEMINI / CLAUDE
Copy and paste this entire document into ChatGPT (GPT-4o) or Claude, then ask:
- "Write 10 high-converting LinkedIn carousel outlines for ${brandName}"
- "Generate 5 high-CTR Facebook conversion ad scripts targeting ${audience}"
- "Produce a 7-day email onboarding sequence for ${brandName}"
==============================================================================`;
}

function buildTemplateCampaign({ websiteData, strategy, totalPosts, days, customPrompt, videoAt, platforms, bestTimes, dayOf }) {
  const tools = (websiteData.discoveredTools && websiteData.discoveredTools.length > 0)
    ? websiteData.discoveredTools
    : (websiteData.studios || []).map((s) => ({
        name: `${s} Solutions`,
        studio: s,
        description: `Verified enterprise offering in ${s}`,
      }));

  const isAgency = /agency|service|consulting|marketing|studio|hire|expert|solutions|talent|offshore|staffing/i.test(
    `${strategy.industry} ${strategy.brandName} ${websiteData.title}`
  );

  const results = [];
  for (let i = 0; i < totalPosts; i++) {
    const isVideo = videoAt.has(i);
    const platform = platforms[i % platforms.length];
    const tool = tools[i % tools.length];
    const studio = tool.studio || (websiteData.studios || [])[i % (websiteData.studios?.length || 1)] || 'Core Services';

    const hook = isAgency
      ? (isVideo
          ? `How top enterprises scale engineering with ${tool.name}`
          : `Eliminate bottlenecks: ${tool.name} in ${studio}`)
      : (isVideo
          ? `Why everyone is talking about ${tool.name} in ${studio}`
          : `Transform your workflow with ${tool.name} on ${strategy.brandName}`);

    const caption = isAgency
      ? `Looking to scale your capacity without the overhead?\n\nMeet ${tool.name} under ${studio} from ${strategy.brandName}.\n\n` +
        `✅ Proven expertise with real track records\n` +
        `✅ Enterprise governance & reliability\n` +
        `✅ Dedicated support with seamless delivery\n\n` +
        `${customPrompt ? `🎯 Focus: ${customPrompt}\n\n` : ''}` +
        `👇 Ready to build? Learn more at ${websiteData.domain}`
      : `Ready to upgrade your workflow?\n\nDiscover ${tool.name} inside ${studio} on ${strategy.brandName}.\n\n` +
        `⚡ ${tool.description || 'Fast, reliable, and modern'}\n` +
        `🔒 Built for reliability and seamless performance\n` +
        `✨ Instant access without unnecessary friction\n\n` +
        `${customPrompt ? `🎯 Focus: ${customPrompt}\n\n` : ''}` +
        `👇 Try it now at ${websiteData.domain}`;

    const cta = `Explore ${tool.name} 👉 ${websiteData.domain}`;

    const brandClean = strategy.brandName.replace(/[^a-zA-Z0-9]/g, '');
    const toolClean = tool.name.replace(/[^a-zA-Z0-9]/g, '');
    const studioClean = studio.replace(/[^a-zA-Z0-9]/g, '');

    const hashtags = isAgency
      ? [`#${brandClean}`, `#${toolClean}`, `#${studioClean}`, '#BusinessGrowth', '#Leadership', '#GlobalWorkforce', '#Engineering', '#FutureOfWork']
      : [`#${brandClean}`, `#${toolClean}`, `#${studioClean}`, '#Innovation', '#TechSolutions', '#Productivity', '#NextGenTech'];

    const prompts = buildPostAIPrompts({
      strategy,
      post: { hook, callToAction: cta },
      toolName: tool.name,
      studio,
      toolObj: tool,
      websiteData,
    });

    const shot = (websiteData.capturedScreenshots || [])[i % (websiteData.capturedScreenshots?.length || 1)];

    results.push({
      id: `post-${i + 1}`,
      day: `Day ${dayOf(i)}`,
      platform,
      contentType: isVideo ? 'Video Reel / Short' : (i % 3 === 0 ? 'Carousel Graphic' : 'Image Post'),
      studio,
      toolName: tool.name,
      hook,
      caption,
      hashtags,
      callToAction: cta,
      bestTime: bestTimes[i % bestTimes.length],
      inputScreenshotUrl: shot?.webUrl || websiteData.screenshotUrl,
      outputScreenshotUrl: shot?.webUrl || websiteData.screenshotUrl,
      screenshotUrl: shot?.webUrl || websiteData.screenshotUrl,
      rawScreenshot: shot?.webUrl || websiteData.screenshotUrl,
      testedInput: tool.testedInput || 'Interactive Parameters',
      testedOutput: tool.testedOutput || 'Live Computation Executed',
      imagePrompt: prompts.aiImagePrompt,
      aiImagePrompt: prompts.aiImagePrompt,
      aiVideoPrompt: prompts.aiVideoPrompt,
      videoScript: isVideo
        ? buildVideoScript({ post: { hook, callToAction: cta }, strategy, websiteData, feature: `${tool.name} (${studio})` })
        : null,
      engine: 'dynamic-template',
    });
  }
  return results;
}

export async function generateFullCampaign({
  websiteData,
  strategy,
  totalPosts,
  days,
  customPrompt,
  selectedPlatforms,
  userApiKey,
}) {
  const videoTarget = Math.max(1, Math.min(totalPosts - 1, strategy.recommendedBreakdown?.videoReels || Math.round(totalPosts * 0.4)));

  const videoAt = new Set();
  for (let j = 0; j < videoTarget; j++) {
    videoAt.add(Math.min(totalPosts - 1, Math.floor(((j + 0.5) * totalPosts) / videoTarget)));
  }

  const platforms = selectedPlatforms && selectedPlatforms.length
    ? selectedPlatforms
    : (strategy.primaryPlatforms?.length ? strategy.primaryPlatforms : ['Instagram', 'LinkedIn', 'Twitter/X', 'TikTok']);
  const bestTimes = ['9:00 AM', '1:00 PM', '6:30 PM', '8:00 PM'];
  const dayOf = (i) => Math.min(days, Math.floor((i * days) / totalPosts) + 1);

  const studiosList = (websiteData.studios || []).join(', ') || 'Platform Offerings';
  const toolsList = (websiteData.discoveredTools || []).slice(0, 24).map((t) => `"${t.name}" (${t.studio})`).join(', ');

  if (userApiKey) {
    try {
      const prompt = `You are a world-class CMO and viral social media copywriter.
Create an engaging ${days}-day campaign of exactly ${totalPosts} bespoke, viral posts for this brand:

BRAND: ${strategy.brandName}
INDUSTRY: ${strategy.industry}
TONE: ${strategy.brandTone}
AUDIENCE: ${strategy.targetAudience}
USP: ${strategy.uniqueSellingPoint}
WEBSITE: ${websiteData.url} — ${websiteData.title}
CORE SECTIONS: ${studiosList}
DISCOVERED CAPABILITIES: ${toolsList}
KEY HEADINGS: ${(websiteData.h1s || []).concat(websiteData.h2s || []).slice(0, 8).join(' | ')}
${customPrompt ? `USER SPECIAL FOCUS: ${customPrompt}` : ''}

CRITICAL COPYWRITING INSTRUCTIONS:
- ONLY assign each post to one of these platforms: ${platforms.join(', ')}.
- Write STRICTLY in the authentic voice of ${strategy.brandName} (${strategy.industry}).
- Every post MUST spotlight a specific Section and a specific Capability from the list above.
- Captions: first line = scroll-stopping hook naming the capability + outcome; body 3-5 punchy lines; CTA invites to ${websiteData.domain}.
- Hashtags: 8-10 relevant, customized for ${strategy.brandName}.
- imagePrompt: vivid photorealistic commercial advertising prompt for this post.
- videoScript: for video posts (${[...videoAt].join(', ')}), 4 cinematic scenes with time, visualDirection, onScreenText, voiceoverAudio.

Return ONLY valid JSON:
{ "posts": [ { "day": "Day 1", "platform": "${platforms[0]}", "contentType": "Video Reel / Short" OR "Image Post" OR "Carousel Graphic", "studio": "...", "toolName": "...", "hook": "...", "caption": "...", "hashtags": ["#Tag1"], "callToAction": "...", "bestTime": "9:00 AM", "imagePrompt": "...", "videoScript": null or { "duration": "30s", "audioVibe": "...", "scenes": [ { "sceneNumber": 1, "time": "0:00 - 0:03", "visualDirection": "...", "onScreenText": "...", "voiceoverAudio": "..." } ] } } ] }`;

      const raw = await geminiText(userApiKey, prompt, 120000);
      const parsed = parseJsonLoose(raw);
      const aiPosts = Array.isArray(parsed) ? parsed : parsed?.posts;
      if (Array.isArray(aiPosts) && aiPosts.length >= Math.min(3, totalPosts)) {
        const postsResult = aiPosts.slice(0, totalPosts).map((p, i) => {
          const mustBeVideo = videoAt.has(i) || Boolean(p.videoScript && p.videoScript.scenes && p.videoScript.scenes.length);
          const toolObj = (websiteData.discoveredTools || [])[i % (websiteData.discoveredTools?.length || 1)] || {};
          const studio = p.studio || toolObj.studio || (websiteData.studios || [])[i % (websiteData.studios?.length || 1)] || 'Core Services';
          const toolName = p.toolName || toolObj.name || `Offering ${i + 1}`;
          const hook = String(p.hook || `Transform your operations with ${toolName} in ${studio}`).slice(0, 140);
          const cta = String(p.callToAction || `Discover ${toolName} on ${websiteData.domain}`).slice(0, 200);

          const script = mustBeVideo
            ? (p.videoScript && p.videoScript.scenes && p.videoScript.scenes.length
                ? p.videoScript
                : buildVideoScript({ post: { hook, callToAction: cta }, strategy, websiteData, feature: `${toolName} (${studio})` }))
            : null;

          const platformCandidate = platforms.find((pl) => pl.toLowerCase() === String(p.platform || '').toLowerCase());
          const finalPlatform = platformCandidate || platforms[i % platforms.length];

          const brandTag = `#${String(strategy.brandName || '').replace(/[^a-zA-Z0-9]/g, '')}`;
          const industryTag = `#${String(strategy.industry || '').split(' ')[0].replace(/[^a-zA-Z0-9]/g, '')}`;
          const shot = (websiteData.capturedScreenshots || [])[i % (websiteData.capturedScreenshots?.length || 1)];

          const prompts = buildPostAIPrompts({
            strategy,
            post: { hook, callToAction: cta },
            toolName,
            studio,
            toolObj,
            websiteData,
          });

          return {
            id: `post-${i + 1}`,
            day: `Day ${dayOf(i)}`,
            platform: finalPlatform,
            contentType: mustBeVideo ? 'Video Reel / Short' : (i % 3 === 0 ? 'Carousel Graphic' : 'Image Post'),
            studio,
            toolName,
            hook,
            caption: String(p.caption || '').slice(0, 2200),
            hashtags: Array.isArray(p.hashtags) && p.hashtags.length > 0 ? p.hashtags.slice(0, 14) : [
              brandTag, industryTag,
              `#${String(toolName).replace(/[^a-zA-Z0-9]/g, '')}`,
              `#${String(studio).replace(/[^a-zA-Z0-9]/g, '')}`,
              '#BusinessGrowth', '#Innovation', '#FutureOfWork',
            ],
            callToAction: cta,
            bestTime: p.bestTime || bestTimes[i % bestTimes.length],
            inputScreenshotUrl: shot?.webUrl || websiteData.screenshotUrl,
            outputScreenshotUrl: shot?.webUrl || websiteData.screenshotUrl,
            screenshotUrl: shot?.webUrl || websiteData.screenshotUrl,
            rawScreenshot: shot?.webUrl || websiteData.screenshotUrl,
            testedInput: toolObj.testedInput || 'Interactive Parameters',
            testedOutput: toolObj.testedOutput || 'Live Computation Executed',
            imagePrompt: String(p.imagePrompt || prompts.aiImagePrompt).slice(0, 600),
            aiImagePrompt: prompts.aiImagePrompt,
            aiVideoPrompt: prompts.aiVideoPrompt,
            videoScript: script,
            engine: 'gemini',
          };
        });

        postsResult.masterBrandPrompt = generateMasterBrandPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
        postsResult.masterImagePrompt = generateMasterImagePrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
        postsResult.masterVideoPrompt = generateMasterVideoPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
        return postsResult;
      }
    } catch {
      /* template fallback below */
    }
  }

  const templatePosts = buildTemplateCampaign({ websiteData, strategy, totalPosts, days, customPrompt, videoAt, platforms, bestTimes, dayOf });
  templatePosts.masterBrandPrompt = generateMasterBrandPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
  templatePosts.masterImagePrompt = generateMasterImagePrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
  templatePosts.masterVideoPrompt = generateMasterVideoPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
  return templatePosts;
}
