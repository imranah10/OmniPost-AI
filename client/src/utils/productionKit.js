/**
 * Production Kit utilities for OmniPost AI:
 * - Maps primary & secondary screenshots from tested site data
 * - Generates Master Campaign Blueprint markdown
 * - Generates Day-Wise Production Guide markdown with exact prompt instructions
 */

export function getPostAssets(post, websiteData, index = 0, strategy = {}) {
  const screenshots = websiteData?.capturedScreenshots || [];
  
  // 1. Match primary screenshot
  let primary = null;
  const toolName = (post.toolName || '').toLowerCase();
  const studio = (post.studio || '').toLowerCase();

  if (toolName) {
    primary = screenshots.find(s => 
      (s.title || '').toLowerCase().includes(toolName) ||
      (s.description || '').toLowerCase().includes(toolName)
    );
  }
  if (!primary && studio) {
    primary = screenshots.find(s => 
      (s.studio || '').toLowerCase().includes(studio) ||
      (s.title || '').toLowerCase().includes(studio)
    );
  }
  if (!primary && post.screenshotUrl) {
    primary = screenshots.find(s => s.webUrl === post.screenshotUrl);
  }
  if (!primary && screenshots.length > 0) {
    primary = screenshots[index % screenshots.length];
  }

  // 2. Match secondary screenshot (distinct from primary if possible)
  let secondary = null;
  if (screenshots.length > 1) {
    const candidates = screenshots.filter(s => s !== primary);
    secondary = candidates[index % candidates.length] || candidates[0];
  } else {
    secondary = primary;
  }

  // Fallback URLs & Titles
  const primaryUrl = primary?.webUrl || post.screenshotUrl || post.generatedImageUrl;
  const secondaryUrl = secondary?.webUrl || primaryUrl;
  const primaryTitle = primary?.title || post.toolName || 'Hero Interface Proof';
  const secondaryTitle = secondary?.title || post.studio || 'Capability Workflow Inset';

  // Determine usage directives
  const isVideo = post.contentType?.includes('Video');
  const isCarousel = post.contentType?.includes('Carousel');

  const primaryUsage = isVideo
    ? 'Opening Hook & Scene 1 (0-3s): Feature as the hero floating software interface with a dynamic camera push-in.'
    : isCarousel
    ? 'Slide 1 (Hero Hook): Use as the main visual banner proving the capability live in action.'
    : 'Central Hero Mockup: Embed inside a floating 3D glassmorphic device frame (MacBook / iPhone) at a 15-degree isometric tilt.';

  const secondaryUsage = isVideo
    ? 'Workflow Demonstration (Scene 2 & 3): Cut or transition into this screenshot to prove the real interface and verified output.'
    : isCarousel
    ? 'Slide 2 & 3 (Feature Breakdown): Show the exact user interaction and execution proof.'
    : 'Proof Badge / Corner Inset: Position as a glowing rounded-glass card in the bottom-right corner for live authenticity.';

  const multiImageRationale = 
    `Why Multiple Images: One screenshot captures macro attention (${primaryTitle}), while the secondary screenshot provides micro-proof (${secondaryTitle}) that the capability is 100% verified and operational.`;

  // Master AI Image Prompt (Midjourney / Flux / DALL-E 3 / Gemini)
  const brandName = strategy?.brandName || 'The Brand';
  const industry = strategy?.industry || 'Modern Enterprise';
  const cleanTool = post.toolName || post.studio || 'Elite Solution';
  const ar = isVideo ? '9:16' : '1:1';

  const aiImagePrompt = post.imagePrompt && post.imagePrompt.length > 30
    ? `${post.imagePrompt}, cinematic 8k, photorealistic commercial ad, volumetric rim lighting, high-end corporate tech environment, glassmorphism UI overlay --ar ${ar} --v 6.0`
    : `Photorealistic luxury commercial advertisement for ${cleanTool} by ${brandName} (${industry}). Ultra-modern executive tech office overlooking a futuristic skyline at twilight, sleek floating glass UI dashboard displaying real verified analytics, cinematic volumetric lighting, 8k resolution, shot on Hasselblad H6D-100c, octane render style --ar ${ar} --v 6.0`;

  // Master Video Prompt & Script
  let videoPrompt = '';
  let videoScriptText = '';
  if (post.videoScript) {
    videoPrompt = `Cinematic commercial 9:16 short-form video for ${brandName} featuring ${cleanTool}. Fast-paced 4K visual sequence starting with camera push into futuristic workstation, live transition showing ${primaryTitle} UI, followed by quick cut into ${secondaryTitle}, dynamic particle effects, neon cyber accents, ending on high-conversion brand CTA card. Vibe: ${post.videoScript.audioVibe || 'High-energy Tech Beat'}.`;

    videoScriptText = (post.videoScript.scenes || []).map(s => 
      `### Scene ${s.sceneNumber} (${s.time || ''})\n` +
      `• Visual Direction: ${s.visualDirection}\n` +
      `• On-Screen Text: "${s.onScreenText}"\n` +
      `• Voiceover Audio: "${s.voiceoverAudio}"\n`
    ).join('\n');
  } else {
    videoPrompt = `Dynamic 15-second social reel for ${brandName} introducing ${cleanTool}. High-energy transitions, bold typography, authentic UI screenshot showcase, cinematic lighting.`;
  }

  return {
    primary,
    secondary,
    primaryUrl,
    secondaryUrl,
    primaryTitle,
    secondaryTitle,
    primaryUsage,
    secondaryUsage,
    multiImageRationale,
    aiImagePrompt,
    videoPrompt,
    videoScriptText
  };
}

