/**
 * creatives.js — Client-side marketing image generation.
 *
 * 1. rawAiUrl  — real AI artwork via Pollinations (Flux), FREE & key-less
 * 2. branded card — the AI artwork composited with brand typography
 *    (hook, CTA, domain, studio badge) on a browser canvas → PNG
 */

export function pollinationsUrl(prompt, { w = 1080, h = 1350, model = 'flux', seed } = {}) {
  const clean = String(prompt).replace(/\s+/g, ' ').slice(0, 320);
  const s = seed ?? Math.floor(Math.random() * 999999);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}?model=${model}&width=${w}&height=${h}&nologo=true&seed=${s}`;
}

export function shortVisualPrompt(post, strategy) {
  // Pollinations works best with a tight visual brief, not the full agency prompt
  const style = 'photorealistic commercial advertising hero visual, ultra modern enterprise aesthetic, glassmorphic 3D UI panels, cinematic studio lighting, 8k, high dynamic range';
  return `${post.hook || post.toolName} — ${post.toolName || strategy.brandName} showcase for ${strategy.brandName} (${strategy.industry}). ${style}`;
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Branded 1080x1350 card: full-bleed AI art + gradient scrim + brand row +
 * hook + CTA + domain pill + studio badge. Pure canvas — no server needed.
 */
export async function renderBrandedCard({ aiImageUrl, palette = [], brand, hook, sub, domain, studioName, toolName }) {
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background
  const g0 = ctx.createLinearGradient(0, 0, W, H);
  g0.addColorStop(0, '#0b0f1a');
  g0.addColorStop(1, '#141b2e');
  ctx.fillStyle = g0;
  ctx.fillRect(0, 0, W, H);

  // AI art full-bleed
  try {
    const art = await loadImageEl(aiImageUrl);
    const r = Math.max(W / art.naturalWidth, (H - 220) / art.naturalHeight);
    const aw = art.naturalWidth * r, ah = art.naturalHeight * r;
    ctx.drawImage(art, (W - aw) / 2, 40 + ((H - 220) - ah) / 2, aw, ah);
  } catch {
    /* gradient-only fallback */
  }

  // Bottom scrim
  const g1 = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g1.addColorStop(0, 'rgba(5,8,16,0)');
  g1.addColorStop(1, 'rgba(5,8,16,0.94)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  const accent = palette[0] || '#6366f1';
  const accent2 = palette[1] || '#a855f7';

  // Top badge
  ctx.font = '700 26px system-ui, sans-serif';
  const badge = (studioName || 'FEATURED SHOWCASE').toUpperCase();
  const bw = ctx.measureText(badge).width + 44;
  ctx.fillStyle = hexA(accent, 0.22);
  roundRect(ctx, 48, 48, bw, 52, 26);
  ctx.fill();
  ctx.strokeStyle = hexA(accent, 0.6);
  ctx.lineWidth = 2;
  roundRect(ctx, 48, 48, bw, 52, 26);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(badge, 70, 82);

  // Brand row
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(brand, 48, H - 300);

  // Hook (up to 3 lines)
  ctx.font = '800 64px system-ui, sans-serif';
  const hookLines = wrap(ctx, hook || '', W - 96).slice(0, 3);
  let y = H - 232;
  for (const line of hookLines) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, 48, y);
    y += 74;
  }

  // Sub / CTA
  ctx.font = '500 34px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  const subLines = wrap(ctx, sub || '', W - 96).slice(0, 2);
  let sy = y - 60;
  for (const line of subLines) {
    ctx.fillText(line, 48, sy);
    sy += 46;
  }

  // Domain pill
  ctx.font = '700 32px system-ui, sans-serif';
  const pill = `Try now → ${domain}`;
  const pw = ctx.measureText(pill).width + 48;
  const pg = ctx.createLinearGradient(48, H - 84, 48 + pw, H - 84);
  pg.addColorStop(0, accent);
  pg.addColorStop(1, accent2);
  ctx.fillStyle = pg;
  roundRect(ctx, 48, H - 118, pw, 60, 30);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(pill, 72, H - 78);

  // Tool watermark
  if (toolName) {
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'right';
    ctx.fillText(toolName, W - 48, H - 76);
    ctx.textAlign = 'left';
  }

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
}

/**
 * Full pipeline for one post:
 *  - raw AI artwork fetched with retries (blob → objectURL for display & ZIP)
 *  - branded card canvas → dataURL
 *
 * Pollinations rate-limits bursts, so the caller generates posts SEQUENTIALLY
 * and each art fetch retries through the proxy chain (same-origin first).
 */
async function fetchArtWithRetry(url, { tries = 3, timeout = 90000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const { proxyImageBlob } = await import('./net.js');
    const blob = await proxyImageBlob(url, { timeout });
    if (blob) return blob;
    await new Promise((r) => setTimeout(r, 4000 + i * 6000));
  }
  return null;
}

export async function generatePostCreatives({ post, strategy, websiteData, index, onProgress = () => {} }) {
  const visual = shortVisualPrompt(post, strategy);
  const rawUrl = pollinationsUrl(visual, { seed: 1000 + index * 37 });
  onProgress({ index, step: 'ai-art' });

  const rawBlob = await fetchArtWithRetry(rawUrl);
  const rawObjectUrl = rawBlob ? URL.createObjectURL(rawBlob) : null;

  let card = null;
  let cardDataUrl = null;
  try {
    onProgress({ index, step: 'brand-card' });
    card = await renderBrandedCard({
      aiImageUrl: rawObjectUrl || rawUrl,
      palette: websiteData.palette || [],
      brand: strategy.brandName,
      hook: post.hook,
      sub: post.callToAction,
      domain: websiteData.domain,
      studioName: post.studio,
      toolName: post.toolName,
    });
    if (card) cardDataUrl = card.toDataURL('image/png');
  } catch {
    card = null;
  }

  return { rawAiUrl: rawUrl, rawBlob, rawObjectUrl, cardDataUrl };
}
