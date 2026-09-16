import axios from 'axios';

const TEXT_MODELS = [
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-flash'
];

/**
 * Gemini text generation via REST (no SDK version lock-in).
 * Tries modern -> older model names until one succeeds.
 */
async function tryTextModel(model, apiKey, prompt, timeoutMs) {
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 8192 }
    },
    { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, timeout: timeoutMs }
  );
  const parts = res.data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('');
  if (!text.trim()) throw new Error('Empty Gemini response');
  return text;
}

export async function geminiText(apiKey, prompt, timeoutMs = 90000) {
  let lastErr;
  for (const m of TEXT_MODELS) {
    try {
      return await tryTextModel(m, apiKey, prompt, timeoutMs);
    } catch (e) {
      lastErr = e;
      console.warn(`[AIEngine] ${m} failed:`, e.response?.data?.error?.message || e.message);
    }
  }
  throw lastErr;
}

export function parseJsonLoose(text) {
  if (!text) throw new Error('Empty response');
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start === -1 || end === -1) throw new Error('No JSON found in AI response');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
/**
 * Step 1 — Elite strategist analysis of the scraped website.
 * Returns the optimal campaign plan, including the AI's own recommendation
 * for how many posts are truly needed (may differ from the default 10).
 */
export async function analyzeWebsiteStrategy(websiteData, customPrompt = '', userApiKey = '') {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const tr = websiteData.testReport || {};
      const toolsCount = (websiteData.discoveredTools || []).length;
      const studiosCount = (websiteData.studios || []).length;
      const isStudioPlatform = Boolean(websiteData.isStudioPlatform);
      const sectionLabel = websiteData.sectionTypeLabel || (isStudioPlatform ? 'Studios' : 'Sections & Services');
      const toolsList = (websiteData.discoveredTools || []).slice(0, 20).map((t) => t.name).join(', ') || 'Comprehensive suite';
      const studiosList = (websiteData.studios || []).join(', ') || 'Core Platform Suite';

      const prompt = `You are an elite, CMO-level marketing strategist and viral social media architect.
Analyze this real-world website crawl and formulate a tailored, non-generic social media campaign:

BRAND / DOMAIN: ${websiteData.domain}
PAGE TITLE: ${websiteData.title}
META DESCRIPTION: ${websiteData.description}
PLATFORM TYPE: ${isStudioPlatform ? 'Multi-Studio Tool Suite' : 'Corporate / SaaS / Agency Platform'}
DISCOVERED ${sectionLabel.toUpperCase()} COUNT: ${studiosCount} (${studiosList})
DISCOVERED TOOLS / CAPABILITIES: ${toolsCount}
FEATURED TOOLS PREVIEW: ${toolsList}
KEY FEATURES: ${(websiteData.features || []).slice(0, 8).join(' | ')}
HEADINGS: ${(websiteData.h1s || []).join(' | ')}
SITE HEALTH SCORE: ${tr.score ?? 'n/a'}/100
CONTENT OVERVIEW: ${String(websiteData.rawSummary || '').slice(0, 1500)}
${customPrompt ? `USER SPECIAL GOAL/PROMPT: ${customPrompt}` : ''}

CRITICAL DYNAMIC REQUIREMENT:
The post count, duration, and video-to-image breakdown MUST BE STRICTLY DYNAMIC based on this website's exact nature:
- For massive multi-studio platforms with 50-100+ tools (e.g. Toolverse): Recommend 18 to 22 posts over 21 to 30 days (e.g. 8 Video Reels + 10-14 Visual Cards/Carousels) to spotlight distinct tools across studios.
- For modern corporate SaaS or agency platforms (e.g. ${websiteData.domain} with ~${studiosCount} core services): Recommend 8 to 11 posts over 10 to 14 days (e.g. 3 to 4 Video Reels + 5 to 7 Visual Cards) highlighting each service and client outcome.
- For small single-product or micro-tools (1-3 features): Recommend 5 to 7 posts over 7 days (e.g. 2 Video Reels + 3 to 5 Visual Cards).

Return ONLY a valid JSON object matching this structure with your DYNAMIC values:
{
  "brandName": "Exact Brand Name",
  "industry": "e.g. Offshore Staffing & Tech / Developer Tools / SaaS",
  "targetAudience": "Detailed audience profile",
  "brandTone": "e.g. Authoritative & Futuristic / High-Trust Enterprise",
  "uniqueSellingPoint": "One punchy value proposition sentence",
  "recommendedDays": <dynamic number: 7, 10, 12, 14, 21, or 30>,
  "recommendedPostCount": <dynamic number tailored to site scale>,
  "recommendedBreakdown": { "videoReels": <dynamic number>, "imagePosts": <dynamic number> },
  "rationale": "Comprehensive explanation of why this exact post count and breakdown was calculated for this specific website's scale and tool count.",
  "primaryPlatforms": ["Instagram", "LinkedIn", "Twitter/X", "TikTok"]
}`;

      const raw = await geminiText(apiKey, prompt, 60000);
      const parsed = parseJsonLoose(raw);
      if (parsed && parsed.brandName) {
        const defaultPosts = isStudioPlatform && toolsCount > 30 ? 18 : studiosCount >= 6 ? 9 : 6;
        const postCount = parseInt(parsed.recommendedPostCount) || defaultPosts;
        const videoRatio = parsed.recommendedBreakdown?.videoReels 
          ? parseInt(parsed.recommendedBreakdown.videoReels) 
          : Math.max(2, Math.round(postCount * 0.4));
        parsed.recommendedPostCount = postCount;
        parsed.recommendedDays = parseInt(parsed.recommendedDays) || (isStudioPlatform && toolsCount > 30 ? 21 : studiosCount >= 6 ? 12 : 7);
        parsed.recommendedBreakdown = {
          videoReels: videoRatio,
          imagePosts: Math.max(1, postCount - videoRatio)
        };
        parsed.engine = 'gemini';
        return parsed;
      }
    } catch (err) {
      console.warn('[AIEngine] Gemini strategy failed, using heuristic fallback:', err.message);
    }
  }

  /* ---- Smart heuristic fallback (works 100% without any API key) ---- */
  return heuristicStrategy(websiteData);
}