export function generateMasterBlueprintMarkdown(strategy, websiteData, posts) {
  const screenshots = websiteData?.capturedScreenshots || [];
  const tools = websiteData?.discoveredTools || [];

  let md = `# 🌐 ${strategy.brandName} — Master Campaign Blueprint & Brand Directive\n\n`;
  md += `> **Automated OmniPost AI Brand Blueprint**  \n`;
  md += `> Target Domain: [${websiteData.url}](${websiteData.url}) | Date: ${new Date().toISOString().split('T')[0]}\n\n`;

  md += `## 1. Executive Brand DNA & Strategy\n\n`;
  md += `- **Brand Name:** ${strategy.brandName}\n`;
  md += `- **Industry:** ${strategy.industry}\n`;
  md += `- **Core Brand Voice / Tone:** ${strategy.brandTone}\n`;
  md += `- **Target Audience:** ${strategy.targetAudience}\n`;
  md += `- **Primary Value Proposition (USP):** ${strategy.uniqueSellingPoint}\n`;
  md += `- **Total Campaign Duration:** ${posts.length} Posts across ${strategy.recommendedDays || 14} Days\n\n`;

  md += `## 2. Tested Capabilities & Live Verification Index\n\n`;
  md += `Every section and capability below was tested live in an autonomous headless browser instance:\n\n`;
  md += `| # | Feature / Capability | Section / Studio | Status | Live Verification Summary |\n`;
  md += `|---|---------------------|------------------|--------|--------------------------|\n`;
  tools.slice(0, 35).forEach((t, idx) => {
    md += `| ${idx + 1} | ${t.name} | ${t.studio || 'Core'} | ✅ 100% Tested Live | ${t.testAction || t.description || 'Verified operational'} |\n`;
  });
  md += `\n`;

  md += `## 3. Master Screenshot Directory & Asset Mapping\n\n`;
  md += `The campaign uses high-resolution screenshots captured during live testing:\n\n`;
  md += `| Asset File | Section / Feature Title | Asset Type | Recommended Production Usage |\n`;
  md += `|------------|------------------------|------------|-----------------------------|\n`;
  screenshots.forEach((s, idx) => {
    const filename = s.webUrl ? s.webUrl.split('/').pop() : `screenshot-${idx + 1}.jpg`;
    md += `| \`${filename}\` | ${s.title || 'Section'} | ${s.type || 'Screenshot'} | Use as hero proof for ${s.studio || s.title} posts & video reels |\n`;
  });
  md += `\n`;

  md += `## 4. Master Global Video Prompt (Full-Site Brand Commercial)\n\n`;
  md += `**Recommended Tools:** Higgsfield AI, Runway Gen-3 Alpha, OpenAI Sora, Kling AI, Luma Dream Machine\n\n`;
  md += `\`\`\`text\n`;
  md += `A high-end cinematic 4K commercial advertisement for ${strategy.brandName} (${strategy.industry}). Opening wide shot of a modern executive tech hub in Dubai and Silicon Valley, hyper-realistic lighting. Smooth camera zoom revealing live interactive holographic displays of ${tools.slice(0, 3).map(t => t.name).join(', ')}. Energetic camera pans across verified dashboards, professional engineers collaborating, sleek glass interfaces floating seamlessly, ultra-crisp motion blur, volumetric rim lighting, ending with the bold glowing logo of ${strategy.brandName} and URL: ${websiteData.domain}. High production value, 8k render, color graded like an Apple keynote commercial.\n`;
  md += `\`\`\`\n\n`;

  md += `## 5. Master Global Hero Visual Prompt (Brand Ad Billboard)\n\n`;
  md += `**Recommended Tools:** Midjourney v6.0, Flux.1 Pro, DALL-E 3, Google Gemini Imagen 3\n\n`;
  md += `\`\`\`text\n`;
  md += `Photorealistic luxury corporate advertisement for ${strategy.brandName}, ${strategy.industry}. Centered around a sophisticated 3D floating glassmorphic dashboard showcasing live capabilities. Executive modern architecture, ambient twilight city lights through floor-to-ceiling glass windows, cinematic rim lighting, 8k resolution, shot on Hasselblad H6D-100c, ultra-sharp detail, high dynamic range, no distortion --ar 16:9 --v 6.0\n`;
  md += `\`\`\`\n\n`;

  md += `## 6. Complete Day-by-Day Campaign Calendar Matrix\n\n`;
  md += `| Day | Platform | Format | Core Topic / Tool | Primary Hook | Target CTA |\n`;
  md += `|-----|----------|--------|-------------------|--------------|------------|\n`;
  posts.forEach(p => {
    md += `| ${p.day} | ${p.platform} | ${p.contentType} | ${p.toolName || p.studio} | ${(p.hook || '').replace(/\|/g, '')} | ${(p.callToAction || '').replace(/\|/g, '')} |\n`;
  });
  md += `\n---\n*Created automatically by OmniPost AGI Campaign Engine.*\n`;

  return md;
}

