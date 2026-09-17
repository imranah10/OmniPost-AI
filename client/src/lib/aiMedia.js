/**
 * aiMedia.js — REAL AI media generation straight from the browser.
 *
 * Images : Gemini native image models (gemini-2.5-flash-image aka "nano banana",
 *          gemini-2.0-flash-preview-image-generation) with auto-discovery of any
 *          other image-capable model on the key, and an Imagen :predict fallback.
 * Videos : Google Veo via :predictLongRunning + operation polling (9:16 reel).
 *
 * Design rules (learned from the 404 saga):
 *  • NEVER trust a hardcoded model name — discover + walk a chain on 404.
 *  • If Google's 404 names a replacement model, queue it next (self-heal).
 *  • 429/503 → backoff + retry, then next model. Honest errors otherwise.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const IMAGE_CHAIN = [
  'gemini-2.5-flash-image',                    // nano-banana — best quality, free tier
  'gemini-2.0-flash-preview-image-generation', // widely available free fallback
  'gemini-2.5-flash-image-preview',
];
const VEO_CHAIN = [
  'veo-3.0-fast-generate-001',
  'veo-3.0-generate-001',
  'veo-2.0-generate-001',
];

/** Discover image-capable models ON THIS KEY (self-healing chain). */
async function listImageModels(apiKey, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`, { signal: ctrl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.models || [])
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((n) => /image/i.test(n) && !/embedding|aqa|tts|veo|audio|live/i.test(n))
      .filter((n) => {
        const m = (data?.models || []).find((x) => String(x.name || '').replace(/^models\//, '') === n);
        return m?.supportedGenerationMethods?.includes('generateContent');
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function extractSuggestedModel(rawDetail) {
  const msg = String(rawDetail || '');
  const named = msg.match(/use\s+models\/([a-z0-9][a-z0-9.\-]+)/i)?.[1];
  if (named && !/imagen|veo|embedding|tts/i.test(named)) return named;
  for (const hit of msg.matchAll(/models\/([a-z0-9][a-z0-9.\-]+)/gi)) {
    if (hit[1] && !/imagen|veo|embedding|tts/i.test(hit[1])) return hit[1];
  }
  return '';
}

function friendlyImageError(status, detail, model) {
  const d = String(detail || '');
  if (status === 400 && /api key not valid|api_key_invalid/i.test(d)) {
    return 'Invalid Gemini API key — check it in Settings (⚙️)';
  }
  if (status === 403) return `Gemini rejected image generation (403)${d ? `: ${d.slice(0, 160)}` : ''} — key may be referrer-restricted`;
  if (status === 404) return `Image model "${model}" not available for this key (404) — trying other models…`;
  if (status === 429) {
    if (/billing|billed/i.test(d)) return 'Image generation needs a billed Gemini key for this model — free-tier image quota model unavailable. Try again tomorrow or add a billed key';
    return 'Image quota hit (429) — free tier allows a limited number of images per day. Wait a minute and retry, or use a fresh key';
  }
  if (status === 500 || status === 503) return `Gemini image servers busy (${status}) — try again in a moment`;
  if (/safety|blocked|prohibited/i.test(d)) return 'Prompt blocked by safety filters — soften the wording and retry';
  return `Image generation failed (${status})${d ? `: ${d.slice(0, 160)}` : ''}`;
}

/** One :generateContent attempt against a native image model. */
async function imageViaGenerateContent(apiKey, model, prompt, aspectRatio, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const supportsImageConfig = /2\.5-flash-image/.test(model); // 2.0 preview rejects imageConfig
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(supportsImageConfig ? { imageConfig: { aspectRatio } } : {}),
      },
    };
    const res = await fetch(`${BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error?.message || ''; } catch { /* keep empty */ }
      const err = new Error(friendlyImageError(res.status, detail, model));
      err.geminiStatus = res.status;
      err.detail = detail;
      if (res.status === 404) err.modelNotFound = true;
      if (res.status === 429 || res.status === 500 || res.status === 503) err.retryable = true;
      if (res.status === 400 && /imageConfig|aspect/i.test(detail)) err.badImageConfig = true;
      throw err;
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      const inline = p.inlineData || p.inline_data;
      const mime = inline?.mimeType || inline?.mime_type || '';
      if (inline?.data && String(mime).startsWith('image/')) {
        return { dataUrl: `data:${mime};base64,${inline.data}`, mime, model };
      }
    }
    const block = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    if (block && /safety|prohibited|blocked/i.test(block)) {
      throw new Error('Prompt blocked by safety filters — soften the wording and retry');
    }
    const err = new Error('Gemini returned no image data — retrying with another model');
    err.retryable = true;
    throw err;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Image generation timed out — network slow, try again');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Imagen fallback — separate :predict surface (often paid-tier). */
