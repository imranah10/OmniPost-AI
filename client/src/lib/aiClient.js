/**
 * aiClient.js — Browser port of the server AI engine.
 *
 * Two engines, same contracts as the server:
 *  • Gemini REST (works directly from the browser with the user's key —
 *    generativelanguage.googleapis.com sends permissive CORS headers)
 *  • 100% free heuristic + dynamic-template fallback (no key needed)
 */

import { shotForTool, toolObjectForPost } from './shotMatch.js';

/**
 * Model resolution — Google retires/renames models per key & region, so a
 * hardcoded model 404s for some users ("Gemini model unavailable (404)").
 * Fix: ask the key ITSELF which models it can use (official ListModels API),
 * pick the best generateContent-capable gemini model, cache it, and on any
 * 404 walk a fallback chain automatically.
 */
const MODEL_CACHE_KEY = 'omnipost_gemini_model';
// 2026-era chain FIRST — Google retires old models constantly (e.g.
// "gemini-2.0-flash-lite is no longer available. Please update your code to
// use models/gemini-3.5-flash-lite"). Newer names first so fresh keys get the
// best model; retired names stay at the tail as harmless legacy fallbacks.
const MODEL_CHAIN = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro',
  'gemini-pro-latest',
  'gemini-1.5-flash',
];
// Hard cap on distinct models tried in one call — keeps worst-case latency sane.
const MAX_MODELS_TO_TRY = 8;
const BAD_MODEL_KIND = /embedding|aqa|imagen|veo|tts|native-audio|live|audio|thinking-exp|robotics|computer-use/i;

const geminiCache = {
  get() {
    try { return localStorage.getItem(MODEL_CACHE_KEY) || ''; } catch { return ''; }
  },
  set(m) {
    try { localStorage.setItem(MODEL_CACHE_KEY, m); } catch { /* private mode */ }
  },
  clear() {
    try { localStorage.removeItem(MODEL_CACHE_KEY); } catch { /* ignore */ }
  },
};

/** Official model listing for THIS key — the key knows what it may call. */
async function listKeyModels(apiKey, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const out = [];
    for (const m of data?.models || []) {
      const name = String(m.name || '').replace(/^models\//, '');
      if (!/^gemini/i.test(name)) continue;
      if (BAD_MODEL_KIND.test(name)) continue;
      if (!Array.isArray(m.supportedGenerationMethods) || !m.supportedGenerationMethods.includes('generateContent')) continue;
      out.push(name);
    }
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Newer generations first (3.5 > 3 > 2.5 > 2.0 > 1.5), full flash before lite. */
function modelVersion(m) {
  const v = parseFloat(String(m).match(/gemini-(\d+(?:\.\d+)?)/)?.[1]);
  return Number.isFinite(v) ? v : 0;
}
function rankAvailable(list) {
  return [...list].sort((a, b) => {
    const va = modelVersion(a);
    const vb = modelVersion(b);
    if (vb !== va) return vb - va;
    const la = /lite/.test(a) ? 1 : 0;
    const lb = /lite/.test(b) ? 1 : 0;
    if (la !== lb) return la - lb;
    return a.length - b.length;
  });
}

/** Pick the best model from the key's own available list. */
function pickBestModel(available) {
  for (const pref of MODEL_CHAIN) {
    if (available.includes(pref)) return pref;
  }
  const ranked = rankAvailable(available);
  return ranked.find((m) => m.includes('flash'))
    || ranked.find((m) => m.includes('pro'))
    || ranked[0]
    || '';
}

/**
 * FULL walk order for one call: cached winner → key's own best → 2026 static
 * chain → every other model the key can actually call. Retired hardcoded names
 * can no longer blind us: the key's live ListModels output is IN the chain.
 */
async function buildModelChain(apiKey) {
  const chain = [];
  const push = (m) => { if (m && !chain.includes(m)) chain.push(m); };
  push(geminiCache.get()); // last known-good model first
  const available = apiKey ? await listKeyModels(apiKey) : null;
  if (available && available.length) push(pickBestModel(available));
  for (const m of MODEL_CHAIN) push(m);
  if (available && available.length) rankAvailable(available).forEach(push);
  return chain.slice(0, MAX_MODELS_TO_TRY);
}

/**
 * Google's 404 body literally NAMES the replacement model:
 *   "...use models/gemini-3.5-flash-lite for the latest features"
 * Extract it (from the RAW, untruncated detail) and try it next — the chain
 * heals itself from Google's own error message.
 */
function extractSuggestedModel(rawDetail, retiredModel) {
  const msg = String(rawDetail || '');
  const named = msg.match(/use\s+models\/([a-z0-9][a-z0-9.\-]+)/i)?.[1];
  if (named && named !== retiredModel && !BAD_MODEL_KIND.test(named)) return named;
  for (const hit of msg.matchAll(/models\/([a-z0-9][a-z0-9.\-]+)/gi)) {
    if (hit[1] && hit[1] !== retiredModel && !BAD_MODEL_KIND.test(hit[1])) return hit[1];
  }
  return '';
}

/**
 * Resolve which model to use for this key:
 * 1) cached from a previous success  2) key's ListModels  3) static chain head
 */
export async function resolveGeminiModel(apiKey) {
  const cached = geminiCache.get();
  if (cached) return cached;
  const available = apiKey ? await listKeyModels(apiKey) : null;
  if (available && available.length) {
    const best = pickBestModel(available);
    if (best) {
      geminiCache.set(best);
      return best;
    }
  }
  return MODEL_CHAIN[0];
}

/**
 * Multi-language campaign pack — one resilient Gemini call translates +
 * culturally adapts the campaign's hero posts into 5 world languages.
 * Throws honestly on failure (caller shows a truthful notice, never fake text).
 */
export async function generateLanguagePack({ strategy, posts, userApiKey }) {
  if (!userApiKey) throw new Error('no-gemini-key');
  const heroPosts = (posts || []).slice(0, 3).map((p, i) => (
    `POST ${i + 1} (${p.contentType || 'Image Post'} for ${p.platform || 'Instagram'}):\nHook: ${p.hook || ''}\nCaption: ${String(p.caption || '').slice(0, 700)}\nCTA: ${p.callToAction || ''}`
  )).join('\n\n');
  const prompt = `You are a world-class transcreation specialist. Localize (NOT word-by-word translate — culturally ADAPT like a native social media manager) this social media campaign into exactly these 5 languages: Hindi (Devanagari script), Spanish, French, Arabic (RTL), Japanese.

BRAND: ${strategy?.brandName || 'Brand'}
INDUSTRY: ${strategy?.industry || ''}
TONE: ${strategy?.brandTone || 'Bold, modern'}
WEBSITE: ${strategy?.domain || ''}

${heroPosts}

RULES:
- Keep brand name and the website URL in English/latin script.
- Captions keep the punchy hook-first structure; 2-4 lines each.
- 3 hashtags per language: keep 1 English brand tag, add 2 native-language tags.
- Use authentic native phrasing a local marketer would actually post — never robotic translation.

Return ONLY valid JSON:
{"languages":{"Hindi":{"code":"hi","posts":[{"hook":"...","caption":"...","hashtags":["#..."]}]},"Spanish":{"code":"es",...},"French":{"code":"fr",...},"Arabic":{"code":"ar",...},"Japanese":{"code":"ja",...}}}
Each language MUST have exactly 3 posts.`;
  const raw = await geminiText(userApiKey, prompt, 120000, { json: true, maxTokens: 8192 });
  const parsed = parseJsonLoose(raw);
  const langs = parsed?.languages;
  if (!langs || typeof langs !== 'object') throw new Error('Gemini response was not a valid language pack');
  const out = {};
  for (const [name, val] of Object.entries(langs)) {
    const plist = Array.isArray(val?.posts) ? val.posts : [];
    if (!plist.length) continue;
    out[name] = {
      code: String(val.code || '').slice(0, 8),
      posts: plist.slice(0, 3).map((p) => ({
        hook: String(p.hook || '').slice(0, 200),
        caption: String(p.caption || '').slice(0, 2200),
        hashtags: (Array.isArray(p.hashtags) ? p.hashtags : []).slice(0, 6).map((h) => String(h)),
      })),
    };
  }
  if (Object.keys(out).length < 2) throw new Error('Gemini returned fewer than 2 usable languages');
  return { languages: out, engine: 'gemini' };
}

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

/**
 * Readable Gemini error — surfaces the REAL reason instead of a silent
 * heuristic fallback the user can't see (this is why "Gemini did nothing").
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiError(res, preDetail = '') {
  let detail = preDetail;
  if (!detail) {
    try {
      const data = await res.json();
      detail = data?.error?.message || '';
    } catch { /* keep empty */ }
  }
  if (res.status === 400 && /api key not valid|api_key_invalid/i.test(detail)) {
    return 'Invalid Gemini API key — check it in Settings (get a free key at aistudio.google.com/app/apikey)';
  }
  if (res.status === 403) return 'Gemini key rejected (403) — key may be restricted (HTTP referrer/IP limits)';
  if (res.status === 429) return 'Gemini free-tier quota exhausted (429) — auto-retried, still rate-limited. Wait a minute and regenerate, or use a new key';
  if (res.status === 500) return 'Gemini server error (500) — auto-retried, still failing. Try again in a moment';
  if (res.status === 503) return 'Gemini is overloaded (503 — high demand on Google\'s side). Auto-retried 3×, still busy — try Regenerate again in a minute';
  if (res.status === 404) return `Gemini model unavailable for this key/region (404)${detail ? `: ${detail.slice(0, 220)}` : ''} — auto-retrying other models…`;
  return `Gemini error ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`;
}