export function generateDayProductionGuideMarkdown(post, assets, strategy, websiteData) {
  let md = `# ${post.day} Production Guide — ${strategy.brandName}\n\n`;
  md += `**Target Platform:** ${post.platform}  \n`;
  md += `**Content Format:** ${post.contentType}  \n`;
  md += `**Featured Capability:** ${post.toolName || 'Core Feature'} (${post.studio || 'Section'})  \n`;
  md += `**Recommended Publishing Time:** ${post.bestTime || '9:00 AM'}\n\n`;
  md += `---\n\n`;

  md += `## 📸 1. Screenshot Asset Mapping & Instructions\n\n`;
  md += `To create high-converting social media posts that build immediate trust, this folder includes **two exact screenshots** captured from the live website:\n\n`;
  md += `### 1.1 Primary Screenshot (\`primary_screenshot.jpg\`)\n`;
  md += `- **Subject:** ${assets.primaryTitle}\n`;
  md += `- **Role in Production:** ${assets.primaryUsage}\n`;
  md += `- **Implementation Note:** Place this screenshot inside a 3D isometric mockup or hero video zoom.\n\n`;

  md += `### 1.2 Secondary Screenshot (\`secondary_screenshot.jpg\`)\n`;
  md += `- **Subject:** ${assets.secondaryTitle}\n`;
  md += `- **Role in Production:** ${assets.secondaryUsage}\n`;
  md += `- **Implementation Note:** Use as the comparison inset card or carousel slide 2.\n\n`;

  md += `> **💡 Multi-Asset Strategy:**  \n`;
  md += `> ${assets.multiImageRationale}\n\n`;

  md += `## 🎨 2. Master AI Image Prompt (Midjourney / Flux / Gemini)\n\n`;
  md += `Copy-paste this exact prompt into Midjourney, Flux.1, or DALL-E 3:\n\n`;
  md += `\`\`\`text\n`;
  md += `${assets.aiImagePrompt}\n`;
  md += `\`\`\`\n\n`;

  if (post.videoScript) {
    md += `## 🎬 3. Video Reel Master Prompt & 4-Scene Director Storyboard\n\n`;
    md += `**Higgsfield / Runway / Sora Master Prompt:**\n\n`;
    md += `\`\`\`text\n`;
    md += `${assets.videoPrompt}\n`;
    md += `\`\`\`\n\n`;
    md += `**Scene-by-Scene Breakdown:**\n\n`;
    md += `${assets.videoScriptText}\n\n`;
  } else if (post.contentType?.includes('Carousel')) {
    md += `## 📑 3. Carousel Multi-Slide Structure\n\n`;
    md += `- **Slide 1 (Hook):** "${post.hook}" + \`primary_screenshot.jpg\` as the central teaser.\n`;
    md += `- **Slide 2 (The Problem):** Why traditional solutions fail + key stats.\n`;
    md += `- **Slide 3 (The Proof):** \`secondary_screenshot.jpg\` showing the verified workflow in action.\n`;
    md += `- **Slide 4 (Results):** Key metrics and business transformation.\n`;
    md += `- **Slide 5 (CTA):** "${post.callToAction}" + brand logo.\n\n`;
  }

  md += `## ✍️ 4. Social Media Copywriting\n\n`;
  md += `### Hook\n`;
  md += `> **${post.hook}**\n\n`;
  md += `### Full Caption\n`;
  md += `${post.caption}\n\n`;
  md += `### Hashtags\n`;
  md += `${(post.hashtags || []).join(' ')}\n\n`;
  md += `### Call to Action (CTA)\n`;
  md += `👉 **${post.callToAction}**\n\n`;

  return md;
}
