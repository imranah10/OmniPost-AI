import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { scrapeWebsite } from './scraper.js';
import { analyzeWebsiteStrategy, generateFullCampaign, generateMasterBrandBlueprint } from './aiEngine.js';
import { generatePostImage } from './imageEngine.js';
import { renderReelVideo, renderHiggsfieldVideo } from './videoEngine.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('uncaughtException', (err) => {
  console.error('[SERVER CRITICAL ERROR - UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER CRITICAL ERROR - UNHANDLED REJECTION]:', reason);
});

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

/* Generated assets (screenshots, images, videos) served statically */
const GEN_ROOT = path.join(__dirname, 'generated');
fs.mkdirSync(GEN_ROOT, { recursive: true });
app.use('/generated', express.static(GEN_ROOT, { maxAge: '1h' }));

/* Health check */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'OmniPost AI Engine', version: '2.0.0' });
});

/* Step 1: Deep-crawl URL, run automated tests, capture screenshots, build AI strategy */
app.post('/api/analyze', async (req, res) => {
  try {
    const { url, customPrompt, geminiApiKey } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Please provide a valid website URL' });
    }

    const campaignId = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const outDir = path.join(GEN_ROOT, campaignId);
    fs.mkdirSync(outDir, { recursive: true });
    const webPrefix = `/generated/${campaignId}`;

    console.log(`[API] Starting Autonomous Analysis for: ${url} (campaign ${campaignId})`);

    /* 1. Crawl every page + automated testing + real browser screenshots */
    const websiteData = await scrapeWebsite(url, { outDir, webPrefix });
    websiteData.__campaignId = campaignId;

    /* 2. AI strategy + optimal post-count recommendation */
    const strategy = await analyzeWebsiteStrategy(websiteData, customPrompt, geminiApiKey);

    fs.writeFileSync(
      path.join(outDir, 'analysis.json'),
      JSON.stringify({ campaignId, websiteData, strategy, customPrompt: customPrompt || '' }, null, 2)
    );

    res.json({ success: true, websiteData, strategy });
  } catch (error) {
    console.error('[API Error /analyze]:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze website' });
  }
});
/* Step 2: Generate full campaign — captions, hashtags, images and real video reels */
app.post('/api/generate-campaign', async (req, res) => {
  try {
    const {
      websiteData,
      strategy,
      days = 14,
      totalPosts = 10,
      customPrompt = '',
      carouselPrompt = '',
      selectedPlatforms = [],
      geminiApiKey,
      higgsfieldApiKey
    } = req.body;
    if (!websiteData || !strategy) {
      return res.status(400).json({ error: 'Missing website or strategy data' });
    }

    const safePosts = Math.max(1, Math.min(30, parseInt(totalPosts) || 10));
    const safeDays = Math.max(1, Math.min(60, parseInt(days) || 14));

    const campaignId = websiteData.__campaignId || crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const outDir = path.join(GEN_ROOT, campaignId);
    const webPrefix = `/generated/${campaignId}`;
    fs.mkdirSync(outDir, { recursive: true });

    console.log(`[API] Generating campaign: ${safePosts} posts over ${safeDays} days for ${strategy.brandName} (${selectedPlatforms.join(', ') || 'All Platforms'})`);

    /* 2a. All copywriting (captions, hooks, hashtags, video scripts) in one AI pass */
    const campaignResult = await generateFullCampaign({
      websiteData,
      strategy,
      totalPosts: safePosts,
      days: safeDays,
      customPrompt,
      carouselPrompt,
      selectedPlatforms,
      userApiKey: geminiApiKey
    });
    const posts = Array.isArray(campaignResult) ? campaignResult : (campaignResult.posts || []);
    const masterBrandPrompt = campaignResult.masterBrandPrompt || '';
    const masterImagePrompt = campaignResult.masterImagePrompt || '';
    const masterVideoPrompt = campaignResult.masterVideoPrompt || '';
    const masterBlueprint = campaignResult.masterBlueprint || generateMasterBrandBlueprint({ strategy, websiteData, tools: websiteData.discoveredTools });

    /* 2b. Per-post media: branded image + cinematic video reel for video posts */
    const imageProviders = new Set();
    const videoProviders = new Set();

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];

      try {
        const img = await generatePostImage({
          post,
          strategy,
          websiteData,
          outDir,
          webPrefix,
          index: i + 1,
          geminiApiKey
        });
        post.generatedImageUrl = img.url;
        post.rawAiUrl = img.rawAiUrl;
        post.screenshotUrl = img.screenshotUrl;
        post.imageProvider = img.provider;
        imageProviders.add(img.provider);
      } catch (e) {
        console.error(`[Generate] Image failed for post ${i + 1}:`, e.message);
        post.generatedImageUrl = websiteData.ogImage || '';
      }

      if (post.contentType && post.contentType.includes('Video')) {
        let imagePath = null;
        const rawLocal = path.join(outDir, 'images', `ai-raw-${i + 1}.jpg`);
        if (fs.existsSync(rawLocal)) {
          imagePath = rawLocal;
        } else {
          const giu = post.rawAiUrl || post.generatedImageUrl || '';
          if (giu.startsWith('/generated/')) {
            imagePath = path.join(GEN_ROOT, giu.replace('/generated/', ''));
          }
        }

        const vid = await renderReelVideo({
          post,
          imagePath,
          strategy,
          websiteData,
          outDir,
          webPrefix,
          index: i + 1,
          higgsfieldApiKey
        });
        if (vid) {
          post.videoUrl = vid.url;
          post.videoProvider = vid.provider;
          videoProviders.add(vid.provider);
        }
      }

      console.log(`[Generate] Progress: ${i + 1}/${posts.length} posts complete`);
      if (i < posts.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    fs.writeFileSync(
      path.join(outDir, 'campaign.json'),
      JSON.stringify({ campaignId, brandName: strategy.brandName, days: safeDays, masterBrandPrompt, masterImagePrompt, masterVideoPrompt, masterBlueprint, posts }, null, 2)
    );

    res.json({
      success: true,
      posts,
      masterBrandPrompt,
      masterImagePrompt,
      masterVideoPrompt,
      masterBlueprint,
      campaignId,
      providers: { images: [...imageProviders], videos: [...videoProviders] }
    });
  } catch (error) {
    console.error('[API Error /generate-campaign]:', error);
    res.status(500).json({ error: error.message || 'Failed to generate campaign' });
  }
});
/* Step 3: Manual reel render (Reel Studio modal) + image proxy + static client */
app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, imageUrl, higgsfieldApiKey, videoScript, strategy, websiteData } = req.body;
    const outDir = path.join(GEN_ROOT, 'shared');
    const result = await renderHiggsfieldVideo({
      prompt,
      imageUrl,
      apiKey: higgsfieldApiKey,
      videoScript,
      outDir,
      webPrefix: '/generated/shared',
      strategy,
      websiteData
    });
    res.json(result);
  } catch (error) {
    console.error('[API Error /generate-video]:', error);
    res.status(500).json({ error: error.message || 'Video generation failed' });
  }
});

/* Image proxy to avoid CORS issues when bundling remote assets */
app.get('/api/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('Image URL is required');

    let target = url.trim();
    if (target.includes('/generated/')) {
      const rel = target.slice(target.indexOf('/generated/') + '/generated/'.length).split('?')[0];
      const localFile = path.join(GEN_ROOT, rel);
      if (fs.existsSync(localFile)) {
        return res.sendFile(localFile);
      }
    }

    if (target.startsWith('/')) {
      // relative path on same host
      const localFile = path.join(GEN_ROOT, target.replace(/^\/generated\//, ''));
      if (fs.existsSync(localFile)) {
        return res.sendFile(localFile);
      }
    }

    const response = await axios.get(target, { responseType: 'arraybuffer', timeout: 15000 });
    res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.send(response.data);
  } catch (err) {
    console.warn('[Proxy Image Error]:', err.message);
    res.status(500).send('Failed to fetch image');
  }
});

/* Serve the built frontend if a dist exists (Express 5-compatible catch-all) */
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/generated')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Client dist not built yet. Running in development mode.');
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 OmniPost AI Engine v2.0 running on http://localhost:${PORT}`);
  console.log(`   Generated assets: ${GEN_ROOT}`);
});