async function generateWithModel(apiKey, model, prompt, timeoutMs, { json = false, maxTokens = 8192, noThinking = false, plain = false } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // ROOT-CAUSE FIX for "Gemini returned empty output (MAX_TOKENS)":
    // gemini-2.5-flash "thinks" by default and hidden thinking tokens count
    // against maxOutputTokens — a 2048-budget call can burn everything on
    // thinking and return ZERO text. Disabling thinking for flash models makes
    // the full budget available for the actual answer.
    const generationConfig = {
      temperature: 0.9,
      maxOutputTokens: maxTokens,
      // PLAIN retry mode: some models (e.g. gemini-3.5-flash on a fresh key)
      // answer the simple "Test key" ping fine but reject JSON-mode calls with
      // a generic 400 "Request contains an invalid argument" — responseMimeType
      // (and/or thinkingConfig) is the unsupported argument. Plain strips both;
      // parseJsonLoose() recovers the JSON from plain text either way.
      ...(json && !plain ? { responseMimeType: 'application/json' } : {}),
    };
    // 3.x/2.5 flash models "think" by default and hidden thinking tokens burn
    // the output budget (root cause of MAX_TOKENS empty output). Disable for
    // every flash-generation model; models that reject the config are retried
    // without it (thinkingRejected path below).
    if (!noThinking && !plain && /flash/.test(model)) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
    if (!res.ok) {
      let preDetail = '';
      try { preDetail = (await res.json())?.error?.message || ''; } catch { /* keep empty */ }
      const err = new Error(await geminiError(res, preDetail));
      err.geminiStatus = res.status;
      // Raw (untruncated) detail → Google may name the replacement model here
      err.suggestedModel = res.status === 404 ? extractSuggestedModel(preDetail, model) : '';
      if (res.status === 404) err.modelNotFound = true; // walk the chain
      if (res.status === 429 || res.status === 500 || res.status === 503) err.retryable = true;
      if (res.status === 400 && /thinking/i.test(preDetail)) err.thinkingRejected = true;
      // Generic 400 "Request contains an invalid argument" → the fancy config
      // (responseMimeType / thinkingConfig) is what this model hates. NEVER
      // surface this to the user — retry the SAME model with a plain request.
      if (res.status === 400 && /invalid/i.test(preDetail) && !/api.?key|api_key/i.test(preDetail)) {
        err.invalidArgument = true;
      }
      // Some keys reject thinkingConfig (older API surfaces) — retry once without it
      if (err.thinkingRejected && !noThinking) {
        return generateWithModel(apiKey, model, prompt, timeoutMs, { json, maxTokens, noThinking: true });
      }
      // Invalid-argument 400 → same model, fully plain request (one level deep)
      if (err.invalidArgument && !plain) {
        return generateWithModel(apiKey, model, prompt, timeoutMs, { maxTokens, plain: true });
      }
      throw err;
    }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text).join('') || '';
    if (!text) {
      const reason = cand?.finishReason || data?.promptFeedback?.blockReason;
      if (reason === 'MAX_TOKENS') {
        // The budget ran out before any text was written — never permanent.
        // geminiText() retries this with a doubled token budget.
        const err = new Error('Gemini hit MAX_TOKENS before writing output — auto-retrying with a larger budget');
        err.retryable = true;
        err.maxTokensIssue = true;
        throw err;
      }
      throw new Error(reason ? `Gemini returned empty output (${reason})` : 'Gemini returned empty output');
    }
    geminiCache.set(model); // success → remember for future calls
    return text;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Gemini timed out — network slow, please retry');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resilient Gemini text call — survives everything Google can throw at it:
 *  • 404 (model retired per key/region) → walk the chain, AND if Google's error
 *    names a replacement model ("use models/gemini-3.5-flash-lite") try THAT next
 *  • 429/500/503 (quota & "high demand") → exponential-backoff retries per model
 *  • MAX_TOKENS empty output → same model retried with a DOUBLED token budget
 *  • thinkingConfig rejected → automatically retried without it
 * Only truly fatal errors (invalid/restricted key, safety block, timeout) fail fast.
 */
async function geminiText(apiKey, prompt, timeoutMs = 60000, opts = {}) {
  if (!apiKey) throw new Error('no-gemini-key');
  geminiCache.clear(); // a stale cached model can 404 after Google retires it
  const queue = await buildModelChain(apiKey); // discovery-first + 2026 names
  let lastErr;
  let retryableFleets = 0; // models whose 3 retryable attempts all failed
  const tried = new Set();
  while (queue.length && tried.size < MAX_MODELS_TO_TRY) {
    const model = queue.shift();
    if (!model || tried.has(model)) continue;
    tried.add(model);
    let budget = opts.maxTokens || 8192;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await generateWithModel(apiKey, model, prompt, timeoutMs, { ...opts, maxTokens: budget });
      } catch (err) {
        lastErr = err;
        if (err.modelNotFound) {
          // Google TOLD us the successor — put it at the FRONT of the queue
          const sug = err.suggestedModel || extractSuggestedModel(err.message, model);
          if (sug && !tried.has(sug)) queue.unshift(sug);
          break;                            // retired for this key → next model
        }
        if (!err.retryable || attempt === 2) break; // fatal, or retries exhausted
        await sleep(1200 * (attempt + 1) + Math.round(Math.random() * 700)); // ≈1.2s, 2.6s
        if (err.maxTokensIssue) budget *= 2;     // give the answer more room
      }
    }
    if (lastErr && !lastErr.modelNotFound && !lastErr.retryable) {
      throw lastErr; // invalid key / safety / timeout — another model won't help
    }
    if (!lastErr?.modelNotFound) {
      retryableFleets += 1;
      // 3 different models all 429/503 after full backoff → the whole fleet is
      // rate-limiting this key; walking further would just waste minutes.
      if (retryableFleets >= 3) throw lastErr;
    }
    // model-retired OR retryable-exhausted → fall through to the next model
  }
  throw lastErr || new Error('Gemini unavailable — no callable model found for this key');
}