function heuristicStrategy(websiteData) {
  const blob = `${websiteData.title} ${websiteData.description} ${websiteData.rawSummary}`;
  const isSaaS = /software|app\b|\bai\b|api|platform|tool|cloud|data|bot|dashboard|analytics/i.test(blob);
  const isEcom = /shop|store|buy|cart|order|shipping|collection|product|price/i.test(blob);
  const isAgency = /agency|service|consulting|marketing|studio|hire|expert|solutions|talent|offshore|staffing|dubai/i.test(blob);

  const toolsCount = (websiteData.discoveredTools || []).length;
  const studiosCount = (websiteData.studios || []).length;
  const isStudioPlatform = Boolean(websiteData.isStudioPlatform);
  const sectionLabel = websiteData.sectionTypeLabel || (isStudioPlatform ? 'Studios' : 'Key Sections & Services');

  const industry = isAgency
    ? 'Offshore Tech & Talent Consultancy'
    : isSaaS
      ? 'Tech & AI SaaS'
      : isEcom
        ? 'E-Commerce Brand'
        : 'Digital Innovation Platform';

  // DYNAMICALLY SCALE BASED ON REAL TOOL & STUDIO/SECTION COUNT
  let recommendedDays;
  let recommendedPostCount;
  let videoReels;

  if (isStudioPlatform && (toolsCount > 40 || studiosCount >= 8)) {
    // Massive portal (like Toolverse)
    recommendedDays = 21;
    recommendedPostCount = 18;
    videoReels = 7;
  } else if (!isStudioPlatform && studiosCount >= 6) {
    // Agency or SaaS with 6-10 major sections (like Innovex AI)
    recommendedDays = 12;
    recommendedPostCount = Math.min(11, Math.max(8, studiosCount + 1));
    videoReels = 3;
  } else if (toolsCount > 15 || studiosCount >= 4) {
    // Mid-sized SaaS
    recommendedDays = 14;
    recommendedPostCount = 12;
    videoReels = 5;
  } else {
    // Focused or small product
    recommendedDays = 7;
    recommendedPostCount = 6;
    videoReels = 2;
  }

  const imagePosts = recommendedPostCount - videoReels;

  const rationale = isStudioPlatform
    ? `Because ${websiteData.domain} features ${studiosCount} distinct studios and over ${toolsCount} tools, an extended ${recommendedDays}-day campaign with ${recommendedPostCount} posts (${videoReels} high-energy video reels + ${imagePosts} visual showcases) gives every studio dedicated viral spotlight without audience fatigue.`
    : `Because ${websiteData.domain} presents ${studiosCount} core services and value pillars across ${industry}, an agile ${recommendedDays}-day campaign with ${recommendedPostCount} posts (${videoReels} executive video reels + ${imagePosts} visual cards) ensures each client solution is systematically highlighted.`;

  return {
    brandName: (websiteData.title || websiteData.domain).split(/[|\-–—:]/)[0].trim().slice(0, 40) || websiteData.domain,
    industry,
    targetAudience: isAgency
      ? 'Global enterprise leaders, CTOs, and founders seeking elite offshore engineering and tech teams'
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
    engine: 'heuristic'
  };
}

