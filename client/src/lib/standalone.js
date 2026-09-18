/**
 * standalone.js — Orchestrator for the 100% browser engine.
 * Mirrors the two server endpoints (/api/analyze, /api/generate-campaign)
 * with progress callbacks so the UI stays identical in standalone mode.
 *
 * PROMPTS-FIRST: campaign generation returns copy + prompts only. No media is
 * rendered in the background — the user creates visuals from the per-post
 * prompts (Gemini app / ChatGPT / Midjourney) or via the full-campaign ZIP
 * workflow. Per-post Gemini/Veo generation inside the AI Prompts drawer is
 * the only in-app media path, and it is strictly user-initiated.
 */
import { analyzeSite } from './analyzer.js';
import { analyzeWebsiteStrategy, generateFullCampaign, generateMasterBrandBlueprint } from './aiClient.js';

export async function standaloneAnalyze(url, { customPrompt = '', geminiApiKey = '', onStep = () => {} } = {}) {
  const websiteData = await analyzeSite(url, { onStep });
  // FIX: the user's Gemini key MUST flow into the strategy step — previously a
  // hardcoded '' meant the AI engine was silently skipped (always heuristic).
  const strategy = await analyzeWebsiteStrategy(websiteData, customPrompt, geminiApiKey);
  return { websiteData, strategy };
}

export async function standaloneGenerateCampaign({
  websiteData,
  strategy,
  days,
  totalPosts,
  customPrompt,
  carouselPrompt,
  selectedPlatforms,
  geminiApiKey,
  onPostDone = () => {},
}) {
  const safeDays = Math.max(1, Math.min(60, parseInt(days) || 14));
  // totalPosts is DERIVED inside the engine (days x selected platforms) — the
  // standalone cap only guards against absurd inputs, it must not break the
  // day x platform coverage guarantee for larger campaigns.
  const safePosts = Math.max(1, Math.min(400, parseInt(totalPosts) || 10));

  const result = await generateFullCampaign({
    websiteData,
    strategy,
    totalPosts: safePosts,
    days: safeDays,
    customPrompt,
    carouselPrompt,
    selectedPlatforms,
    userApiKey: geminiApiKey,
    onProgress: ({ index, total }) => onPostDone({ index, total }),
  });

  const posts = Array.isArray(result) ? result : (result.posts || []);
  const masterBrandPrompt = result.masterBrandPrompt || '';
  const masterImagePrompt = result.masterImagePrompt || '';
  const masterVideoPrompt = result.masterVideoPrompt || '';
  const masterBlueprint = result.masterBlueprint || generateMasterBrandBlueprint({ strategy, websiteData, tools: websiteData.discoveredTools });

  onPostDone({ phase: 'copy', total: posts.length });

  return { posts, masterBrandPrompt, masterImagePrompt, masterVideoPrompt, masterBlueprint };
}