/** Instant key health-check for the Settings "Test Key" button. */
export async function testGeminiKey(apiKey) {
  try {
    const text = await geminiText(apiKey, 'Reply with exactly: OK', 30000, { maxTokens: 16 });
    const ok = /^ok\b/i.test(text.trim());
    return { ok, error: ok ? '' : 'Unexpected response', model: geminiCache.get() || '' };
  } catch (err) {
    return { ok: false, error: err.message || 'Test failed', model: '' };
  }
}

/* ------------------------------------------------------------------ */
/* Step 1 — Strategy                                                   */
/* ------------------------------------------------------------------ */
export async function analyzeWebsiteStrategy(websiteData, customPrompt = '', userApiKey = '') {
  let strategyFallbackReason = '';
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

      const raw = await geminiText(userApiKey, prompt, 60000, { json: true, maxTokens: 4096 });
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
      strategyFallbackReason = 'Gemini response was not valid strategy JSON';
    } catch (err) {
      strategyFallbackReason = err.message || 'Gemini call failed';
    }
  }
  const heuristic = heuristicStrategy(websiteData);
  if (strategyFallbackReason) heuristic.geminiError = strategyFallbackReason;
  return heuristic;
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
  // Honest rationale copy: generic sites have NO studios — count the real
  // discovered capabilities instead of printing "0 core services".
  const serviceCount = studiosCount > 0 ? studiosCount : toolsCount;
  const serviceWord = studiosCount > 0 ? 'core services' : 'discovered capabilities';
  const rationale = isStudioPlatform
    ? `Because ${websiteData.domain} features ${studiosCount} distinct sections and ${toolsCount} discovered capabilities, an extended ${recommendedDays}-day campaign with ${recommendedPostCount} posts (${videoReels} high-energy video reels + ${imagePosts} visual showcases) gives every section dedicated viral spotlight without audience fatigue.`
    : `Because ${websiteData.domain} presents ${serviceCount} ${serviceWord} across ${industry}, an agile ${recommendedDays}-day campaign with ${recommendedPostCount} posts (${videoReels} video reels + ${imagePosts} visual cards) ensures each client solution is systematically highlighted.`;

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

// TOOL WORKING NARRATION — the video prompts must describe HOW the tool
// actually works (open → input → process → result) so a video made from the
// real screenshots demonstrates the tool working, not a generic ad.
const normWorkingState = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function toolWorkingSteps({ toolObj = {}, toolName, studio, brandName, domain }) {
  const before = String(toolObj.testedInput || '').trim();
  const after = String(toolObj.testedOutput || '').trim();
  const desc = String(toolObj.description || '').replace(/\s+/g, ' ').trim();
  const genericStates =
    !before || !after || normWorkingState(before) === normWorkingState(after) ||
    /^(the )?(raw )?input/i.test(before) || /^(the )?(finished )?(live )?output/i.test(after);

  const input = genericStates ? 'the task input (paste, upload or select — whatever the tool asks for)' : before;
  const result = genericStates ? (after || 'the finished result rendered on screen') : after;
  const work = desc && desc.length > 24
    ? `does the job for you: ${desc.charAt(0).toLowerCase() + desc.slice(1)}`
    : 'processes the input instantly and returns the finished result';

  return {
    input,
    result,
    steps: [
      { label: 'OPEN', text: `The ${studio || 'tool'} screen loads — "${toolName}" front and center${domain ? ` on ${domain}` : ` on ${brandName}`}.` },
      { label: 'INPUT', text: `The user gives it: ${input}.` },
      { label: 'PROCESS', text: `It ${work}.` },
      { label: 'RESULT', text: `The finished result appears instantly: ${result}` },
    ],
  };
}

function buildVideoScript({ post, strategy, websiteData, feature, toolObj = {} }) {
  const brandName = strategy?.brandName || 'Brand';
  const domain = websiteData?.domain || '';
  const toolName = toolObj?.name || String(feature || 'the tool').replace(/\s*\(.*\)\s*$/, '');
  const studio = toolObj?.studio || String(feature || '').replace(/^.*\((.*)\)\s*$/, '$1');
  const { steps } = toolWorkingSteps({ toolObj, toolName, studio, brandName, domain });

  return {
    duration: '30s',
    audioVibe: 'Energetic Lo-Fi Tech Beat (128 BPM)',
    scenes: [
      {
        sceneNumber: 1,
        time: '0:00 - 0:03',
        visualDirection: `Fast-paced zoom onto the REAL "${toolName}" interface of ${brandName} — screen-record style over the actual UI (use screenshot_tool_live.jpg as the base frame). No stock footage.`,
        onScreenText: String(post.hook).slice(0, 48),
        voiceoverAudio: 'Stop doing this manually. Watch how fast this is.',
      },
      {
        sceneNumber: 2,
        time: '0:03 - 0:10',
        visualDirection: `SHOW THE TOOL WORKING — Step 1→2: ${steps[0].text} ${steps[1].text} Animate it over the real screenshots (screenshot_tool_live.jpg / screenshot_before_input.jpg): cursor moves, input lands.`,
        onScreenText: 'Step 1: open it  →  Step 2: give it the input',
        voiceoverAudio: steps[1].text,
      },
      {
        sceneNumber: 3,
        time: '0:10 - 0:20',
        visualDirection: `SHOW THE RESULT — Step 3→4: ${steps[2].text} ${steps[3].text} Use screenshot_after_output.jpg as the proof frame; the finished result lands on screen with a satisfying resolve.`,
        onScreenText: 'It works. Instantly.',
        voiceoverAudio: `${steps[3].text} That is the whole workflow — seconds, not hours.`,
      },
      {
        sceneNumber: 4,
        time: '0:20 - 0:30',
        visualDirection: `Final CTA screen: the ${brandName} brand mark, the tool name in big type, and ${domain || 'the website'} URL.`,
        onScreenText: `Try it now — ${domain || brandName}`,
        voiceoverAudio: 'Free, no signup, runs right in your browser. Link below.',
      },
    ],
  };
}

/**
 * 10 DISTINCT VISUAL ANGLES — one per post, cycled. Every post gets a genuinely
 * different composition, setting, lighting and camera plan (this is why "all
 * prompts are the same" can never happen again). Each angle yields:
 *   aiImagePrompt      → full copy-paste prompt for ChatGPT/Gemini/Midjourney
 *   directImagePrompt  → clean prompt sent to Gemini's image model for REAL generation
 *   aiVideoPrompt      → full copy-paste prompt for Higgsfield/Runway/Luma/Sora
 *   directVideoPrompt  → compact cinematic paragraph for Veo (real video generation)
 */