/**
 * Step 2 — Full campaign generation.
 * One AI pass produces every post's copy; dynamic templates guarantee
 * the app works perfectly tailored to the brand's exact industry.
 */
export async function generateFullCampaign({
  websiteData,
  strategy,
  totalPosts,
  days,
  customPrompt,
  selectedPlatforms,
  userApiKey
}) {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  const videoTarget = Math.max(1, Math.min(totalPosts - 1, strategy.recommendedBreakdown?.videoReels || Math.round(totalPosts * 0.4)));

  /* which indexes are video posts (evenly spread) */
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
  const toolsList = (websiteData.discoveredTools || []).slice(0, 24).map(t => `"${t.name}" (${t.studio})`).join(', ');

  if (apiKey) {
    try {
      const prompt = `You are a world-class CMO and viral social media copywriter.
Create an engaging ${days}-day campaign of exactly ${totalPosts} bespoke, viral posts for this brand:

BRAND: ${strategy.brandName}
INDUSTRY: ${strategy.industry}
TONE: ${strategy.brandTone}
AUDIENCE: ${strategy.targetAudience}
USP: ${strategy.uniqueSellingPoint}
WEBSITE: ${websiteData.url} — ${websiteData.title}
CORE SECTIONS / STUDIOS: ${studiosList}
DISCOVERED CAPABILITIES / SERVICES: ${toolsList}
KEY VALUE PILLARS & HEADINGS: ${(websiteData.h1s || []).concat(websiteData.h2s || []).slice(0, 8).join(' | ')}
${customPrompt ? `USER SPECIAL FOCUS: ${customPrompt}` : ''}

CRITICAL COPYWRITING INSTRUCTIONS:
- ONLY assign each post to one of these user-selected platforms: ${platforms.join(', ')}.
- Write STRICTLY in the authentic voice and domain of ${strategy.brandName} (${strategy.industry}).
- NEVER use generic developer tools or software templates unless the website is actually a developer tool!
  - If it is an Agency / Staffing / B2B Consultancy (e.g. ${strategy.brandName}): Highlight vetted offshore engineers, Dubai-managed governance, reducing recruitment overhead, scalability, dedicated infrastructure, and enterprise trust.
  - If it is a SaaS / App: Highlight intuitive speed, seamless workflows, and ROI.
- Every post MUST spotlight a specific Section/Studio and a specific Capability/Tool from the list above.
- Captions:
  - First line: Scroll-stopping viral hook that directly names the capability and business outcome.
  - Body: 3-5 punchy lines explaining the transformation, problem solved, and why it's a game-changer.
  - CTA: Direct invitation to visit ${websiteData.domain}.
- Hashtags: 8-10 relevant hashtags customized specifically for ${strategy.brandName} and ${strategy.industry} (e.g. #${strategy.brandName.replace(/[^a-zA-Z0-9]/g, '')}, #${strategy.industry.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '')}, etc. Do NOT use irrelevant developer hashtags for non-developer sites!).
- imagePrompt: A vivid, photorealistic commercial advertising prompt for generating stunning visual artwork for this post (e.g. "Modern corporate boardroom in Dubai overlooking futuristic skyline, executive tech team collaborating with holographic architecture screens, cinematic lighting, 8k commercial photography style, ultra high resolution").
- videoScript: For video posts (${[...videoAt].join(', ')}), provide 4 cinematic scenes with onScreenText, visualDirection, and voiceoverAudio.

Return ONLY valid JSON:
{
  "posts": [
    {
      "day": "Day 1",
      "platform": "${platforms[0]}",
      "contentType": "Video Reel / Short" OR "Image Post" OR "Carousel Graphic",
      "studio": "Exact Section/Studio name",
      "toolName": "Exact Tool/Service name",
      "hook": "Punchy viral hook headline",
      "caption": "Full formatted caption with line breaks and emoji",
      "hashtags": ["#Tag1", "#Tag2", ...],
      "callToAction": "Visit ${websiteData.domain} to get started",
      "bestTime": "9:00 AM",
      "imagePrompt": "Photorealistic commercial advertising visual prompt",
      "videoScript": null OR { "duration": "30s", "audioVibe": "Upbeat Modern Tech Beat", "scenes": [ { "sceneNumber": 1, "time": "0:00 - 0:03", "visualDirection": "...", "onScreenText": "...", "voiceoverAudio": "..." }, ... 4 scenes ] }
    }
  ]
}`;

      const raw = await geminiText(apiKey, prompt, 120000);
      const parsed = parseJsonLoose(raw);
      const aiPosts = Array.isArray(parsed) ? parsed : parsed.posts;
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

          const platformCandidate = platforms.find(pl => pl.toLowerCase() === String(p.platform || '').toLowerCase());
          const finalPlatform = platformCandidate || platforms[i % platforms.length];

          const brandTag = `#${String(strategy.brandName || '').replace(/[^a-zA-Z0-9]/g, '')}`;
          const industryTag = `#${String(strategy.industry || '').split(' ')[0].replace(/[^a-zA-Z0-9]/g, '')}`;

          const prompts = buildPostAIPrompts({
            strategy,
            post: { hook, callToAction: cta },
            toolName,
            studio,
            toolObj,
            websiteData
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
              brandTag,
              industryTag,
              `#${String(toolName).replace(/[^a-zA-Z0-9]/g, '')}`,
              `#${String(studio).replace(/[^a-zA-Z0-9]/g, '')}`,
              '#BusinessGrowth',
              '#GlobalExcellence',
              '#Innovation',
              '#FutureOfWork'
            ],
            callToAction: cta,
            bestTime: p.bestTime || bestTimes[i % bestTimes.length],
            inputScreenshotUrl: toolObj.inputScreenshotUrl || websiteData.screenshotUrl,
            outputScreenshotUrl: toolObj.outputScreenshotUrl || toolObj.screenshotUrl || websiteData.screenshotUrl,
            screenshotUrl: toolObj.outputScreenshotUrl || toolObj.screenshotUrl || websiteData.screenshotUrl,
            rawScreenshot: toolObj.outputScreenshotUrl || toolObj.screenshotUrl || websiteData.screenshotUrl,
            testedInput: toolObj.testedInput || 'Interactive Parameters',
            testedOutput: toolObj.testedOutput || 'Live Computation Executed (0s Latency)',
            imagePrompt: String(p.imagePrompt || prompts.aiImagePrompt).slice(0, 600),
            aiImagePrompt: prompts.aiImagePrompt,
            aiVideoPrompt: prompts.aiVideoPrompt,
            videoScript: script,
            engine: 'gemini'
          };
        });

        const masterBrandPrompt = generateMasterBrandPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
        const masterImagePrompt = generateMasterImagePrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
        const masterVideoPrompt = generateMasterVideoPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
        postsResult.masterBrandPrompt = masterBrandPrompt;
        postsResult.masterImagePrompt = masterImagePrompt;
        postsResult.masterVideoPrompt = masterVideoPrompt;
        return postsResult;
      }
    } catch (err) {
      console.warn('[AIEngine] Gemini campaign failed, using template fallback:', err.message);
    }
  }

  /* ---- Dynamic Studio & Tool Template fallback (works 100% industry-specific) ---- */
  const templatePosts = buildTemplateCampaign({ websiteData, strategy, totalPosts, days, customPrompt, videoAt, platforms, bestTimes, dayOf });
  templatePosts.masterBrandPrompt = generateMasterBrandPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
  templatePosts.masterImagePrompt = generateMasterImagePrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
  templatePosts.masterVideoPrompt = generateMasterVideoPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
  return templatePosts;
}

