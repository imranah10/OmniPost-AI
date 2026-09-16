/**
 * scripts_omnipilot_resilience.mjs — Node-level resilience E2E for aiClient.js.
 *
 * Simulates Google's Gemini API misbehaving (NO real key, NO real network):
 *   A) 503 "high demand" twice → backoff retries → success on 3rd attempt
 *   B) MAX_TOKENS empty output → same model retried with DOUBLED budget → success
 *   C) carouselPrompt threading → Smart Engine captions + slide plan (no key)
 *   D) thinkingConfig rejected (400) → auto-retry without thinking → success
 *   E) 429 forever → every model+attempt exhausted → honest quota error
 *
 * aiClient.js / carousel.js are browser modules with no npm deps, so they are
 * copied to .mjs and imported directly. fetch + localStorage are stubbed.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(__dirname, 'client', 'src', 'lib');
const TMP = path.join(__dirname, '.tmp_resilience');
mkdirSync(TMP, { recursive: true });

// ---- stubs BEFORE importing the modules -------------------------------
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const copyAsMjs = (name) => {
  const src = readFileSync(path.join(LIB, name), 'utf8');
  const out = path.join(TMP, name.replace(/\.js$/, '.mjs'));
  writeFileSync(out, src);
  return pathToFileURL(out).href;
};

const ai = await import(copyAsMjs('aiClient.js'));
const car = await import(copyAsMjs('carousel.js'));

// ---- fetch stub machinery ---------------------------------------------
let postLog = [];   // { url, body }
let postResponses = []; // queue of fn(body)=>({status, json})

const MODELS_OK = {
  models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
  ],
};

globalThis.fetch = async (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase();
  if (method === 'GET') {
    return { ok: true, status: 200, json: async () => MODELS_OK };
  }
  const body = JSON.parse(opts.body || '{}');
  postLog.push({ url, body });
  const responder = postResponses.shift();
  if (!responder) throw new Error('fetch-stub: no more queued POST responses');
  const r = responder(body);
  return { ok: r.status === 200, status: r.status, json: async () => r.json };
};

const text200 = (text) => ({ status: 200, json: {
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
}});
const genErr = (status, msg) => ({ status, json: { error: { code: status, message: msg } } });
const empty200 = (finishReason) => ({ status: 200, json: {
  candidates: [{ content: { parts: [] }, finishReason }],
}});

// ---- helpers -----------------------------------------------------------
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

// ========================================================================
section('A) 503 high-demand → auto backoff retries → SUCCESS (testGeminiKey)');
postLog = [];
{
  postResponses = [
    () => genErr(503, 'The model is overloaded. Please try again later.'),
    () => genErr(503, 'The model is overloaded. Please try again later.'),
    () => text200('OK'),
  ];
  const t0 = Date.now();
  const res = await ai.testGeminiKey('FAKE_KEY_A');
  const elapsed = Date.now() - t0;
  const posts = postLog.filter((p) => p.url.includes(':generateContent'));
  check('key test succeeds after 503s', res.ok === true, JSON.stringify(res));
  check('exactly 3 generateContent attempts', posts.length === 3, `got ${posts.length}`);
  check('backoff waited >= 3.5s total', elapsed >= 3500, `${elapsed}ms`);
  check('thinkingConfig present on 2.5-flash', posts.some((p) => p.body.generationConfig?.thinkingConfig), 'thinkingConfig missing');
  console.log(`  ⏱ elapsed ${elapsed}ms, attempts=${posts.length}`);
}

// ========================================================================
section('B) MAX_TOKENS empty output → DOUBLED budget retry → campaign SUCCESS');
postLog = [];
{
  const goodCampaign = {
    posts: [
      { day: 'Day 1', platform: 'Instagram', contentType: 'Image Post', studio: 'Studio A', toolName: 'ToolX', hook: 'Hook A', caption: 'Cap A text here long enough for extraction', hashtags: ['#A'], callToAction: 'CTA A', bestTime: '9:00 AM', imagePrompt: 'img', videoScript: null },
      { day: 'Day 2', platform: 'LinkedIn', contentType: 'Carousel Graphic', studio: 'Studio A', toolName: 'ToolX', hook: 'Hook B', caption: 'Cap B', hashtags: ['#B'], callToAction: 'CTA B', bestTime: '1:00 PM', imagePrompt: 'img', carouselSlides: [
        { kicker: 'Cover', headline: 'SWIPE-TEST-9137 cover', body: 'swipe' },
        { kicker: 'Point 1', headline: 'First big idea', body: '' },
        { kicker: 'Point 2', headline: 'Second big idea', body: 'support' },
        { kicker: 'Point 3', headline: 'Third big idea', body: '' },
        { kicker: 'Point 4', headline: 'Fourth big idea', body: '' },
        { kicker: 'Close', headline: 'Teaser', body: '' },
      ], videoScript: null },
      { day: 'Day 3', platform: 'Instagram', contentType: 'Video Reel / Short', studio: 'Studio B', toolName: 'ToolX', hook: 'Hook C', caption: 'Cap C', hashtags: ['#C'], callToAction: 'CTA C', bestTime: '6:30 PM', imagePrompt: 'img', videoScript: { duration: '30s', audioVibe: 'beat', scenes: [{ sceneNumber: 1, time: '0:00 - 0:03', visualDirection: 'v', onScreenText: 't', voiceoverAudio: 'vo' }] } },
    ],
  };
  let lastMaxTokens = 0;
  postResponses = [
    () => empty200('MAX_TOKENS'),              // 1st: budget burned, empty text
    (body) => {                                 // 2nd: success — remember budget
      lastMaxTokens = body.generationConfig?.maxOutputTokens;
      return { status: 200, json: { candidates: [{ content: { parts: [{ text: JSON.stringify(goodCampaign) }] }, finishReason: 'STOP' }] } };
    },
  ];

  const websiteData = {
    url: 'https://testbrand.example', domain: 'testbrand.example',
    title: 'TestBrand — AI Platform', description: 'A test brand',
    studios: ['Studio A', 'Studio B'],
    discoveredTools: [{ name: 'ToolX', studio: 'Studio A', description: 'does X' }],
    h1s: ['H1'], capturedScreenshots: [], screenshotUrl: '',
  };
  const strategy = {
    brandName: 'TestBrand', industry: 'Tech & AI SaaS', brandTone: 'Bold',
    targetAudience: 'Devs', uniqueSellingPoint: 'Fast + private',
    recommendedBreakdown: { videoReels: 1, imagePosts: 2 },
    primaryPlatforms: ['Instagram'],
  };

  const posts = await ai.generateFullCampaign({
    websiteData, strategy, totalPosts: 3, days: 3,
    customPrompt: 'focus-test', carouselPrompt: 'CAROUSEL-PROMPT-TOKEN-42',
    selectedPlatforms: ['Instagram'], userApiKey: 'FAKE_KEY_B',
  });

  const posts2 = postLog.filter((p) => p.url.includes(':generateContent'));
  check('campaign recovered after MAX_TOKENS', Array.isArray(posts) && posts.length === 3, `${posts?.length}`);
  check('2 generateContent attempts only', posts2.length === 2, `got ${posts2.length}`);
  check('1st attempt used base budget 8192', posts2[0].body.generationConfig.maxOutputTokens === 8192, `${posts2[0].body.generationConfig.maxOutputTokens}`);
  check('2nd attempt DOUBLED budget to 16384', lastMaxTokens === 16384, `${lastMaxTokens}`);
  check('thinkingConfig present (2.5-flash)', posts2[0].body.generationConfig.thinkingConfig?.thinkingBudget === 0, 'missing');
  check('carousel post carries AI carouselContent', Array.isArray(posts[1].carouselContent) && posts[1].carouselContent.length === 6, JSON.stringify(posts[1].carouselContent?.slice(0, 1)));
  check('AI slide plan contains token', JSON.stringify(posts[1].carouselContent).includes('SWIPE-TEST-9137'), 'token missing');

  // buildCarouselSlides must prefer the AI plan
  const plan = car.buildCarouselSlides(posts[1], strategy, websiteData);
  check('buildCarouselSlides uses AI plan (6 slides)', plan.length === 6, `${plan.length}`);
  check('cover slide = AI cover headline', JSON.stringify(plan[0]).includes('SWIPE-TEST-9137'), JSON.stringify(plan[0]).slice(0, 80));
  check('slide 2 = AI point 1', plan[1].headline === 'First big idea', plan[1].headline);
}

// ========================================================================
section('C) carouselPrompt → Smart Engine template captions + slides (no key)');
postLog = [];
{
  const websiteData = {
    url: 'https://testbrand.example', domain: 'testbrand.example',
    title: 'TestBrand — AI Platform', description: 'A test brand',
    studios: ['Studio A', 'Studio B'],
    discoveredTools: [{ name: 'ToolX', studio: 'Studio A', description: 'does X' }],
    h1s: ['H1'], capturedScreenshots: [], screenshotUrl: '',
  };
  const strategy = {
    brandName: 'TestBrand', industry: 'Tech & AI SaaS', brandTone: 'Bold',
    targetAudience: 'Devs', uniqueSellingPoint: 'Fast + private',
    recommendedBreakdown: { videoReels: 1, imagePosts: 2 },
    primaryPlatforms: ['Instagram'],
  };
  const posts = await ai.generateFullCampaign({
    websiteData, strategy, totalPosts: 6, days: 6,
    customPrompt: '', carouselPrompt: 'CAROUSEL-PROMPT-TOKEN-77',
    selectedPlatforms: ['Instagram'], userApiKey: '', // Smart Engine path
  });
  const carousels = posts.filter((p) => p.contentType === 'Carousel Graphic');
  check('template campaign has carousel posts', carousels.length >= 1, `${carousels.length}`);
  const withToken = carousels.filter((p) => String(p.caption).includes('Carousel focus: CAROUSEL-PROMPT-TOKEN-77'));
  check('carousel captions carry the user prompt', withToken.length === carousels.length, `${withToken.length}/${carousels.length}`);
  const plan = car.buildCarouselSlides(withToken[0], strategy, websiteData);
  const planText = JSON.stringify(plan);
  check('carousel prompt surfaces in slide plan', planText.includes('CAROUSEL-PROMPT-TOKEN-77'), planText.slice(0, 120));
  check('slide plan is ALWAYS exactly 6 slides with CTA kept', plan.length === 6 && plan[5].kind === 'cta', `len=${plan.length} last=${plan[plan.length - 1]?.kind}`);
  const images = posts.filter((p) => p.contentType === 'Image Post');
  check('non-carousel captions do NOT get carousel focus', images.every((p) => !String(p.caption).includes('Carousel focus')), 'leaked');
  check('non-carousel posts carry no brief', images.every((p) => !p.carouselBrief), 'brief leaked');
  check('carousel posts carry carouselBrief for renderer', withToken.every((p) => p.carouselBrief === 'CAROUSEL-PROMPT-TOKEN-77'), 'brief missing');
}

// ========================================================================
section('D) thinkingConfig rejected → auto-retry WITHOUT thinking → SUCCESS');
postLog = [];
{
  postResponses = [
    () => genErr(400, 'Thinking config is not supported for this model.'),
    () => text200('OK'),
  ];
  const res = await ai.testGeminiKey('FAKE_KEY_D');
  const posts = postLog.filter((p) => p.url.includes(':generateContent'));
  check('key test succeeds after thinking rejection', res.ok === true, JSON.stringify(res));
  check('2 attempts (retry without thinking)', posts.length === 2, `got ${posts.length}`);
  check('1st had thinkingConfig', Boolean(posts[0].body.generationConfig.thinkingConfig), 'missing');
  check('2nd stripped thinkingConfig', posts[1].body.generationConfig.thinkingConfig === undefined, 'still present');
}

// ========================================================================
section('E) 429 forever → 3-model fleet cap → honest quota error');
postLog = [];
{
  postResponses = [];
  for (let i = 0; i < 10; i++) postResponses.push(() => genErr(429, 'Rate limited'));
  const t0 = Date.now();
  const res = await ai.testGeminiKey('FAKE_KEY_E');
  const elapsed = Date.now() - t0;
  const posts = postLog.filter((p) => p.url.includes(':generateContent'));
  check('fails honestly after exhausting retries', res.ok === false, JSON.stringify(res));
  check('error mentions 429 + auto-retried', /429/.test(res.error) && /auto-retried/i.test(res.error), res.error);
  check('walked exactly 3 models × 3 attempts = 9 calls (fleet cap)', posts.length === 9, `got ${posts.length}`);
  const modelsTried = [...new Set(posts.map((p) => p.url.match(/models\/([^:]+):/)?.[1]))];
  check('walked 3 DISTINCT models', modelsTried.length === 3, modelsTried.join(', '));
  console.log(`  ⏱ elapsed ${Math.round(elapsed / 1000)}s, models: ${modelsTried.join(' → ')}`);
}

// ========================================================================
section('F) STALE-MODEL 404 → Google names replacement → chain SELF-HEALS (live-bug repro)');
postLog = [];
{
  // Simulate a 2026 key whose ListModels only lists RETIRED models — the exact
  // user bug: "gemini-2.0-flash-lite is no longer available... use models/
  // gemini-3.5-flash-lite". The OLD code walked a hardcoded stale chain and
  // died; the new code extracts the suggested model from the 404 body.
  globalThis.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (method === 'GET') {
      return { ok: true, status: 200, json: async () => ({
        models: [
          { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.0-flash-lite', supportedGenerationMethods: ['generateContent'] },
        ],
      }) };
    }
    const body = JSON.parse(opts.body || '{}');
    postLog.push({ url, body });
    const model = String(url).match(/models\/([^:]+):generateContent/)?.[1] || '';
    if (model === 'gemini-3.5-flash-lite') {
      return { ok: true, status: 200, json: async () => ({
        candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
      }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: { code: 404, message: `This model models/${model} is no longer available. Please update your code to use models/gemini-3.5-flash-lite for the latest features.` } }) };
  };

  const res = await ai.testGeminiKey('FAKE_KEY_F');
  const posts = postLog.filter((p) => p.url.includes(':generateContent'));
  const modelsTried = posts.map((p) => p.url.match(/models\/([^:]+):/)?.[1]);
  check('call SUCCEEDS via Google-suggested model', res.ok === true, JSON.stringify(res));
  check('1st attempt = stale gemini-2.0-flash (discovery best)', modelsTried[0] === 'gemini-2.0-flash', modelsTried[0]);
  check('2nd attempt = gemini-3.5-flash-lite extracted from 404 body', modelsTried[1] === 'gemini-3.5-flash-lite', modelsTried[1]);
  check('only 2 attempts total (no wasted retries)', posts.length === 2, `got ${posts.length}`);
  console.log(`  chain: ${modelsTried.join(' → ')}`);
}

// ========================================================================
section('G) discovery-first — newest generation model picked BEFORE legacy names');
postLog = [];
{
  globalThis.fetch = async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (method === 'GET') {
      return { ok: true, status: 200, json: async () => ({
        models: [
          { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        ],
      }) };
    }
    const body = JSON.parse(opts.body || '{}');
    postLog.push({ url, body });
    return { ok: true, status: 200, json: async () => ({
      candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
    }) };
  };

  const res = await ai.testGeminiKey('FAKE_KEY_G');
  const posts = postLog.filter((p) => p.url.includes(':generateContent'));
  const firstModel = posts[0]?.url.match(/models\/([^:]+):/)?.[1] || '';
  check('key test succeeds', res.ok === true, JSON.stringify(res));
  check('first attempt = gemini-3.5-flash (newest, not 2.0 legacy)', firstModel === 'gemini-3.5-flash', firstModel);
  check('single attempt — no fallback churn', posts.length === 1, `got ${posts.length}`);
}

// ========================================================================
// NOTE: scenarios F & G reassign globalThis.fetch with stateful responders.
// Restore the queue-based stub for any future scenarios appended below.
globalThis.fetch = async (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase();
  if (method === 'GET') {
    return { ok: true, status: 200, json: async () => MODELS_OK };
  }
  const body = JSON.parse(opts.body || '{}');
  postLog.push({ url, body });
  const responder = postResponses.shift();
  if (!responder) throw new Error('fetch-stub: no more queued POST responses');
  const r = responder(body);
  return { ok: r.status === 200, status: r.status, json: async () => r.json };
};

rmSync(TMP, { recursive: true, force: true });
console.log(`\n========================================`);
console.log(`RESILIENCE E2E: ${pass} passed, ${fail} failed`);
console.log(`========================================`);
process.exit(fail ? 1 : 0);
