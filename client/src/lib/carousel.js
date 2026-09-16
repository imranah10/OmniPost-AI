/**
 * carousel.js — Dynamic branded Instagram carousel maker (100% free, canvas).
 *
 * Every image post can become a swipeable 6-slide carousel:
 *   Slide 1  Cover — big hook + swipe hint
 *   Slides 2-4 — key points extracted from the post's own caption
 *   Slide 5  — USP / proof point
 *   Slide 6  — CTA + domain pill
 *
 * Content is derived DYNAMICALLY from the crawled site + generated post
 * (no hardcoded copy), rendered with the site's real brand palette.
 * Slides render on demand (~10ms each, zero network) and export as
 * PNGs into the campaign ZIP (06_CAROUSELS/).
 */

const BULLETS = /^[✅⚡🔒✨🚀🎯💡🔥📈✓✔🌟]-*\s*/u;

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
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

function hexA(hex, a) {
  try {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  } catch {
    return `rgba(99,102,241,${a})`;
  }
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

/** Extract punchy key points from the post's own caption (dynamic, no templates). */
export function extractCaptionPoints(caption, max = 3) {
  const points = [];
  const lines = String(caption || '').split('\n').map((l) => l.trim()).filter(Boolean);
  for (const raw of lines) {
    const line = raw.replace(BULLETS, '').trim();
    if (!line || /^[👇🎯]/u.test(raw)) continue;
    if (line.length >= 12 && !points.includes(line)) points.push(line);
    if (points.length >= max) break;
  }
  // Fallback: split long caption into sentences
  if (points.length < max) {
    const sentences = String(caption || '')
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 18);
    for (const s of sentences) {
      if (points.includes(s)) continue;
      points.push(s);
      if (points.length >= max) break;
    }
  }
  return points.slice(0, max);
}

/**
 * Build the 6-slide content plan for a post — fully dynamic from post data.
 * Returns [{ kind, kicker, headline, body }]
 */
export function buildCarouselSlides(post, strategy, websiteData) {
  const brand = strategy?.brandName || websiteData?.title || 'Brand';
  const domain = websiteData?.domain || '';
  const points = extractCaptionPoints(post.caption, 3);
  const usp = strategy?.uniqueSellingPoint || websiteData?.description || `Why ${brand} wins`;

  const slides = [
    {
      kind: 'cover',
      kicker: post.studio || 'Featured',
      headline: post.hook || `Discover ${post.toolName || brand}`,
      body: `${post.toolName ? `${post.toolName} — ` : ''}swipe to see why it matters →`,
    },
  ];
  points.forEach((p, i) => {
    slides.push({
      kind: 'point',
      kicker: `Point ${i + 1}`,
      headline: p.length > 90 ? `${p.slice(0, 87)}…` : p,
      body: '',
    });
  });
  while (slides.length < 5) {
    slides.push({
      kind: 'point',
      kicker: `Point ${slides.length - 1}`,
      headline: `${post.toolName || brand} works for you 24/7`,
      body: '',
    });
  }
  slides.push({ kind: 'usp', kicker: 'Why it wins', headline: usp.length > 120 ? `${usp.slice(0, 117)}…` : usp, body: '' });
  slides.push({
    kind: 'cta',
    kicker: brand,
    headline: post.callToAction || `Try it now → ${domain}`,
    body: domain,
  });
  return slides.slice(0, 6);
}

/**
 * Render ONE branded slide (1080x1350) → PNG dataURL.
 */