function buildTemplateCampaign({
  websiteData,
  strategy,
  totalPosts,
  days,
  customPrompt,
  videoAt,
  platforms,
  bestTimes,
  dayOf
}) {
  const tools = (websiteData.discoveredTools && websiteData.discoveredTools.length > 0)
    ? websiteData.discoveredTools
    : (websiteData.studios || []).map(s => ({
        name: `${s} Solutions`,
        studio: s,
        description: `Verified enterprise offering in ${s}`
      }));

  const isAgency = /agency|service|consulting|marketing|studio|hire|expert|solutions|talent|offshore|staffing|dubai/i.test(
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
          : `Eliminate hiring bottlenecks: ${tool.name} in ${studio}`)
      : (isVideo
          ? `Why everyone is talking about ${tool.name} in ${studio}`
          : `Transform your workflow with ${tool.name} on ${strategy.brandName}`);

    const caption = isAgency
      ? `Looking to scale your technical capacity without the overhead?\n\nMeet ${tool.name} under ${studio} from ${strategy.brandName}.\n\n` +
        `✅ Pre-vetted senior talent with proven technical track records\n` +
        `✅ Dubai-managed governance & audit-ready compliance\n` +
        `✅ 24/7 dedicated support with seamless time-zone overlap\n\n` +
        `${customPrompt ? `🎯 Focus: ${customPrompt}\n\n` : ''}` +
        `👇 Ready to build your high-impact team? Learn more and get started at ${websiteData.domain}`
      : `Ready to upgrade your workflow?\n\nDiscover ${tool.name} inside ${studio} on ${strategy.brandName}.\n\n` +
        `⚡ ${tool.description || 'Fast, reliable, and modern'}\n` +
        `🔒 Built for enterprise reliability and seamless performance\n` +
        `✨ Instant access without unnecessary friction\n\n` +
        `${customPrompt ? `🎯 Focus: ${customPrompt}\n\n` : ''}` +
        `👇 Try it now at ${websiteData.domain}`;

    const cta = `Explore ${tool.name} 👉 ${websiteData.domain}`;

    const brandClean = strategy.brandName.replace(/[^a-zA-Z0-9]/g, '');
    const toolClean = tool.name.replace(/[^a-zA-Z0-9]/g, '');
    const studioClean = studio.replace(/[^a-zA-Z0-9]/g, '');

    const hashtags = isAgency
      ? [`#${brandClean}`, `#${toolClean}`, `#${studioClean}`, '#OffshoreTalent', '#DubaiTech', '#GlobalWorkforce', '#EngineeringLeadership', '#FutureOfWork']
      : [`#${brandClean}`, `#${toolClean}`, `#${studioClean}`, '#Innovation', '#TechSolutions', '#Productivity', '#NextGenTech'];

    const prompts = buildPostAIPrompts({
      strategy,
      post: { hook, callToAction: cta },
      toolName: tool.name,
      studio,
      toolObj: tool,
      websiteData
    });

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
      inputScreenshotUrl: tool.inputScreenshotUrl || websiteData.screenshotUrl,
      outputScreenshotUrl: tool.outputScreenshotUrl || tool.screenshotUrl || websiteData.screenshotUrl,
      screenshotUrl: tool.outputScreenshotUrl || tool.screenshotUrl || websiteData.screenshotUrl,
      rawScreenshot: tool.outputScreenshotUrl || tool.screenshotUrl || websiteData.screenshotUrl,
      testedInput: tool.testedInput || 'Interactive Parameters',
      testedOutput: tool.testedOutput || 'Live Computation Executed (0s Latency)',
      imagePrompt: prompts.aiImagePrompt,
      aiImagePrompt: prompts.aiImagePrompt,
      aiVideoPrompt: prompts.aiVideoPrompt,
      videoScript: isVideo
        ? buildVideoScript({ post: { hook, callToAction: cta }, strategy, websiteData, feature: `${tool.name} (${studio})` })
        : null,
      engine: 'dynamic-template'
    });
  }

  return results;
}

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
        voiceoverAudio: 'Stop doing this manually. Here is the future you have been waiting for.'
      },
      {
        sceneNumber: 2,
        time: '0:03 - 0:15',
        visualDirection: `Close-up demonstration: ${feature}. Snappy transitions.`,
        onScreenText: 'Built for speed. Designed for results.',
        voiceoverAudio: `${strategy.brandName} handles the heavy lifting instantly, so you can focus on what matters.`
      },
      {
        sceneNumber: 3,
        time: '0:15 - 0:25',
        visualDirection: 'Showcase premium results and happy customer moments.',
        onScreenText: 'Real results. Zero stress.',
        voiceoverAudio: 'Imagine this running for you 24/7, completely on autopilot.'
      },
      {
        sceneNumber: 4,
        time: '0:25 - 0:30',
        visualDirection: `Final CTA screen with ${websiteData.domain} branding.`,
        onScreenText: `Try it now — ${websiteData.domain}`,
        voiceoverAudio: 'Link in bio. Start today and feel the difference.'
      }
    ]
  };
}

