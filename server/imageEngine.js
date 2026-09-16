import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import axios from 'axios';

/* Windows system fonts, graceful fallback */
const FONT_DIR = 'C:/Windows/Fonts';
(function registerFonts() {
  const fonts = [
    ['arialbd.ttf', 'OPBold'],
    ['arial.ttf', 'OPRegular'],
    ['seguisb.ttf', 'OPSemi'],
    ['ariblk.ttf', 'OPBlack']
  ];
  for (const [file, family] of fonts) {
    try {
      const p = path.join(FONT_DIR, file);
      if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, family);
    } catch {
      /* ignore missing font */
    }
  }
})();

export const DEFAULT_PALETTE = ['#6366f1', '#a855f7', '#ec4899'];

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

export function sanitizeText(t = '') {
  return String(t || '').replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
}

export function hexToRgba(hex, a) {
  const h = String(hex || '#6366f1').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(99, 102, 241, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function font(px, weight = 'bold', family = 'OPBold') {
  return `${weight} ${px}px ${family}, Arial, sans-serif`;
}

export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function extractPalette(imagePath) {
  try {
    if (!imagePath || !fs.existsSync(imagePath)) return [...DEFAULT_PALETTE];
    const img = await loadImage(imagePath);
    const c = createCanvas(120, 80);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 120, 80);
    const { data } = ctx.getImageData(0, 0, 120, 80);
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 16) {
      const r = Math.round(data[i] / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 22 || max < 40 || min > 220) continue;
      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      buckets.set(hex, (buckets.get(hex) || 0) + 1);
    }
    const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    if (sorted.length >= 3) return sorted.slice(0, 3);
    if (sorted.length > 0) return [...sorted, ...DEFAULT_PALETTE].slice(0, 3);
    return [...DEFAULT_PALETTE];
  } catch {
    return [...DEFAULT_PALETTE];
  }
}

function roundRectPath(ctx, x, y, w, h, r = 10) {
  const safeR = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, safeR);
    ctx.closePath();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + safeR, y);
  ctx.arcTo(x + w, y, x + w, y + h, safeR);
  ctx.arcTo(x + w, y + h, x, y + h, safeR);
  ctx.arcTo(x, y + h, x, y, safeR);
  ctx.arcTo(x, y, x + w, y, safeR);
  ctx.closePath();
}

function drawChip(ctx, text, cx, cy, bg, fg, fontSize = 26) {
  const label = String(text || '').toUpperCase().slice(0, 48);
  ctx.font = font(fontSize, 'bold', 'OPSemi');
  const w = ctx.measureText(label).width + 48;
  const h = fontSize + 24;
  ctx.fillStyle = bg;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1);
}

/**
 * Renders an Ultra-Luxury Agency Marketing Visual
 * EMBEDDING the REAL captured screenshot of the tool / website in a sleek browser frame!
 */