export async function renderCarouselSlide({ slide, palette = [], brand, domain, index, total }) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const accent = palette[0] || '#6366f1';
  const accent2 = palette[1] || '#a855f7';
  const accent3 = palette[2] || '#ec4899';

  // Rich brand-gradient background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0e1a');
  bg.addColorStop(0.55, '#101728');
  bg.addColorStop(1, '#0a0e1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Accent glow blobs (brand colors)
  const glow = (x, y, r, color, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, a));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.85, H * 0.12, 520, accent, 0.22);
  glow(W * 0.12, H * 0.85, 560, accent2, 0.18);
  if (slide.kind === 'cover' || slide.kind === 'cta') glow(W * 0.5, H * 0.55, 640, accent3, 0.10);

  // Fine grid dots texture
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let x = 40; x < W; x += 52) {
    for (let y = 40; y < H; y += 52) {
      ctx.fillRect(x, y, 3, 3);
    }
  }

  // Top brand row
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(brand.toUpperCase().slice(0, 26), 64, 96);
  ctx.font = '600 24px system-ui, sans-serif';
  ctx.fillStyle = hexA(accent, 0.9);
  ctx.textAlign = 'right';
  ctx.fillText(slide.kicker.toUpperCase().slice(0, 30), W - 64, 94);
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 126);
  ctx.lineTo(W - 64, 126);
  ctx.stroke();

  const contentTop = 300;
  const maxW = W - 128;

  if (slide.kind === 'cover') {
    // Giant hook typography
    let size = 92;
    let lines;
    do {
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      lines = wrap(ctx, slide.headline, maxW).slice(0, 5);
      size -= 6;
    } while (lines.length >= 5 && size > 56);

    let y = contentTop + size;
    for (const line of lines) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, 64, y);
      y += size * 1.16;
    }

    // Accent underline bar
    const barY = y + 36;
    const barW = Math.min(W - 128, 220 + lines.length * 40);
    const bar = ctx.createLinearGradient(64, barY, 64 + barW, barY);
    bar.addColorStop(0, accent);
    bar.addColorStop(1, accent2);
    ctx.fillStyle = bar;
    roundRect(ctx, 64, barY, barW, 14, 7);
    ctx.fill();

    // Swipe hint
    ctx.font = '600 38px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(slide.body || 'Swipe →', 64, barY + 110);
  } else if (slide.kind === 'point') {
    // Number chip
    const num = String(index).padStart(2, '0');
    ctx.font = '800 30px system-ui, sans-serif';
    const chip = `0${num}`.slice(-3);
    ctx.fillStyle = hexA(accent, 0.2);
    roundRect(ctx, 64, contentTop - 80, 150, 92, 24);
    ctx.fill();
    ctx.strokeStyle = hexA(accent, 0.65);
    ctx.lineWidth = 2.5;
    roundRect(ctx, 64, contentTop - 80, 150, 92, 24);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(chip, 92, contentTop - 18);

    // Point headline
    let size = 72;
    let lines;
    do {
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      lines = wrap(ctx, slide.headline, maxW).slice(0, 6);
      size -= 5;
    } while (lines.length >= 6 && size > 44);

    let y = contentTop + 120;
    for (const line of lines) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, 64, y);
      y += size * 1.18;
    }
  } else if (slide.kind === 'usp') {
    ctx.font = '800 64px system-ui, sans-serif';
    ctx.fillStyle = hexA(accent2, 1);
    ctx.fillText('“', 56, contentTop + 20);
    let size = 64;
    let lines;
    do {
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      lines = wrap(ctx, slide.headline, maxW).slice(0, 6);
      size -= 4;
    } while (lines.length >= 6 && size > 40);
    let y = contentTop + 130;
    for (const line of lines) {
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fillText(line, 64, y);
      y += size * 1.2;
    }
  } else if (slide.kind === 'cta') {
    ctx.font = '800 84px system-ui, sans-serif';
    let lines = wrap(ctx, slide.headline, maxW).slice(0, 4);
    if (lines.length >= 4) {
      ctx.font = '800 68px system-ui, sans-serif';
      lines = wrap(ctx, slide.headline, maxW).slice(0, 4);
    }
    let y = contentTop + 60;
    for (const line of lines) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, 64, y);
      y += 100;
    }

    // Domain pill
    if (domain) {
      const pill = `Visit ${domain}`;
      ctx.font = '700 40px system-ui, sans-serif';
      const pw = ctx.measureText(pill).width + 76;
      const pg = ctx.createLinearGradient(64, y + 40, 64 + pw, y + 40);
      pg.addColorStop(0, accent);
      pg.addColorStop(1, accent2);
      ctx.fillStyle = pg;
      roundRect(ctx, 64, y + 16, pw, 84, 42);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(pill, 102, y + 72);
    }
  }

  // Progress dots
  const dotY = H - 96;
  const dotGap = 34;
  const startX = (W - (total - 1) * dotGap) / 2;
  for (let i = 0; i < total; i++) {
    if (i === index - 1) {
      ctx.fillStyle = accent;
      roundRect(ctx, startX + i * dotGap - 11, dotY - 11, 22, 22, 11);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.arc(startX + i * dotGap, dotY, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas.toDataURL('image/png');
}

/** Build + render all slides for a post. Cached on the post object. */
export async function renderFullCarousel(post, strategy, websiteData) {
  if (Array.isArray(post.carouselSlides) && post.carouselSlides.length) return post.carouselSlides;
  const slides = buildCarouselSlides(post, strategy, websiteData);
  const out = [];
  for (let i = 0; i < slides.length; i++) {
    const dataUrl = await renderCarouselSlide({
      slide: slides[i],
      palette: websiteData?.palette || [],
      brand: strategy?.brandName || 'Brand',
      domain: websiteData?.domain || '',
      index: i + 1,
      total: slides.length,
    });
    out.push(dataUrl);
  }
  post.carouselSlides = out;
  return out;
}