export function buildPostAIPrompts({ strategy, post, toolName, studio, toolObj = {}, websiteData = {} }) {
  const brandName = strategy?.brandName || websiteData?.title || 'Brand';
  const industry = strategy?.industry || 'Technology & Digital Solutions';
  const domain = websiteData?.domain || websiteData?.url || '';

  const inputShot = toolObj?.inputScreenshotUrl ? toolObj.inputScreenshotUrl.split('/').pop() : 'screenshot_before_input.jpg';
  const outputShot = toolObj?.outputScreenshotUrl ? toolObj.outputScreenshotUrl.split('/').pop() : (toolObj?.screenshotUrl ? toolObj.screenshotUrl.split('/').pop() : 'screenshot_after_output.jpg');
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
  const usp = strategy?.uniqueSellingPoint || websiteData?.metaDescription || '';
  const tone = strategy?.brandTone || 'Ultra-modern, authoritative, premium tech aesthetic';
  const studios = (websiteData?.studios || []).slice(0, 8);
  const studiosList = studios.join(', ') || 'Enterprise Core Platform';

  const toolList = (tools && tools.length > 0 ? tools : (websiteData?.discoveredTools || [])).slice(0, 16);
  const toolBulletPoints = toolList.map(t => `- ${t.name} (${t.studio}): ${t.description || 'Verified live module'}`).join('\n');

  const shots = (websiteData?.screenshots || []).map(s => {
    const fn = s.webUrl ? s.webUrl.split('/').pop() : (s.localPath ? s.localPath.split(/[\\/]/).pop() : 'screenshot.jpg');
    return `📸 [${fn}] -> ${s.title || s.description || 'Live section proof'}`;
  }).slice(0, 8);

  const screenshotGuide = shots.length > 0
    ? shots.join('\n')
    : `📸 [desktop.jpg] -> Full platform landing page & hero\n📸 [mobile.jpg] -> Responsive mobile interface\n📸 [section-1.jpg] -> Primary service & features suite`;

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
  const usp = strategy?.uniqueSellingPoint || websiteData?.metaDescription || '';
  const tone = strategy?.brandTone || 'High-energy, authoritative, cinematic';
  const studiosList = (websiteData?.studios || []).slice(0, 6).join(' ➔ ') || 'Core Platform Ecosystem';
  const toolList = (tools && tools.length > 0 ? tools : (websiteData?.discoveredTools || [])).slice(0, 10);
  const topTools = toolList.map(t => t.name).join(', ') || 'All Platform Services';

  const shots = (websiteData?.screenshots || []).map(s => {
    const fn = s.webUrl ? s.webUrl.split('/').pop() : (s.localPath ? s.localPath.split(/[\\/]/).pop() : 'screenshot.jpg');
    return `🎥 [${fn}] -> Use as starting frame or mid-transition keyframe for ${s.title || 'tool'}`;
  }).slice(0, 5);

  const keyframeGuide = shots.length > 0
    ? shots.join('\n')
    : `🎥 [desktop.jpg] -> Starting Hero Frame\n🎥 [section-1.jpg] -> Mid-Transition Feature Frame`;

  return `================================================================================
🎬 MASTER BRAND AI VIDEO REEL PROMPT (VIRAL COMMERCIAL & ECOSYSTEM SHOWCASE)
================================================================================
TARGET AI ENGINES: Higgsfield AI, Runway Gen-3 Alpha, Luma Dream Machine, OpenAI Sora, Kling AI, Hailuo, Pika 2.0

[CRITICAL INSTRUCTIONS FOR 100% "HUBAHU" ACCURATE BRAND REEL]:
1. Starting Frame / Image-to-Video Source (INPUT): Upload 'desktop.jpg' or tool input screenshot ('tool-1-1-input.jpg') as the initial input frame into the video AI tool.
2. Climax / Transformation Keyframe (LIVE OUTPUT): Upload 'tool-1-1-output.jpg' or the section output screenshot as the climax/transformation frame!
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
  Cinematic deceleration onto a glowing 3D obsidian emblem of '${brandName}'. Bold CTA banner: 'Experience ${brandName} Today ➔ Visit ${domain}'.

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
  const usp = strategy?.uniqueSellingPoint || websiteData?.metaDescription || '';
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

[KEY CAPABILITIES & TOOLS TESTED LIVE]
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
  const usp = strategy?.uniqueSellingPoint || websiteData?.metaDescription || '';
  const tone = strategy?.brandTone || 'High-conversion, authoritative, executive';
  const audience = strategy?.targetAudience || 'Modern Businesses & Consumers';
  const studios = websiteData?.studios || [];
  const discoveredTools = (tools && tools.length > 0) ? tools : (websiteData?.discoveredTools || []);

  const imgPrompt = generateMasterImagePrompt({ strategy, websiteData, tools: discoveredTools });
  const vidPrompt = generateMasterVideoPrompt({ strategy, websiteData, tools: discoveredTools });

  return `# ==============================================================================
# 🌟 OMNIPOST AGI MASTER BRAND BLUEPRINT & MARKETING OPERATING SYSTEM
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
  const toolsInStudio = discoveredTools.filter(t => (t.studio || '').toLowerCase() === s.toLowerCase());
  return `### Suite ${idx + 1}: ${s}
${toolsInStudio.length > 0 
  ? toolsInStudio.map(t => `  - ⚡ ${t.name}: ${t.description || 'Verified enterprise capability'}`).join('\n')
  : `  - Verified core solution for ${s}`}`;
}).join('\n\n')}