const VISUAL_ANGLES = [
  {
    key: 'hero-transform',
    // USER RULE: before & after same state ⇒ NO fake "transformation" pair —
    // showcase the ONE real state instead ("ek hi do").
    concept: (b) => b.single
      ? `A dual-display isometric 3D showcase of "${b.tool}" in action: the finished result "${b.after}" glowing large on the main screen, the tool's interface on the secondary screen`
      : `A dual-display isometric 3D showcase illustrating the instantaneous transformation "${b.before}" into "${b.after}"`,
    style: 'Ultra-clean enterprise aesthetic, luxury minimalist studio lighting, subtle neon cyber accents, vibrant holographic reflections',
    composition: 'Centered social media format (4:5), crisp depth of field, high dynamic range (HDR), 8K photorealistic render, Unreal Engine 5 commercial lighting',
    detail: 'A dynamic electric light pulse connecting the input to the output, proving 0-second execution latency without friction',
    camera: 'Slow heroic dolly-in on the twin floating displays, electric pulse racing from the left screen to the right, speed-ramp at the moment of transformation',
    audio: 'Futuristic bass drop into an uplifting tech-commercial beat',
  },
  {
    key: 'lifestyle',
    concept: (b) => `A real-world lifestyle scene: a focused professional ${b.audienceShort} using "${b.tool}" on a modern smartphone, the live interface glowing as "${b.after}" appears instantly`,
    style: 'Warm cinematic naturalism, golden-hour window light, shallow depth of field, authentic skin tones, premium lifestyle commercial photography',
    composition: 'Vertical 4:5 editorial framing, subject rule-of-thirds left, device screen hero-lit, 8K photorealistic',
    detail: 'Subtle brand-colored ambient glow from the screen onto the surroundings — the moment of "it actually worked" on their face',
    camera: 'Handheld-feel slow push-in over the shoulder, rack focus from face to phone screen as the result lands',
    audio: 'Soft ambient cafe tones rising into a confident modern beat',
  },
  {
    key: 'device-mockup',
    concept: (b) => `A floating 3D device mockup: "${b.tool}" running live on a sleek edge-lit smartphone held in mid-air, "${b.after}" rendered on-screen`,
    style: 'Obsidian studio backdrop, electric brand-colored rim lighting, glossy glass reflections, Apple-keynote-grade product render',
    composition: 'Product hero shot, device floating center at 12° tilt, soft floor reflection beneath, 8K photoreal octane render',
    detail: 'Thin luminous energy ring orbiting the device — the transformation completing as the ring closes',
    camera: 'Orbital arc around the floating device, ending front-on as the screen completes its result',
    audio: 'Clean cinematic whoosh into a minimal premium pulse',
  },
  {
    key: 'macro-pulse',
    concept: (b) => b.single
      ? `An extreme macro close-up of streams of luminous data particles assembling into the finished "${b.after}" inside "${b.tool}"`
      : `An extreme macro close-up of the transformation moment: streams of luminous data particles reassembling from "${b.before}" into the finished "${b.after}"`,
    style: 'High-contrast dark scene, macro lens bokeh, iridescent particle physics, brand-colored light trails on black glass',
    composition: 'Square 1:1 macro crop, particles flowing diagonally, razor-thin focal plane, 8K photoreal CGI',
    detail: 'Individual glowing specks snapping into their final positions — ordered chaos resolving into a finished result',
    camera: 'Slow-motion macro glide following the particle stream, accelerating into the final assembled frame',
    audio: 'Tick-tick crystalline particles building into a deep satisfying resolve',
  },
  {
    key: 'flatlay',
    concept: (b) => `A premium top-down flat-lay: a designer desk where a tablet displays "${b.tool}" mid-run ("${b.after}"), surrounded by branded props, notes and tools of the trade`,
    style: 'Bright airy editorial flat-lay, soft diffused daylight, muted premium palette with one brand-color accent, Kinfolk-magazine aesthetic',
    composition: 'Perfect overhead 1:1 grid, generous negative space top-left for headline overlay, crisp shadows, 8K photorealistic',
    detail: 'A printed card next to the tablet reading the outcome — the physical world acknowledging the digital result',
    camera: 'Static overhead lock-off; elements subtly settle into perfect alignment as the tablet completes',
    audio: 'Gentle paper and ceramic textures under a calm confident groove',
  },
  {
    key: 'quote-card',
    concept: (b) => `A bold typographic statement poster: the claim "${b.hookShort}" set in massive modern type over a deep-gradient brand-colored field with a faint abstract UI wireframe`,
    style: 'Swiss-poster minimalism, ultra-bold grotesque typography shapes, duotone gradient (deep indigo to electric violet), premium tech-brand energy',
    composition: 'Vertical 4:5 poster, type occupying the lower two-thirds, clean negative space above, high contrast, print-quality render',
    detail: 'A thin luminous underline sweeping beneath the key word — understated, confident, premium',
    camera: 'Static poster frame; the underline and gradient breathe with subtle motion',
    audio: 'Single deep impact hit followed by airy silence',
  },
  {
    key: 'testimonial',
    concept: (b) => b.single
      ? `An authentic documentary moment: a ${b.audienceShort} visibly relieved right after "${b.after}" completed instantly in "${b.tool}" on their screen`
      : `A split-screen proof moment: left side "${b.before}" struggle, right side the same person relieved with "${b.after}" done — connected by a seam of light`,
    style: 'Authentic documentary commercial, natural mixed lighting (cool left / warm right), true-to-life textures, trust-building realism',
    composition: 'Split-screen 4:5, mirrored subject placement, light seam at dead center, 8K photorealistic',
    detail: 'The same pair of hands: tense on the left, relaxed on the right — body language as the proof',
    camera: 'Matched framings; a wipe of light travels left-to-right converting struggle into relief',
    audio: 'Muted stress tones resolving into a warm hopeful chord',
  },
  {
    key: 'stat-visual',
    concept: (b) => `A cinematic data visualization: monumental holographic bars and rings rising around "${b.tool}", visualizing the speed and quality of "${b.after}"`,
    style: 'Dark glass-and-neon data aesthetic, volumetric light, glowing chart elements in brand colors, enterprise-command-center mood',
    composition: '16:9 hero crop safe for social, hologram centered with copy space above, depth via foreground bokeh panels, 8K CGI',
    detail: 'One dominant metric tower shooting upward past the others — the headline number made physical',
    camera: 'Rising crane shot as the holograms build floor-to-ceiling around the viewer',
    audio: 'Rhythmic data ticks rising into a triumphant swell',
  },
  {
    key: 'workspace',
    concept: (b) => `A cinematic wide workspace scene: a high-end multi-monitor desk running "${b.tool}" at scale, "${b.after}" filling the main display while city lights drift behind`,
    style: 'Night-interior cinematic, cool ambient practicals with brand-glow accents, atmospheric haze, Roger Deakins-grade lighting',
    composition: 'Anamorphic 21:9-feel crop to 4:5, desk low-third, city bokeh background, 8K photorealistic',
    detail: 'Reflections of the live interface in the window glass — the work glowing into the night',
    camera: 'Very slow lateral tracking past the monitors, ending on the main display as the result completes',
    audio: 'Deep ambient hum into a steady determined pulse',
  },
  {
    key: 'neon-cta',
    concept: (b) => `A neon-sign CTA poster: the action "${b.ctaShort}" glowing as handcrafted neon on a rain-kissed dark wall, "${b.brand}" reflected in the wet pavement`,
    style: 'Cyberpunk-noir minimalism, saturated neon in brand colors on near-black, wet-surface reflections, cinematic haze',
    composition: 'Vertical 9:16 poster, sign centered upper-third, reflection anchoring the bottom, moody high contrast, 8K photoreal',
    detail: 'A passing silhouette stopping in their tracks — drawn in by the glow',
    camera: 'Static noir frame; neon flickers once then holds steady and bright',
    audio: 'Rain ambience with a distant electric hum resolving into brand brightness',
  },
];

/* ------------------------------------------------------------------ */
/* PLATFORM-EXACT IMAGE SPECS — every image prompt must STATE the      */
/* aspect ratio explicitly (user rule: "ratio to bataya hi nahi tha"). */
/* Ratios follow each platform's max-CTR feed spec.                    */
/* ------------------------------------------------------------------ */
export const PLATFORM_IMAGE_SPECS = {
  instagram: {
    ratio: '4:5', orientation: 'portrait (Instagram feed max-CTR size)',
    px: '1080 x 1350 px', dallE: '1024 x 1792 portrait, then crop to 4:5', midjourney: '--ar 4:5',
  },
  linkedin: {
    ratio: '1:1', orientation: 'square (LinkedIn feed-safe)',
    px: '1200 x 1200 px', dallE: '1024 x 1024 square', midjourney: '--ar 1:1',
  },
  'twitter/x': {
    ratio: '16:9', orientation: 'landscape (X timeline widescreen)',
    px: '1600 x 900 px', dallE: '1792 x 1024 landscape', midjourney: '--ar 16:9',
  },
  tiktok: {
    ratio: '9:16', orientation: 'full-vertical (TikTok frame)',
    px: '1080 x 1920 px', dallE: '1024 x 1792 portrait, then crop to 9:16', midjourney: '--ar 9:16',
  },
  'youtube shorts': {
    ratio: '9:16', orientation: 'full-vertical (Shorts frame)',
    px: '1080 x 1920 px', dallE: '1024 x 1792 portrait, then crop to 9:16', midjourney: '--ar 9:16',
  },
  facebook: {
    ratio: '4:5', orientation: 'portrait (Facebook feed max-CTR size)',
    px: '1080 x 1350 px', dallE: '1024 x 1792 portrait, then crop to 4:5', midjourney: '--ar 4:5',
  },
  reddit: {
    ratio: '1:1', orientation: 'square (Reddit preview-safe)',
    px: '1080 x 1080 px', dallE: '1024 x 1024 square', midjourney: '--ar 1:1',
  },
};

