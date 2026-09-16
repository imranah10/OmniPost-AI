/**
 * standalone.js — Orchestrator for the 100% browser engine.
 * Mirrors the two server endpoints (/api/analyze, /api/generate-campaign)
 * with progress callbacks so the UI stays identical in standalone mode.
 *
 * Campaign flow is split in two phases for fast UX:
 *   1. copy/plan generation (fast — returns posts immediately)
 *   2. fillImages() — sequential AI art + branded cards with progress
 */
import { analyzeSite } from './analyzer.js';
import { analyzeWebsiteStrategy, generateFullCampaign, generateMasterBrandBlueprint } from './aiClient.js';
import { generatePostCreatives } from './creatives.js';

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
  const safePosts = Math.max(1, Math.min(30, parseInt(totalPosts) || 10));
  const safeDays = Math.max(1, Math.min(60, parseInt(days) || 14));

  const result = await generateFullCampaign({
    websiteData,
    strategy,
    totalPosts: safePosts,
    days: safeDays,
    customPrompt,
    carouselPrompt,
    selectedPlatforms,
    userApiKey: geminiApiKey,
  });

  const posts = Array.isArray(result) ? result : (result.posts || []);
  const masterBrandPrompt = result.masterBrandPrompt || '';
  const masterImagePrompt = result.masterImagePrompt || '';
  const masterVideoPrompt = result.masterVideoPrompt || '';
  const masterBlueprint = result.masterBlueprint || generateMasterBrandBlueprint({ strategy, websiteData, tools: websiteData.discoveredTools });

  onPostDone({ phase: 'copy', total: posts.length });

  /**
   * Phase 2 — run AFTER the dashboard is visible: fills each post with its
   * AI artwork + branded card. Sequential (Pollinations rate-limits bursts).
   */
  const fillImages = async (onImage = () => {}) => {
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      try {
        const { rawAiUrl, rawBlob, rawObjectUrl, cardDataUrl } = await generatePostCreatives({
          post, strategy, websiteData, index: i + 1,
        });
        post.remoteAiUrl = rawAiUrl;
        post.rawBlob = rawBlob || null;          // blob for instant ZIP packing
        post.generatedImageUrl = rawObjectUrl || post.generatedImageUrl;
        post.rawAiUrl = rawObjectUrl || post.rawAiUrl;
        post.cardDataUrl = cardDataUrl || null;
        onImage({ index: i + 1, total: posts.length, post, done: true });
      } catch {
        onImage({ index: i + 1, total: posts.length, post, done: false });
      }
    }
    return posts;
  };

  return { posts, masterBrandPrompt, masterImagePrompt, masterVideoPrompt, masterBlueprint, fillImages };
}