## 3. 100% "HUBAHU" BEFORE & AFTER SCREENSHOT REFERENCE PROTOCOL
To generate commercial advertising visuals and viral videos that replicate ${brandName}'s real website and show genuine live execution without hallucination:
1. Locate the attached screenshots in the \`/all_website_screenshots/\` folder:
   - \`desktop.jpg\` -> Full desktop landing page & hero
   - \`mobile.jpg\` -> Mobile responsive layout
   - \`tool-*-input.jpg\` / \`section-*-input.jpg\` -> Real Before / Input State (parameters/file loaded)
   - \`tool-*-output.jpg\` / \`section-*-output.jpg\` -> Real After / Live Output Result (computation completed)
2. For ChatGPT (GPT-4o DALL-E 3) or Gemini Pro (Imagen 3):
   Attach BOTH the Input Screenshot and Output Screenshot directly to your prompt to generate an authentic Before/After split commercial visual.
3. For Higgsfield AI or Runway Gen-3 Alpha (Image-to-Video):
   Upload \`tool-*-input.jpg\` (or \`desktop.jpg\`) as the START FRAME.
   Set \`tool-*-output.jpg\` as the TRANSFORMATION / CLIMAX FRAME to animate the instant 0s latency live calculation!

## 4. MASTER AI IMAGE GENERATION PROMPT (ENTIRE WEBSITE HERO ART)
${imgPrompt}

## 5. MASTER AI VIDEO REEL PROMPT (VIRAL COMMERCIAL & ECOSYSTEM REEL)
${vidPrompt}

## 6. PROMPT TO GENERATE INFINITE CAMPAIGN ASSETS IN CHATGPT / GEMINI / CLAUDE
Copy and paste this entire document into ChatGPT (GPT-4o) or Claude 3.5 Sonnet, then ask:
- "Write 10 high-converting LinkedIn carousel outlines for ${brandName}"
- "Generate 5 high-CTR Facebook conversion ad scripts targeting ${audience}"
- "Produce a 7-day email onboarding sequence for ${brandName}"
==============================================================================`;
}