async function imageViaImagen(apiKey, model, prompt, aspectRatio, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/models/${model}:predict?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio },
      }),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error?.message || ''; } catch { /* keep empty */ }
      const err = new Error(friendlyImageError(res.status, detail, model));
      err.geminiStatus = res.status;
      err.detail = detail;
      err.modelNotFound = res.status === 404;
      err.retryable = res.status === 429 || res.status === 500 || res.status === 503;
      throw err;
    }
    const data = await res.json();
    const pred = (data?.predictions || [])[0];
    const b64 = pred?.bytesBase64Encoded;
    const mime = pred?.mimeType || 'image/png';
    if (b64) return { dataUrl: `data:${mime};base64,${b64}`, mime, model };
    throw new Error('Imagen returned no image data');
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Image generation timed out — try again');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate ONE image with the user's Gemini key.
 * Returns { dataUrl, mime, model }. Throws honest, human errors.
 */
export async function generateAIImage({ apiKey, prompt, aspectRatio = '1:1', onStatus }) {
  if (!apiKey) throw new Error('no-gemini-key');
  const say = (s) => { try { onStatus?.(s); } catch { /* noop */ } };

  // Self-healing queue: static chain + whatever image models THIS key exposes.
  const discovered = await listImageModels(apiKey);
  const queue = [];
  const push = (m) => { if (m && !queue.includes(m)) queue.push(m); };
  IMAGE_CHAIN.forEach(push);
  discovered.forEach(push);
  if (!queue.length) throw new Error('No Gemini image model available for this key');

  const imagenFallbacks = ['imagen-4.0-fast-generate-001', 'imagen-3.0-generate-002'];
  let lastErr;
  for (const model of queue.slice(0, 5)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        say(`Painting with ${model}…`);
        return await imageViaGenerateContent(apiKey, model, prompt, aspectRatio);
      } catch (err) {
        lastErr = err;
        if (err.badImageConfig && !attempt) {
          // retry same model without imageConfig
          try {
            const body = {
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            };
            const res = await fetch(`${BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (res.ok) {
              const data = await res.json();
              const parts = data?.candidates?.[0]?.content?.parts || [];
              let done = null;
              for (const p of parts) {
                const inline = p.inlineData || p.inline_data;
                const mime = inline?.mimeType || inline?.mime_type || '';
                if (inline?.data && String(mime).startsWith('image/')) done = { dataUrl: `data:${mime};base64,${inline.data}`, mime, model };
              }
              if (done) return done;
            }
          } catch { /* fall through to chain */ }
          break;
        }
        if (err.modelNotFound) {
          const sug = extractSuggestedModel(err.detail);
          if (sug && !queue.includes(sug)) queue.unshift(sug);
          break; // next model
        }
        if (!err.retryable || attempt === 1) break;
        await sleep(1400 * (attempt + 1));
      }
    }
    if (lastErr && !lastErr.modelNotFound && !lastErr.retryable) break; // fatal
  }

  // Final chance: Imagen predict surface (often paid-tier — last resort)
  for (const model of imagenFallbacks) {
    try {
      say(`Trying ${model}…`);
      return await imageViaImagen(apiKey, model, prompt, aspectRatio);
    } catch (err) {
      lastErr = err;
      if (err.modelNotFound) continue;
      break;
    }
  }
  throw lastErr || new Error('Image generation failed — try again in a moment');
}

function friendlyVeoError(status, detail) {
  const d = String(detail || '');
  if (/billing|billed|paid/i.test(d) || status === 403) {
    return 'Veo AI video needs a BILLED Gemini key (Google charges per second of video) — free keys can render images but not video. Add billing in Google AI Studio, or use the built-in Reel renderer (free) instead';
  }
  if (status === 404) return 'This Veo model is not available for your key/region — trying others…';
  if (status === 429) return 'Veo quota exhausted (429) — video generation is strictly rate-limited. Try again later';
  if (status === 400 && /api key not valid/i.test(d)) return 'Invalid Gemini API key — check it in Settings (⚙️)';
  return `Veo video failed (${status})${d ? `: ${d.slice(0, 160)}` : ''}`;
}

function extractVideoUri(operation) {
  const r = operation?.response || {};
  const samples = r.generateVideoResponse?.generatedSamples || r.generatedVideos || r.videos || [];
  const first = samples[0];
  return first?.video?.uri || first?.video?.videoUri || first?.uri || '';
}

/**
 * Generate ONE 8s 9:16 video with Google Veo (predictLongRunning + polling).
 * Returns { dataUrl, model, bytes }. Honest errors — free keys get a clear
 * "Veo needs a billed key" message instead of a generic failure.
 */
export async function generateAIVideo({ apiKey, prompt, aspectRatio = '9:16', durationSeconds = 8, onStatus, maxWaitMs = 300000 }) {
  if (!apiKey) throw new Error('no-gemini-key');
  const say = (s) => { try { onStatus?.(s); } catch { /* noop */ } };

  const queue = [];
  const push = (m) => { if (m && !queue.includes(m)) queue.push(m); };
  VEO_CHAIN.forEach(push);

  let lastErr;
  for (const model of queue) {
    try {
      say(`Submitting to ${model}…`);
      const started = await fetch(`${BASE}/models/${model}:predictLongRunning?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { aspectRatio, durationSeconds, personGeneration: 'allow_adult' },
        }),
      });
      if (!started.ok) {
        let detail = '';
        try { detail = (await started.json())?.error?.message || ''; } catch { /* keep empty */ }
        const err = new Error(friendlyVeoError(started.status, detail));
        err.geminiStatus = started.status;
        err.detail = detail;
        err.modelNotFound = started.status === 404;
        if (started.status === 404) continue; // next Veo model
        if (/billing|billed|paid/i.test(detail) || started.status === 403) throw err; // billing won't fix itself
        if (started.status === 429 || started.status === 500 || started.status === 503) { lastErr = err; continue; }
        throw err;
      }
      const { name: opName } = await started.json();
      if (!opName) throw new Error('Veo did not return an operation — try again');

      // Poll the operation
      const t0 = Date.now();
      let uri = '';
      say('Veo is rendering your reel… (~1-2 min)');
      while (Date.now() - t0 < maxWaitMs) {
        await sleep(10000);
        const poll = await fetch(`${BASE}/${opName}?key=${encodeURIComponent(apiKey)}`);
        if (!poll.ok) {
          let detail = '';
          try { detail = (await poll.json())?.error?.message || ''; } catch { /* keep empty */ }
          throw new Error(friendlyVeoError(poll.status, detail));
        }
        const op = await poll.json();
        if (op.error) throw new Error(friendlyVeoError(500, op.error.message));
        if (op.done) {
          uri = extractVideoUri(op);
          if (!uri) {
            const rf = op.response?.generateVideoResponse?.raiMediaFilteredReasons?.[0]
              || op.response?.raiMediaFilteredReasons?.[0];
            throw new Error(rf
              ? `Veo blocked this prompt for safety (${String(rf).slice(0, 120)}) — tweak the wording and retry`
              : 'Veo finished but returned no video — try again');
          }
          break;
        }
        say('Veo is still rendering… frames composing');
      }
      if (!uri) throw new Error('Veo render timed out after 5 minutes — try again (renders usually take 1-2 min)');

      say('Downloading video…');
      const dl = await fetch(`${uri}${uri.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`);
      if (!dl.ok) throw new Error(`Video download failed (${dl.status}) — try again`);
      const blob = await dl.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('Could not encode video'));
        fr.readAsDataURL(blob);
      });
      return { dataUrl, model, bytes: blob.size, mime: blob.type || 'video/mp4' };
    } catch (err) {
      lastErr = err;
      if (err.modelNotFound) continue;
      throw err;
    }
  }
  throw lastErr || new Error('No Veo model available for this key — AI video needs a billed Gemini key');
}

/** Strip the "PROMPT FOR …" header block from a copy-paste prompt (safe cleanup). */
export function cleanPrompt(p = '') {
  return String(p)
    .replace(/^PROMPT FOR[^\n]*\n+/i, '')
    .replace(/^\([^)]*TIP[^)]*\)\s*\n+/i, '')
    .trim();
}