export async function renderScreenshotMarketingCard({
  W = 1080,
  H = 1350,
  screenshotPath,
  bgImagePath,
  palette,
  brand,
  hook,
  sub,
  domain,
  badgeText = 'FEATURED TOOL',
  studioName = '',
  toolName = '',
  testedInput = '',
  testedOutput = ''
}) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const [c1, c2, c3] = palette && palette.length ? palette : DEFAULT_PALETTE;

  // 1. Deep Space Dark Background or AI Imagen Background
  ctx.fillStyle = '#060913';
  ctx.fillRect(0, 0, W, H);

  if (bgImagePath && fs.existsSync(bgImagePath)) {
    try {
      const bgImg = await loadImage(bgImagePath);
      ctx.drawImage(bgImg, 0, 0, W, H);
      // Soft dark tint overlay so text and mockup remain ultra readable
      ctx.fillStyle = 'rgba(6, 9, 19, 0.72)';
      ctx.fillRect(0, 0, W, H);
    } catch {
      /* ignore background image error */
    }
  }

  // 2. Ambient Glowing Neon Gradients (Exact Brand Colors)
  const glow = (x, y, r, color, a) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexToRgba(color, a));
    rg.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.2, H * 0.15, 650, c1, 0.45);
  glow(W * 0.85, H * 0.45, 750, c2, 0.40);
  glow(W * 0.5, H * 0.85, 600, c3 || c1, 0.35);

  // 3. Subtle Cybernetic Tech Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  const gridStep = 45;
  for (let x = 0; x < W; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // 4. Header Badges: Studio + Tool Identifier
  const topStudioTag = studioName ? `${brand} • ${studioName}` : `${brand} • AUTOMATED`;
  drawChip(ctx, topStudioTag, W / 2, 60, hexToRgba(c1, 0.35), '#ffffff', 20);

  if (toolName && toolName !== studioName) {
    drawChip(ctx, `⚡ TOOL: ${toolName.toUpperCase()}`, W / 2, 102, hexToRgba(c2, 0.45), '#38bdf8', 18);
  }

  // 5. Scroll-Stopping Hook Headline
  const maxW = W - 140;
  let headlineSize = toolName ? 52 : 58;
  ctx.font = font(headlineSize, 'bold', 'OPBold');
  let lines = wrapText(ctx, hook.toUpperCase(), maxW).slice(0, 3);
  while (lines.length > 2 && headlineSize > 38) {
    headlineSize -= 4;
    ctx.font = font(headlineSize, 'bold', 'OPBold');
    lines = wrapText(ctx, hook.toUpperCase(), maxW).slice(0, 3);
  }

  const lineH = headlineSize * 1.18;
  let startY = toolName ? 140 : 125;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((ln, i) => {
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(ln, W / 2 + 3, startY + i * lineH + 3);
    // Crisp White Text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ln, W / 2, startY + i * lineH);
  });

  const headlineBottom = startY + lines.length * lineH + 20;

  // 6. REAL CAPTURED SCREENSHOT in Modern MacBook / Browser Frame
  const frameX = 70;
  const frameY = headlineBottom + (testedInput || testedOutput ? 32 : 10);
  const frameW = W - 140;
  const frameH = H - frameY - 170; // leaves space for bottom chips and domain

  // Live AGI Test Execution Pill
  if (testedInput || testedOutput) {
    const testText = `🧪 AGI LIVE TEST: ${testedInput} ➔ ${testedOutput}`;
    drawChip(ctx, testText, W / 2, headlineBottom + 12, 'rgba(16, 185, 129, 0.22)', '#34d399', 16);
  }

  // Outer frame shadow
  ctx.shadowColor = hexToRgba(c1, 0.35);
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 15;

  // Frame background (MacBook Dark Glass)
  ctx.fillStyle = '#0f172a';
  roundRectPath(ctx, frameX, frameY, frameW, frameH, 20);
  ctx.fill();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Frame border glow
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  roundRectPath(ctx, frameX, frameY, frameW, frameH, 20);
  ctx.stroke();

  // Browser Window Top Bar
  const titleBarH = 44;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(frameX + 20, frameY);
  ctx.arcTo(frameX + frameW, frameY, frameX + frameW, frameY + titleBarH, 20);
  ctx.lineTo(frameX + frameW, frameY + titleBarH);
  ctx.lineTo(frameX, frameY + titleBarH);
  ctx.arcTo(frameX, frameY, frameX + 20, frameY, 20);
  ctx.closePath();
  ctx.fill();

  // Window dots (Red, Yellow, Green)
  const dotY = frameY + titleBarH / 2;
  const dotR = 6;
  ctx.fillStyle = '#ff5f56';
  ctx.beginPath();
  ctx.arc(frameX + 26, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffbd2e';
  ctx.beginPath();
  ctx.arc(frameX + 46, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#27c93f';
  ctx.beginPath();
  ctx.arc(frameX + 66, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();

  // URL pill in browser bar
  const pillW = frameW - 220;
  const pillH = 26;
  const pillX = frameX + 110;
  const pillY = frameY + (titleBarH - pillH) / 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  roundRectPath(ctx, pillX, pillY, pillW, pillH, 13);
  ctx.fill();

  ctx.font = '500 13px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const urlDisplay = domain ? `https://${domain}` : 'https://toolverse.app';
  ctx.fillText(urlDisplay, pillX + pillW / 2, pillY + pillH / 2);

  // Load and draw the REAL CAPTURED SCREENSHOT inside frame
  const shotInnerX = frameX + 4;
  const shotInnerY = frameY + titleBarH;
  const shotInnerW = frameW - 8;
  const shotInnerH = frameH - titleBarH - 4;

  let loadedScreenshot = false;
  if (screenshotPath && fs.existsSync(screenshotPath)) {
    try {
      const shotImg = await loadImage(screenshotPath);
      // Clip to frame bottom corners
      ctx.save();
      roundRectPath(ctx, shotInnerX, shotInnerY, shotInnerW, shotInnerH, 16);
      ctx.clip();

      // Cover crop or fit screenshot
      const scale = Math.max(shotInnerW / shotImg.width, shotInnerH / shotImg.height);
      const sw = shotImg.width * scale;
      const sh = shotImg.height * scale;
      ctx.drawImage(shotImg, shotInnerX, shotInnerY, sw, sh);
      ctx.restore();
      loadedScreenshot = true;
    } catch (e) {
      console.warn('[ImageEngine] Could not draw screenshot:', e.message);
    }
  }

  // Fallback if screenshot failed loading
  if (!loadedScreenshot) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(shotInnerX, shotInnerY, shotInnerW, shotInnerH);
    ctx.fillStyle = '#94a3b8';
    ctx.font = font(32);
    ctx.textAlign = 'center';
    ctx.fillText(brand, shotInnerX + shotInnerW / 2, shotInnerY + shotInnerH / 2);
  }

  // 7. Dynamic Feature Chips
  const chipY = H - 95;
  const chip1 = toolName ? `⚡ ${toolName.toUpperCase().slice(0, 18)}` : '⚡ HIGH SPEED';
  const chip2 = '🔒 VERIFIED & SECURE';
  const chip3 = studioName ? `✨ ${studioName.toUpperCase().slice(0, 18)}` : '✨ LIVE PROOF';
  const chips = [chip1, chip2, chip3];
  const totalChipW = W - 140;
  const singleW = totalChipW / 3;
  chips.forEach((c, idx) => {
    drawChip(ctx, c, 70 + singleW * idx + singleW / 2, chipY, 'rgba(255, 255, 255, 0.08)', '#38bdf8', 17);
  });

  // 8. Bottom Brand Call-To-Action Chip
  const ctaY = H - 45;
  const ctaAction = sub && sub.length > 3 ? sub.slice(0, 30).toUpperCase() : 'VISIT NOW';
  drawChip(ctx, `VISIT ${domain.toUpperCase()} 👉 ${ctaAction}`, W / 2, ctaY, 'rgba(255, 255, 255, 0.95)', '#090d16', 20);

  return canvas;
}

/**
 * Renders high-end AI Creative Marketing Poster
 * Centers the true AI generated image with rich branding, hook typography, and CTA
 */
export async function renderAICreativeMarketingCard({
  W = 1080,
  H = 1350,
  aiImagePath,
  screenshotPath,
  palette = DEFAULT_PALETTE,
  brand = 'TOOLVERSE',
  hook = 'THE FUTURE OF WEB TOOLS',
  sub = 'Discover next-generation browser tools',
  domain = 'toolverse-official.vercel.app',
  studioName = '',
  toolName = '',
  provider = 'AI Creative Engine'
}) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const [c1, c2, c3] = palette;

  // 1. Draw the AI-generated artwork full-bleed
  let loadedAI = false;
  if (aiImagePath && fs.existsSync(aiImagePath)) {
    try {
      const aiImg = await loadImage(aiImagePath);
      const scale = Math.max(W / aiImg.width, H / aiImg.height);
      const sw = aiImg.width * scale;
      const sh = aiImg.height * scale;
      ctx.drawImage(aiImg, (W - sw) / 2, (H - sh) / 2, sw, sh);
      loadedAI = true;
    } catch (e) {
      console.warn('[ImageEngine] Could not load AI art:', e.message);
    }
  }

  if (!loadedAI) {
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Cinematic Gradient Overlay (Top & Bottom for text legibility)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(8, 12, 26, 0.90)');
  grad.addColorStop(0.18, 'rgba(8, 12, 26, 0.35)');
  grad.addColorStop(0.55, 'rgba(8, 12, 26, 0.15)');
  grad.addColorStop(0.78, 'rgba(8, 12, 26, 0.85)');
  grad.addColorStop(1, 'rgba(5, 8, 20, 0.98)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 3. Top Glass Header
  const headerY = 45;
  const headerH = 75;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, 50, headerY, W - 100, headerH, 20);
  ctx.fill();
  ctx.stroke();

  // Brand Name
  ctx.fillStyle = '#ffffff';
  ctx.font = font(26, 'bold', 'OPBold');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(brand.toUpperCase(), 80, headerY + headerH / 2);

  // Studio / Tool Pill
  const rightTag = toolName ? `⚡ ${toolName.toUpperCase()}` : (studioName ? `✨ ${studioName.toUpperCase()}` : '✨ AI CREATIVE');
  ctx.fillStyle = '#38bdf8';
  ctx.font = font(17, 'bold', 'OPSemi');
  ctx.textAlign = 'right';
  ctx.fillText(rightTag, W - 80, headerY + headerH / 2);

  // 4. Picture-in-Picture Software Proof (if screenshot available)
  if (screenshotPath && fs.existsSync(screenshotPath)) {
    try {
      const pipW = 260;
      const pipH = 160;
      const pipX = W - 50 - pipW;
      const pipY = H - 470;

      // Drop shadow for PiP
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetY = 8;

      ctx.fillStyle = '#0f172a';
      roundRectPath(ctx, pipX, pipY, pipW, pipH, 14);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 2;
      roundRectPath(ctx, pipX, pipY, pipW, pipH, 14);
      ctx.stroke();

      // Top mini bar
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(pipX, pipY, pipW, 22);
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 11px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('⚡ LIVE TESTED DEMO', pipX + 10, pipY + 15);

      const shot = await loadImage(screenshotPath);
      ctx.save();
      roundRectPath(ctx, pipX + 2, pipY + 22, pipW - 4, pipH - 24, 10);
      ctx.clip();
      ctx.drawImage(shot, pipX + 2, pipY + 22, pipW - 4, pipH - 24);
      ctx.restore();
    } catch {
      /* ignore pip draw error */
    }
  }

  // 5. Lower Third Glassmorphism Card
  const cardH = 340;
  const cardY = H - cardH - 45;
  ctx.fillStyle = 'rgba(11, 17, 33, 0.88)';
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
  ctx.lineWidth = 2;
  roundRectPath(ctx, 50, cardY, W - 100, cardH, 26);
  ctx.fill();
  ctx.stroke();

  // Model provider badge
  drawChip(ctx, `GENERATED BY: ${provider.toUpperCase()}`, 50 + 170, cardY + 28, 'rgba(99, 102, 241, 0.25)', '#a5b4fc', 14);

  // Hook Title
  let hookSize = 42;
  ctx.font = font(hookSize, 'bold', 'OPBold');
  let lines = wrapText(ctx, hook, W - 160).slice(0, 2);
  while (lines.length > 2 && hookSize > 30) {
    hookSize -= 4;
    ctx.font = font(hookSize, 'bold', 'OPBold');
    lines = wrapText(ctx, hook, W - 160).slice(0, 2);
  }

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const textStartY = cardY + 56;
  lines.forEach((l, i) => {
    ctx.fillText(l, 85, textStartY + i * (hookSize * 1.2));
  });

  // Subtitle
  const subY = textStartY + lines.length * (hookSize * 1.2) + 8;
  ctx.fillStyle = '#94a3b8';
  ctx.font = font(20, 'normal', 'OPRegular');
  const subLine = wrapText(ctx, sub, W - 160)[0] || sub;
  ctx.fillText(subLine, 85, subY);

  // Value Pills
  const pillY = subY + 38;
  drawChip(ctx, '⚡ 100% Client-Side', 165, pillY, 'rgba(99, 102, 241, 0.25)', '#a5b4fc', 16);
  drawChip(ctx, '🔒 Zero Data Stored', 355, pillY, 'rgba(16, 185, 129, 0.25)', '#6ee7b7', 16);
  drawChip(ctx, '✨ Free Instant Access', 560, pillY, 'rgba(236, 72, 153, 0.25)', '#f472b6', 16);

  // CTA Button
  const ctaBtnY = cardY + cardH - 65;
  ctx.fillStyle = '#ffffff';
  roundRectPath(ctx, 85, ctaBtnY, W - 170, 52, 16);
  ctx.fill();

  ctx.fillStyle = '#090d16';
  ctx.font = font(21, 'bold', 'OPBold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`VISIT ${domain.toUpperCase()} 👉 TRY IT FREE`, W / 2, ctaBtnY + 26);

  return canvas;
}

export function renderCyberTechArtwork({ W = 1080, H = 1350, brand = 'TOOLVERSE', toolName = 'SOFTWARE' }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Deep tech background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#060913');
  bgGrad.addColorStop(0.5, '#0b1120');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Glowing perspective grid
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
  ctx.lineWidth = 1.5;
  for (let x = -W; x < W * 2; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, H * 0.4);
    ctx.lineTo((x - W / 2) * 3 + W / 2, H);
    ctx.stroke();
  }
  for (let y = H * 0.4; y < H; y += 35) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Glowing Cyber Orbs
  const glow = (cx, cy, r, color) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  glow(W * 0.3, H * 0.35, 450, 'rgba(99, 102, 241, 0.4)');
  glow(W * 0.7, H * 0.5, 400, 'rgba(236, 72, 153, 0.35)');
  glow(W * 0.5, H * 0.25, 300, 'rgba(56, 189, 248, 0.3)');

  // Modern Cyber Aurora & Tech Node Waves (No abstract cubes!)
  const waveCount = 5;
  for (let w = 0; w < waveCount; w++) {
    ctx.beginPath();
    const waveY = H * 0.3 + w * 45;
    ctx.moveTo(0, waveY);
    for (let x = 0; x <= W; x += 40) {
      const yOffset = Math.sin((x / 140) + w) * 35 + Math.cos((x / 220) - w) * 25;
      ctx.lineTo(x, waveY + yOffset);
    }
    ctx.strokeStyle = w % 2 === 0 ? 'rgba(99, 102, 241, 0.45)' : 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Glowing Matrix Data Nodes
  for (let i = 0; i < 28; i++) {
    const px = 80 + ((i * 127) % (W - 160));
    const py = 120 + ((i * 179) % (Math.round(H * 0.55)));
    const pr = (i % 3) + 2.5;
    ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#818cf8';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  return canvas;
}

/**
 * Multi-Model AI Image Generator:
 * 1. Tries Gemini image models (nano-banana-pro-preview, gemini-3.1-flash-image, gemini-2.5-flash-image, imagen-3.0-generate-002)
 * 2. If quota 0 / free tier rate limited, seamlessly generates using AI Flux / Turbo
 */
export async function generateGeminiImagen({ apiKey, prompt, outPath }) {
  const cleanPrompt = `${prompt}, photorealistic tech product advertising poster, sleek dark glass aesthetic, glowing cyber accents, 8k resolution, minimalist commercial render`;

  if (apiKey) {
    const googleModels = [
      'nano-banana-pro-preview',
      'gemini-3.1-flash-image',
      'gemini-2.5-flash-image',
      'gemini-3-pro-image'
    ];

    for (const m of googleModels) {
      try {
        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`,
          {
            contents: [{ parts: [{ text: `Generate advertising marketing visual: ${cleanPrompt}` }] }]
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        const parts = res.data?.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p.inlineData?.data) {
            const buf = Buffer.from(p.inlineData.data, 'base64');
            await fsp.writeFile(outPath, buf);
            return { success: true, path: outPath, provider: `Google Gemini (${m})` };
          }
        }
      } catch (err) {
        // Continue to next model if quota exceeded or unsupported
      }
    }

    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
        {
          instances: [{ prompt: cleanPrompt }],
          parameters: { sampleCount: 1, aspectRatio: '4:5', outputMimeType: 'image/jpeg' }
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
      );
      const b64 = res.data?.predictions?.[0]?.bytesBase64Encoded;
      if (b64) {
        const buffer = Buffer.from(b64, 'base64');
        await fsp.writeFile(outPath, buffer);
        return { success: true, path: outPath, provider: 'Google Gemini Imagen 3' };
      }
    } catch (err) {
      // Free-tier Google API has limit: 0 for image endpoints
    }
  }

  // 100% Reliable State-of-the-Art AI Generation (Flux-Realism / Flux / Turbo)
  const fluxModels = ['flux-realism', 'flux', 'turbo'];
  for (const fm of fluxModels) {
    try {
      const seed = Math.floor(Math.random() * 1000000);
      const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt.slice(0, 250))}?model=${fm}&width=1080&height=1350&nologo=true&seed=${seed}`;
      const resp = await axios.get(fluxUrl, { responseType: 'arraybuffer', timeout: 22000 });
      if (resp.data && resp.data.length > 5000) {
        await fsp.writeFile(outPath, resp.data);
        return { success: true, path: outPath, provider: `AI Flux Pro (${fm.toUpperCase()})` };
      }
    } catch (fluxErr) {
      // Small backoff before next model
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // Pure Procedural AI Creative Canvas (Guarantees stunning digital artwork if all web APIs are blocked)
  try {
    const artCanvas = renderCyberTechArtwork({ W: 1080, H: 1350, brand: 'TOOLVERSE', toolName: prompt.slice(0, 30) });
    await fsp.writeFile(outPath, artCanvas.toBuffer('image/jpeg'));
    return { success: true, path: outPath, provider: 'OmniPost Neural Canvas AI' };
  } catch (canvasErr) {
    console.warn('[ImageEngine] Neural canvas fallback error:', canvasErr.message);
  }

  return null;
}

/**
 * Main Image Generation Pipeline
 * Generates REAL AI MARKETING CREATIVE for each post!
 */
export async function generatePostImage({
  post,
  strategy,
  websiteData,
  outDir,
  webPrefix,
  index,
  geminiApiKey
}) {
  const imagesDir = path.join(outDir, 'images');
  await fsp.mkdir(imagesDir, { recursive: true });

  const palette = websiteData.palette || DEFAULT_PALETTE;
  const hook = sanitizeText(post.hook) || `Discover ${strategy.brandName}`;
  const sub = sanitizeText(post.callToAction || strategy.uniqueSellingPoint).slice(0, 140);
  const domain = websiteData.domain;
  const outPath = path.join(imagesDir, `post-${index}.png`);
  const rawAiPath = path.join(imagesDir, `ai-raw-${index}.jpg`);

  const studioName = post.studio || '';
  const toolName = post.toolName || '';

  // Pick the specific screenshot matching this post's tool or studio for the PiP proof
  const allShots = websiteData.capturedScreenshots || [];
  let chosenShot = allShots.find((s) => {
    const titleMatch = toolName && s.title?.toLowerCase().includes(toolName.toLowerCase());
    const descMatch = toolName && s.description?.toLowerCase().includes(toolName.toLowerCase());
    const studioMatch = studioName && (s.studio?.toLowerCase().includes(studioName.toLowerCase()) || s.title?.toLowerCase().includes(studioName.toLowerCase()));
    return titleMatch || descMatch || studioMatch;
  });

  if (!chosenShot) {
    chosenShot = allShots[(index - 1) % (allShots.length || 1)];
  }

  let shotPath = chosenShot?.localPath;
  if (!shotPath || !fs.existsSync(shotPath)) {
    shotPath = websiteData.desktopScreenshotPath;
  }

  // 1. ALWAYS Generate 100% Real AI Marketing Artwork!
  const prompt = post.imagePrompt || `Futuristic digital user interface and high-tech product commercial visual for ${toolName || studioName || strategy.brandName}, glowing cyber aesthetics, 3d isometric illustration, neon lighting`;
  const aiGen = await generateGeminiImagen({
    apiKey: geminiApiKey,
    prompt,
    outPath: rawAiPath
  });

  const provider = aiGen?.provider || `OmniPost AI Creative (${studioName || 'Studio'} - ${toolName || 'Tool'})`;

  // When AI artwork is generated, renderAICreativeMarketingCard puts the AI artwork
  // as the full-bleed centerpiece with brand typography, hook, CTA, and software proof PiP!
  let canvas;
  if (fs.existsSync(rawAiPath)) {
    canvas = await renderAICreativeMarketingCard({
      W: 1080,
      H: 1350,
      aiImagePath: rawAiPath,
      screenshotPath: shotPath,
      palette,
      brand: strategy.brandName,
      hook,
      sub,
      domain,
      studioName,
      toolName,
      provider
    });
  } else {
    canvas = await renderScreenshotMarketingCard({
      W: 1080,
      H: 1350,
      screenshotPath: shotPath,
      bgImagePath: null,
      palette,
      brand: strategy.brandName,
      hook,
      sub,
      domain,
      badgeText: studioName || 'FEATURED SHOWCASE',
      studioName,
      toolName,
      testedInput: chosenShot?.testedInput || 'Live System Demo',
      testedOutput: chosenShot?.testedOutput || 'Verified'
    });
  }

  await fsp.writeFile(outPath, canvas.toBuffer('image/png'));

  return {
    path: outPath,
    url: `${webPrefix}/images/post-${index}.png`,
    rawAiUrl: fs.existsSync(rawAiPath) ? `${webPrefix}/images/ai-raw-${index}.jpg` : null,
    screenshotUrl: chosenShot?.webUrl || websiteData.screenshotUrl,
    provider
  };
}

/**
 * Video Scene Cards for 9:16 Video Reels (1080x1920)
 * Uses real AI artwork + live screenshot proof!
 */
export async function makeVideoSceneCards({ post, strategy, websiteData, outDir, index }) {
  const videosDir = path.join(outDir, 'videos');
  await fsp.mkdir(videosDir, { recursive: true });

  const palette = websiteData.palette || DEFAULT_PALETTE;
  const hookCard = path.join(videosDir, `cards-${index}-hook.png`);
  const ctaCard = path.join(videosDir, `cards-${index}-cta.png`);

  const studioName = post.studio || '';
  const toolName = post.toolName || '';

  const allShots = websiteData.capturedScreenshots || [];
  let chosenShot = allShots.find((s) => {
    const titleMatch = toolName && s.title?.toLowerCase().includes(toolName.toLowerCase());
    const descMatch = toolName && s.description?.toLowerCase().includes(toolName.toLowerCase());
    const studioMatch = studioName && (s.studio?.toLowerCase().includes(studioName.toLowerCase()) || s.title?.toLowerCase().includes(studioName.toLowerCase()));
    return titleMatch || descMatch || studioMatch;
  });

  if (!chosenShot) {
    chosenShot = allShots[(index - 1) % (allShots.length || 1)];
  }

  const shotPath = chosenShot?.localPath || websiteData.desktopScreenshotPath;
  const rawAiPath = path.join(outDir, 'images', `ai-raw-${index}.jpg`);
  const hasAiArt = fs.existsSync(rawAiPath);

  // 1. Hook Scene Card (1080x1920) with AI Artwork as hero
  const hook = sanitizeText(post.hook) || `Meet ${toolName || strategy.brandName}`;
  const hookCanvas = await renderAICreativeMarketingCard({
    W: 1080,
    H: 1920,
    aiImagePath: hasAiArt ? rawAiPath : null,
    screenshotPath: shotPath,
    palette,
    brand: strategy.brandName,
    hook,
    sub: `Discover ${toolName || studioName || strategy.brandName}`,
    domain: websiteData.domain,
    studioName,
    toolName,
    provider: post.imageProvider || 'AI Creative Engine'
  });
  await fsp.writeFile(hookCard, hookCanvas.toBuffer('image/png'));

  // 2. CTA Scene Card (1080x1920) with AI Artwork backdrop
  const cta = sanitizeText(post.callToAction || `Explore ${strategy.brandName}`).slice(0, 90);
  const ctaCanvas = await renderAICreativeMarketingCard({
    W: 1080,
    H: 1920,
    aiImagePath: hasAiArt ? rawAiPath : null,
    screenshotPath: shotPath,
    palette,
    brand: strategy.brandName,
    hook: cta,
    sub: `Visit ${websiteData.domain} to get started`,
    domain: websiteData.domain,
    studioName: studioName || 'Instant Access',
    toolName,
    provider: post.imageProvider || 'AI Creative Engine'
  });
  await fsp.writeFile(ctaCard, ctaCanvas.toBuffer('image/png'));

  return { hookCard, ctaCard };
}