export function imageSpecFor(platform) {
  const key = String(platform || '').toLowerCase().trim();
  return PLATFORM_IMAGE_SPECS[key] || PLATFORM_IMAGE_SPECS.instagram;
}

/** Explicit, copy-paste-safe aspect-ratio block for human-facing image prompts. */
function ratioBlock(spec) {
  return `- Aspect Ratio (MANDATORY — the final image MUST be ${spec.ratio}):
   • Exact export size: ${spec.px} (${spec.orientation})
   • DALL-E 3 / Gemini: ${spec.dallE}
   • Midjourney: append ${spec.midjourney}
   • Compose the scene freely, but crop/export the FINAL image to exactly ${spec.ratio}.`;
}

export function buildPostAIPrompts({ strategy, post, toolName, studio, toolObj = {}, websiteData = {}, postIndex = 0 }) {
  const brandName = strategy?.brandName || websiteData?.title || 'Brand';
  const industry = strategy?.industry || 'Technology & Digital Solutions';
  const domain = websiteData?.domain || websiteData?.url || '';
  const audience = strategy?.targetAudience || 'modern professionals';

  const angle = VISUAL_ANGLES[postIndex % VISUAL_ANGLES.length];
  // USER RULE 57f: when the tool has ONE meaningful state (no tested data, or
  // testedInput === testedOutput), the old prompt invented a fake before/after
  // pair ("the raw input state" → "the finished live output") — nonsense like
  // "transformation of X into X". Collapse to a single honest state instead:
  // transformation angles switch to single-subject compositions via b.single.
  const normState = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const beforeState = toolObj?.testedInput || '';
  const afterState = toolObj?.testedOutput || '';
  const single =
    !beforeState || !afterState || normState(beforeState) === normState(afterState) ||
    /^(the )?(raw )?input/i.test(beforeState) || /^(the )?(finished )?(live )?output/i.test(afterState);
  const b = {
    single,
    before: beforeState || afterState || 'the raw input state',
    after: afterState || beforeState || 'the finished live output',
    tool: toolName || 'the tool',
    studio: studio || 'Core Services',
    brand: brandName,
    audienceShort: /business|enterprise|b2b|executive/i.test(audience) ? 'at a bright studio desk' : 'in a bright modern cafe',
    hookShort: String(post?.hook || `Instant results with ${toolName}`).slice(0, 60),
    ctaShort: String(post?.callToAction || `Try ${toolName} now`).replace(/👉.*$/g, '').slice(0, 48),
  };

  const imgSpec = imageSpecFor(post?.platform);

  const aiImagePrompt = `PROMPT FOR CHATGPT (DALL-E 3) / GEMINI / MIDJOURNEY — VISUAL ANGLE ${postIndex + 1}: ${angle.key.toUpperCase()}
(💡 TIP FOR 100% "HUBAHU" BRAND ACCURACY: Attach 'screenshot_tool_live.jpg' — this tool's real UI — alongside this prompt into ChatGPT or Gemini!)

Prompt: Create a high-converting commercial advertising visual for "${brandName}" (${industry}).
- Concept: ${angle.concept(b)}
- Spotlight capability: "${toolName}" (${studio})${b.single ? ` — delivers: ${b.after}` : ` — input state: ${b.before}; live result: ${b.after}`}.
- Visual Style: ${angle.style}
- Composition: ${angle.composition}
${ratioBlock(imgSpec)}
- Details: ${angle.detail}`;

  const directImagePrompt = `${angle.concept(b)} for the brand "${brandName}" (${industry}). Capability showcased: ${toolName} (${studio})${b.single ? ` — delivers "${b.after}" instantly` : ` — takes "${b.before}" and returns "${b.after}" instantly`}. Style: ${angle.style}. Composition: ${angle.composition}. ${angle.detail}. Final image aspect ratio: exactly ${imgSpec.ratio} (${imgSpec.px}; ${imgSpec.dallE}). No embedded text or watermarks.`;

  const working = toolWorkingSteps({ toolObj, toolName: b.tool, studio: b.studio, brandName, domain });
  const workingBlock = working.steps.map((s, i) => `${i + 1}. ${s.label}: ${s.text}`).join('\n');

  const aiVideoPrompt = `PROMPT FOR HIGGSFIELD / RUNWAY GEN-3 / LUMA / SORA — VISUAL ANGLE ${postIndex + 1}: ${angle.key.toUpperCase()}
(💡 TIP: Upload 'screenshot_tool_live.jpg' as the START FRAME and 'screenshot_after_output.jpg' as the PROOF frame — the video must SHOW THE TOOL ACTUALLY WORKING, step by step, on the real UI!)

HOW "${toolName}" WORKS — THE VIDEO MUST DEMONSTRATE THIS EXACT WORKFLOW:
${workingBlock}

Prompt: A cinematic 9:16 vertical demo-commercial video reel for "${toolName}" on ${brandName} — angle: ${angle.key}.
- Scene 1 (0:00 - 0:03) HOOK: ${angle.camera.split(',')[0]}. On-screen bold typography: "${b.hookShort}".
- Scene 2 (0:03 - 0:07) THE TOOL WORKING — OPEN + INPUT: ${working.steps[0].text} ${working.steps[1].text} Screen-record style over the real interface (start frame = screenshot_tool_live.jpg): cursor moves, the input lands.
- Scene 3 (0:07 - 0:11) THE TOOL WORKING — PROCESS + RESULT: ${working.steps[2].text} ${working.steps[3].text} (proof frame = screenshot_after_output.jpg).
- Scene 4 (0:11 - 0:14) PROOF STING: ${angle.detail}. The live result (${b.after}) lands at 0-second latency.
- Scene 5 (0:14 - 0:18) CTA: Cinematic settle onto ${brandName} branding. On-screen CTA: "${post?.callToAction || `Try ${toolName} Now ➔ Visit ${domain}`}".
- Camera & Motion: ${angle.camera}. 4K 60fps photorealistic commercial grade.
- Audio Vibe: ${angle.audio}.`;

  const directVideoPrompt = `Cinematic 9:16 vertical demo reel for "${toolName}" by ${brandName}: it shows the tool ACTUALLY WORKING — open "${toolName}", give it ${working.input}, and the result "${working.result}" lands instantly on screen. ${angle.camera}. ${b.single ? `The scene showcases the live result: ${b.after}` : `The scene transforms as ${angle.detail}, revealing the live result: ${b.after}`}. Style: ${angle.style}. End on the ${brandName} brand mark with call to action "${b.ctaShort}". Audio: ${angle.audio}. Photorealistic, 4K, high detail.`;

  return { aiImagePrompt, aiVideoPrompt, directImagePrompt, directVideoPrompt, angleKey: angle.key };
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

// Platform-adapted captions — "jo bhi hota hai wo likha hona chahiye achha se
// us tool ke bare me hi": Reddit gets a builder-voice write-up (zero hashtag
// spam), X gets a ≤280-char cut, everything else gets the long-form skeleton.
function platformAdaptedCaption({ platform, hook, benefit, brand, dom, tool, studio, customPrompt, carouselPrompt, isCarousel }) {
  const focus = customPrompt ? `\n\n🎯 Focus: ${customPrompt}` : '';
  const carousel = carouselPrompt && isCarousel ? `\n\n🎠 Carousel focus: ${carouselPrompt}` : '';
  const key = String(platform || '').toLowerCase();

  if (key.includes('reddit')) {
    const benefitLine = benefit.charAt(0).toUpperCase() + benefit.slice(1);
    const studioPhrase = brand && String(studio).includes(brand)
      ? `one of the ${studio} tools`
      : `one of the ${studio} tools on ${brand}`;
    return `I keep coming back to ${tool.name} — ${studioPhrase} — so here's an honest write-up\n\n${benefitLine}\n\nWhy I actually use it instead of the usual suspects:\n• runs entirely in the browser — nothing gets uploaded anywhere\n• no account, no paywall, no "3 free uses then subscribe" nonsense\n• it does the one job fast and gets out of the way${customPrompt ? `\n\nContext: ${customPrompt}` : ''}\n\nIf that sounds useful: ${dom}\n\nGenuinely curious what you'd want it to do next — happy to answer questions in the comments. (Fitting subs for this kind of post: r/SideProject, r/InternetIsBeautiful, r/productivity — pick the one that matches your audience.)`;
  }

  if (key.includes('twitter') || key === 'x') {
    const brandTag = `#${brand.replace(/[^a-zA-Z0-9]/g, '')}`;
    return `${hook}\n\n${benefit.charAt(0).toUpperCase() + benefit.slice(1)} — free, no signup, runs in your browser.\n\n→ ${dom} ${brandTag}`;
  }

  // LinkedIn keeps it substance-first; Instagram / TikTok / Facebook / YouTube
  // get the rotating long-form skeletons.
  const capSkeletons = [
    () => `${hook}\n\n${benefit}.\n\n✅ Works instantly in your browser\n✅ No installs, no learning curve\n✅ Part of ${brand}'s ${studio} suite${focus}${carousel}\n\n👉 Open ${tool.name} at ${dom}`,
    () => `Quick one: ${tool.name}.\n\nMost ${studio} tools make you wait, sign up, or upload your files. ${brand} does the opposite — ${benefit}.\n\n• Fast: results in seconds\n• Private: runs on your device\n• Free: no paywall surprises${focus}${carousel}\n\nSee it live → ${dom}`,
    () => `We built ${tool.name} for one reason: ${benefit.replace(/^[A-Z]/, (c) => c.toLowerCase())} without the usual friction.\n\nIt lives in ${studio} on ${brand}, it's free, and it takes about 60 seconds to get value out of it.${focus}${carousel}\n\nTry it now: ${dom}`,
    () => `3 reasons ${tool.name} earns its spot in your bookmarks:\n\n1️⃣ ${benefit.charAt(0).toUpperCase() + benefit.slice(1)}\n2️⃣ Zero data leaves your browser\n3️⃣ It's part of the full ${studio} suite on ${brand}${focus}${carousel}\n\nTest it yourself → ${dom}`,
    () => `Unpopular opinion: ${studio} tools don't need accounts, uploads or subscriptions.\n\n${tool.name} on ${brand} proves it — ${benefit}.\n\nBookmark it, thank yourself later.${focus}${carousel}\n\n${dom}`,
  ];
  const skeletonIndex = Math.abs(`${hook}`.length + tool.name.length) % capSkeletons.length;
  return capSkeletons[skeletonIndex]();
}

// Platform-aware hashtag policy: Reddit gets NONE (hashtags don't exist
// there), X gets max 2, LinkedIn max 5, everything else the full set.
function platformHashtags(platform, baseTags, isAgency) {
  const key = String(platform || '').toLowerCase();
  if (key.includes('reddit')) return [];
  const generic = isAgency
    ? [...baseTags, '#BusinessGrowth', '#Leadership', '#GlobalWorkforce', '#Engineering', '#FutureOfWork']
    : [...baseTags, '#Innovation', '#TechSolutions', '#Productivity', '#NextGenTech'];
  if (key.includes('twitter') || key === 'x') return generic.slice(0, 2);
  if (key.includes('linkedin')) return generic.slice(0, 5);
  return generic;
}

function buildTemplateCampaign({ websiteData, strategy, days, customPrompt, carouselPrompt, videoAt, platforms, bestTimes, onlyDays = null }) {
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
  const dayList = Array.isArray(onlyDays) && onlyDays.length
    ? onlyDays
    : Array.from({ length: days }, (_, d) => d + 1);
  let i = 0;

  // COVERAGE GUARANTEE: for EVERY day, EVERY selected platform gets its own
  // post — the user can post on all of them each day (post ya na post, content
  // aana chahiye). Tool rotation continues globally so posts never twin.
  for (const dayNum of dayList) {
    for (const platform of platforms) {
      const isVideo = videoAt.has(i);
      const isCarousel = !isVideo && i % 3 === 0;
      const tool = tools[i % tools.length];
      const studio = tool.studio || (websiteData.studios || [])[i % (websiteData.studios?.length || 1)] || 'Core Services';

      // CONTENT DIVERSITY ENGINE — every post gets a DIFFERENT hook formula,
      // caption skeleton and CTA shape (rotated), built from the tool's own
      // description so no two posts read like twins.
      const tDesc = (tool.description || `Everything ${tool.name} can do for you`).replace(/\s+/g, ' ').trim();
      const benefit = tDesc.length > 24 ? tDesc.charAt(0).toLowerCase() + tDesc.slice(1) : `Get ${tool.name} done in seconds, right in your browser`;
      const brand = strategy.brandName;
      const dom = websiteData.domain;
      const hookStyles = [
        () => `${tool.name}: the ${studio} shortcut nobody told you about`,
        () => `Stop losing hours — ${tool.name} on ${brand} does it in seconds`,
        () => `What can ${tool.name} actually do? More than you think 👀`,
        () => `The ${studio} workflow you'll wish you found sooner: ${tool.name}`,
        () => `${benefit.charAt(0).toUpperCase() + benefit.slice(1)} — no signup, no uploads, zero waiting`,
        () => `POV: you just discovered ${tool.name} inside ${brand}`,
        () => `Why are teams quietly switching to ${tool.name}?`,
        () => `${tool.name} in ${studio} — try it once and you'll keep coming back`,
        () => `Everything you wanted from a ${studio} tool, minus the bloat: ${tool.name}`,
        () => `Your data never leaves your browser with ${tool.name} — here's why that matters`,
        () => `From zero to done: ${tool.name} in under a minute`,
        () => `The underrated ${studio} pick on ${brand}: ${tool.name}`,
      ];
      const hook = hookStyles[i % hookStyles.length]();

      const caption = platformAdaptedCaption({ platform, hook, benefit, brand, dom, tool, studio, customPrompt, carouselPrompt, isCarousel });

      const ctaVariants = [
        `Explore ${tool.name} 👉 ${dom}`,
        `Try ${tool.name} free → ${dom}`,
        `Open the ${studio} suite: ${dom}`,
        `${tool.name} is one click away: ${dom}`,
        `See it in action 👉 ${dom}`,
      ];
      const cta = ctaVariants[i % ctaVariants.length];

      const brandClean = strategy.brandName.replace(/[^a-zA-Z0-9]/g, '');
      const toolClean = tool.name.replace(/[^a-zA-Z0-9]/g, '');
      const studioClean = studio.replace(/[^a-zA-Z0-9]/g, '');
      const hashtags = platformHashtags(platform, [`#${brandClean}`, `#${toolClean}`, `#${studioClean}`], isAgency);

      const prompts = buildPostAIPrompts({
        strategy,
        post: { hook, callToAction: cta, platform },
        toolName: tool.name,
        studio,
        toolObj: tool,
        websiteData,
        postIndex: i,
      });

      // Screenshot of THIS post's own tool (matched by tool URL / id / studio —
      // never a modulo crawl-order page, which could be a blog or legal page).
      const shot = shotForTool(websiteData, { toolName: tool.name, studio, toolUrl: tool.url });

      results.push({
        id: `post-${results.length + 1}`,
        day: `Day ${dayNum}`,
        platform,
        contentType: isVideo ? 'Video Reel / Short' : (isCarousel ? 'Carousel Graphic' : 'Image Post'),
        carouselBrief: isCarousel ? (carouselPrompt || '') : '',
        studio,
        toolName: tool.name,
        toolUrl: tool.url || '',
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
        geminiImagePrompt: prompts.directImagePrompt,
        aiVideoPrompt: prompts.aiVideoPrompt,
        geminiVideoPrompt: prompts.directVideoPrompt,
        visualAngle: prompts.angleKey,
        videoScript: isVideo
          ? buildVideoScript({ post: { hook, callToAction: cta }, strategy, websiteData, feature: `${tool.name} (${studio})`, toolObj: tool })
          : null,
        engine: 'dynamic-template',
      });
      i++;
    }
  }
  return results;
}

export async function generateFullCampaign({
  websiteData,
  strategy,
  totalPosts,
  days,
  customPrompt,
  carouselPrompt,
  selectedPlatforms,
  userApiKey,
  onProgress = () => {},
}) {
  const platforms = selectedPlatforms && selectedPlatforms.length
    ? selectedPlatforms
    : (strategy.primaryPlatforms?.length ? strategy.primaryPlatforms : ['Instagram', 'LinkedIn', 'Twitter/X', 'TikTok']);
  const safeDays = Math.max(1, Math.min(60, parseInt(days) || 14));
  const perDay = platforms.length;
  // COVERAGE GUARANTEE: exactly ONE post per selected platform per day —
  // "har din sabhi platforms ka content aana chahiye". The old independent
  // totalPosts spread posts unevenly, so most day folders held a single
  // platform. Now total = days x platforms, position-locked.
  const total = safeDays * perDay;
  const dayOf = (i) => Math.floor(i / perDay) + 1;
  const platformFor = (i) => platforms[i % perDay];

  const videoTarget = Math.max(1, Math.min(total - 1, Math.round(total * 0.35)));
  const videoAt = new Set();
  for (let j = 0; j < videoTarget; j++) {
    videoAt.add(Math.min(total - 1, Math.floor(((j + 0.5) * total) / videoTarget)));
  }

  const bestTimes = ['9:00 AM', '1:00 PM', '6:30 PM', '8:00 PM'];

  const studiosList = (websiteData.studios || []).join(', ') || 'Platform Offerings';
  const toolsList = (websiteData.discoveredTools || []).slice(0, 40).map((t) => `"${t.name}" (${t.studio})${t.description ? ` — ${t.description.slice(0, 60)}` : ''}`).join('; ');

  // Shared finalizer — turns one AI post object into the canonical post shape.
  // Day + platform are assigned BY POSITION (i), never by what the model wrote,
  // so every day x platform slot exists exactly once.
  const finalizePost = (p, i) => {
    const mustBeVideo = videoAt.has(i) || Boolean(p.videoScript && p.videoScript.scenes && p.videoScript.scenes.length);
    // Resolve the REAL tool object by NAME — pairing a post about tool X with
    // tool Y's URL, description and screenshot would be wrong.
    const toolObj = toolObjectForPost(websiteData, p.toolName)
      || (websiteData.discoveredTools || [])[i % (websiteData.discoveredTools?.length || 1)]
      || {};
    const studio = p.studio || toolObj.studio || (websiteData.studios || [])[i % (websiteData.studios?.length || 1)] || 'Core Services';
    const toolName = p.toolName || toolObj.name || `Offering ${i + 1}`;
    const hook = String(p.hook || `Transform your operations with ${toolName} in ${studio}`).slice(0, 140);
    const cta = String(p.callToAction || `Discover ${toolName} on ${websiteData.domain}`).slice(0, 200);

    const script = mustBeVideo
      ? (p.videoScript && p.videoScript.scenes && p.videoScript.scenes.length
          ? p.videoScript
          : buildVideoScript({ post: { hook, callToAction: cta }, strategy, websiteData, feature: `${toolName} (${studio})`, toolObj }))
      : null;

    const finalPlatform = platformFor(i);
    const platformKey = String(finalPlatform || '').toLowerCase();

    const brandTag = `#${String(strategy.brandName || '').replace(/[^a-zA-Z0-9]/g, '')}`;
    const industryTag = `#${String(strategy.industry || '').split(' ')[0].replace(/[^a-zA-Z0-9]/g, '')}`;
    // Screenshot of THIS post's own tool (name-resolved) — never modulo.
    const shot = shotForTool(websiteData, { toolName, studio, toolUrl: toolObj?.url });

    const prompts = buildPostAIPrompts({
      strategy,
      post: { hook, callToAction: cta, platform: finalPlatform },
      toolName,
      studio,
      toolObj,
      websiteData,
      postIndex: i,
    });

    // Dedicated AI-authored carousel slide plan (user's carousel prompt applied)
    const providedSlides = Array.isArray(p.carouselSlides)
      ? p.carouselSlides
          .filter((s) => s && (s.headline || s.kicker))
          .slice(0, 6)
          .map((s) => ({
            kicker: String(s.kicker || '').slice(0, 30),
            headline: String(s.headline || '').slice(0, 120),
            body: String(s.body || '').slice(0, 160),
          }))
      : null;

    // Reddit ships ZERO hashtags (they don't exist there).
    const fallbackTags = platformKey.includes('reddit') ? [] : [
      brandTag, industryTag,
      `#${String(toolName).replace(/[^a-zA-Z0-9]/g, '')}`,
      `#${String(studio).replace(/[^a-zA-Z0-9]/g, '')}`,
      '#BusinessGrowth', '#Innovation', '#FutureOfWork',
    ];

    // RATIO GUARD: whichever image prompt survives (LLM-authored or ours),
    // the explicit aspect-ratio block is ALWAYS present (user rule) — and
    // the 900-char cap is gone because it silently cut the ratio block off.
    const platformSpec = imageSpecFor(finalPlatform);
    const compactRatio = `Aspect Ratio (MANDATORY): exactly ${platformSpec.ratio} — ${platformSpec.px}; DALL-E/Gemini: ${platformSpec.dallE}; Midjourney: append ${platformSpec.midjourney}.`;
    const llmImg = String(p.imagePrompt || '').trim();
    const llmHasRatio = /aspect ratio/i.test(llmImg);
    const finalImagePrompt = llmImg
      ? (llmHasRatio ? llmImg : `${llmImg}\n- ${compactRatio}`)
      : prompts.aiImagePrompt;
    const finalGeminiPrompt = llmImg
      ? (llmHasRatio ? llmImg : `${llmImg} ${compactRatio}`)
      : prompts.directImagePrompt;

    return {
      id: `post-${i + 1}`,
      day: `Day ${dayOf(i)}`,
      platform: finalPlatform,
      contentType: mustBeVideo ? 'Video Reel / Short' : (i % 3 === 0 ? 'Carousel Graphic' : 'Image Post'),
      studio,
      toolName,
      toolUrl: toolObj?.url || '',
      hook,
      caption: String(p.caption || '').slice(0, 2200),
      hashtags: platformKey.includes('reddit')
        ? []
        : (Array.isArray(p.hashtags) && p.hashtags.length > 0 ? p.hashtags.slice(0, 14) : fallbackTags),
      callToAction: cta,
      bestTime: p.bestTime || bestTimes[i % bestTimes.length],
      inputScreenshotUrl: shot?.webUrl || websiteData.screenshotUrl,
      outputScreenshotUrl: shot?.webUrl || websiteData.screenshotUrl,
      screenshotUrl: shot?.webUrl || websiteData.screenshotUrl,
      rawScreenshot: shot?.webUrl || websiteData.screenshotUrl,
      testedInput: toolObj.testedInput || 'Interactive Parameters',
      testedOutput: toolObj.testedOutput || 'Live Computation Executed',
      imagePrompt: finalImagePrompt.slice(0, 2400),
      aiImagePrompt: prompts.aiImagePrompt,
      geminiImagePrompt: finalGeminiPrompt.slice(0, 2000),
      aiVideoPrompt: prompts.aiVideoPrompt,
      geminiVideoPrompt: prompts.directVideoPrompt,
      visualAngle: p.visualAngle || prompts.angleKey,
      carouselContent: providedSlides,
      videoScript: script,
      engine: 'gemini',
    };
  };

  let campaignFallbackReason = '';
  if (userApiKey) {
    // CHUNKED GENERATION — one Gemini call per 2-day window. Small responses
    // never hit MAX_TOKENS, and each chunk carries ALL platforms for its days,
    // so full day x platform coverage survives even huge campaigns.
    const CHUNK_DAYS = 2;
    const collected = [];
    try {
      for (let dStart = 1; dStart <= safeDays; dStart += CHUNK_DAYS) {
        const dEnd = Math.min(dStart + CHUNK_DAYS - 1, safeDays);
        const chunkCount = (dEnd - dStart + 1) * perDay;
        const videoDesc = [];
        for (let k = 0; k < chunkCount; k++) {
          if (videoAt.has((dStart - 1) * perDay + k)) {
            videoDesc.push(`${platforms[k % perDay]} on Day ${dStart + Math.floor(k / perDay)}`);
          }
        }
        const prompt = `You are a world-class CMO and viral social media copywriter.
Write the posts for DAYS ${dStart} to ${dEnd} of a ${safeDays}-day campaign for this brand:

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
${carouselPrompt ? `CAROUSEL-SPECIFIC INSTRUCTIONS (MUST shape every "Carousel Graphic" post): ${carouselPrompt}` : ''}

HARD STRUCTURE RULE:
- Return EXACTLY ${chunkCount} posts IN THIS EXACT ORDER: Day ${dStart} first — one post per platform in this order [${platforms.join(', ')}] — then Day ${dEnd} in the same order (if within range).
- Set each post's "day" and "platform" fields to match that order.

CRITICAL COPYWRITING INSTRUCTIONS:
- Write STRICTLY in the authentic voice of ${strategy.brandName} (${strategy.industry}).
- Every post MUST spotlight a specific Section and a specific Capability from the list above.
- ANTI-REPEAT RULE: never feature the same capability twice while unfeatured capabilities remain. Hooks must each use a DIFFERENT angle (question, stat, pain-point, contrarian, listicle, how-to, myth-bust, social-proof, curiosity, direct benefit).
- Captions: first line = scroll-stopping hook naming the capability + outcome; body 3-5 punchy lines; CTA invites to ${websiteData.domain}.
- PLATFORM VOICE: adapt every caption to its platform — professional depth for LinkedIn, <=280 chars for X, hook-first for TikTok/Shorts; for Reddit write a genuine builder-voice write-up with ZERO hashtags.
- Hashtags: 8-10 for Instagram/TikTok/Facebook, 3-5 for LinkedIn, 1-2 for X, ZERO for Reddit.
- imagePrompt: a vivid commercial advertising prompt for THIS post — a UNIQUE visual concept unlike every other post. Rotate compositions: hero product shot, real-life scene, 3D device mockup, macro detail, flat-lay desk, typographic poster, testimonial moment, data visualization, cinematic workspace, neon CTA poster.
- For every post whose contentType is "Carousel Graphic", ALSO include "carouselSlides": an array of EXACTLY 4 objects, each {"kicker": "short label (max 22 chars)", "headline": "punchy swipeable headline (max 90 chars)", "body": "one supporting line (optional, max 140 chars)"}. Slide 1 = scroll-stopping cover hook; slides 2-4 = ONE distinct idea per swipe.
- videoScript: for video posts${videoDesc.length ? ` (${videoDesc.join(', ')})` : ' (none in this chunk — set videoScript to null)'}, 4 cinematic scenes with time, visualDirection, onScreenText, voiceoverAudio. The scenes must SHOW the tool actually working step by step (open the tool -> give the input -> it processes -> the real result appears), screen-recording style over the real UI.

Return ONLY valid JSON:
{ "posts": [ { "day": "Day ${dStart}", "platform": "${platforms[0]}", "contentType": "Video Reel / Short" OR "Image Post" OR "Carousel Graphic", "studio": "...", "toolName": "...", "hook": "...", "caption": "...", "hashtags": ["#Tag1"], "callToAction": "...", "bestTime": "9:00 AM", "imagePrompt": "...", "carouselSlides": null or [{ "kicker": "...", "headline": "...", "body": "..." } x4], "videoScript": null or { "duration": "30s", "audioVibe": "...", "scenes": [ { "sceneNumber": 1, "time": "0:00 - 0:03", "visualDirection": "...", "onScreenText": "...", "voiceoverAudio": "..." } ] } } ] }`;

        const raw = await geminiText(userApiKey, prompt, 120000, { json: true, maxTokens: 8192 });
        const parsed = parseJsonLoose(raw);
        const list = Array.isArray(parsed) ? parsed : parsed?.posts;
        if (!Array.isArray(list) || !list.length) throw new Error('Gemini returned no usable campaign chunk JSON');
        list.slice(0, chunkCount).forEach((p, k) => {
          collected.push({ p, gi: (dStart - 1) * perDay + k });
        });
        onProgress({ index: Math.min(total, dEnd * perDay), total });
      }
    } catch (err) {
      campaignFallbackReason = err.message || 'Gemini call failed';
    }

    if (!campaignFallbackReason && collected.length >= Math.min(3, total)) {
      const byGi = new Map(collected.map(({ p, gi }) => [gi, p]));
      const postsResult = new Array(total).fill(null);
      for (const [gi, p] of byGi) postsResult[gi] = finalizePost(p, gi);

      // Patch any slot a chunk short-changed with template-engine posts for
      // exactly those days — coverage stays 100% either way.
      const missingDays = [...new Set(
        Array.from({ length: safeDays }, (_, d) => d + 1)
          .filter((d) => platforms.some((_, k) => !postsResult[(d - 1) * perDay + k]))
      )];
      if (missingDays.length) {
        const fillers = buildTemplateCampaign({
          websiteData, strategy, days: safeDays, customPrompt, carouselPrompt,
          videoAt, platforms, bestTimes, onlyDays: missingDays,
        });
        const queue = [...fillers];
        for (let gi = 0; gi < total; gi++) {
          if (!postsResult[gi] && queue.length) postsResult[gi] = queue.shift();
        }
      }

      const finalPosts = postsResult.filter(Boolean);
      finalPosts.masterBrandPrompt = generateMasterBrandPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
      finalPosts.masterImagePrompt = generateMasterImagePrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
      finalPosts.masterVideoPrompt = generateMasterVideoPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
      return finalPosts;
    }
    if (!campaignFallbackReason) campaignFallbackReason = 'Gemini response was not valid campaign JSON';
  }

  const templatePosts = buildTemplateCampaign({ websiteData, strategy, days: safeDays, customPrompt, carouselPrompt, videoAt, platforms, bestTimes });
  templatePosts.masterBrandPrompt = generateMasterBrandPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
  templatePosts.masterImagePrompt = generateMasterImagePrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
  templatePosts.masterVideoPrompt = generateMasterVideoPrompt({ strategy, websiteData, tools: websiteData.discoveredTools });
  if (campaignFallbackReason) {
    templatePosts.campaignGeminiError = campaignFallbackReason;
    templatePosts.forEach((p) => { p.geminiError = campaignFallbackReason; });
  }
  return templatePosts;
}
