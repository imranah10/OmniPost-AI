/**
 * carousel.js — Carousel CONTENT planner + AI prompt builder.
 *
 * PROMPTS-FIRST (user rule: "carousel ka image mat banaya karo, uske liye
 * prompt de diya karo"): the app NO LONGER renders carousel images on canvas.
 * Instead every image post ships a ready-to-paste `carousel_prompt.txt` in the
 * campaign ZIP — the user generates the swipeable deck in Gemini / ChatGPT /
 * Midjourney, attaching the tool's live screenshot for brand accuracy.
 *
 * Content plan (unchanged): 6 slides —
 *   Slide 1  Cover — big hook + swipe hint
 *   Slides 2-4 — key points extracted from the post's own caption
 *   Slide 5  — USP / proof point
 *   Slide 6  — CTA + domain pill
 */

const BULLETS = /^[✅⚡🔒✨🚀🎯💡🔥📈✓✔🌟]-*\s*/u;

/** Brand hex → CSS rgb triplet string (for the AI prompt's palette line). */
function hexRgb(hex) {
  try {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  } catch {
    return '99, 102, 241';
  }
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
 * Build the 6-slide content plan for a post — ALWAYS exactly 6 slides:
 *   1 cover + 3 swipe points + 1 USP + 1 CTA (CTA is never cut again).
 * Priority 1: a dedicated AI-authored slide plan (post.carouselContent — built
 * from the user's own carousel prompt via Gemini).
 * Priority 2: dynamically extracted from the post's caption + strategy USP,
 * with the user's carousel brief (post.carouselBrief) as the first point.
 */
function padMiddle(middle, brand, post) {
  while (middle.length < 3) {
    middle.push({
      kind: 'point',
      kicker: `Point ${middle.length + 1}`,
      headline: `${post.toolName || brand} works for you 24/7`,
      body: '',
    });
  }
  return middle.slice(0, 3);
}

export function buildCarouselSlides(post, strategy, websiteData) {
  const brand = strategy?.brandName || websiteData?.title || 'Brand';
  const domain = websiteData?.domain || '';
  const usp = strategy?.uniqueSellingPoint || websiteData?.description || `Why ${brand} wins`;
  const uspSlide = { kind: 'usp', kicker: 'Why it wins', headline: usp.length > 120 ? `${usp.slice(0, 117)}…` : usp, body: '' };
  const ctaSlide = {
    kind: 'cta',
    kicker: brand,
    headline: post.callToAction || `Try it now → ${domain}`,
    body: domain,
  };

  // 1) AI-authored slide-by-slide plan (user's carousel prompt applied)
  const provided = Array.isArray(post?.carouselContent)
    ? post.carouselContent.filter((s) => s && (s.headline || s.kicker))
    : [];
  if (provided.length) {
    const cover = {
      kind: 'cover',
      kicker: provided[0].kicker || post.studio || 'Featured',
      headline: provided[0].headline || post.hook || `Discover ${post.toolName || brand}`,
      body: provided[0].body || `${post.toolName ? `${post.toolName} — ` : ''}swipe to see why it matters →`,
    };
    const middle = provided.slice(1, 4).map((s) => ({
      kind: 'point',
      kicker: s.kicker || 'Point',
      headline: s.headline || '',
      body: s.body || '',
    }));
    return [cover, ...padMiddle(middle, brand, post), uspSlide, ctaSlide]; // exactly 6
  }

  // 2) Caption-derived plan (Smart Engine / no AI plan)
  const points = extractCaptionPoints(post.caption, 3).map((p) => ({
    kind: 'point',
    kicker: 'Point',
    headline: p.length > 90 ? `${p.slice(0, 87)}…` : p,
    body: '',
  }));

  // The user's own carousel brief always becomes the first swipe point
  const brief = String(post.carouselBrief || '').trim();
  if (brief) {
    points.unshift({
      kind: 'point',
      kicker: 'Your Brief',
      headline: brief.length > 90 ? `${brief.slice(0, 87)}…` : brief,
      body: '',
    });
  }

  const cover = {
    kind: 'cover',
    kicker: post.studio || 'Featured',
    headline: post.hook || `Discover ${post.toolName || brand}`,
    body: `${post.toolName ? `${post.toolName} — ` : ''}swipe to see why it matters →`,
  };
  return [cover, ...padMiddle(points, brand, post), uspSlide, ctaSlide]; // exactly 6
}

/**
 * Build the copy-paste AI prompt that generates this post's carousel.
 * (Replaces the old canvas renderer — the user makes the deck in Gemini /
 * ChatGPT / Midjourney, attaching the tool's live screenshot.)
 * Returns a plain string meant for the ZIP's carousel_prompt.txt.
 */
export function buildCarouselPrompt(post, strategy, websiteData) {
  const brand = strategy?.brandName || websiteData?.title || 'Brand';
  const industry = strategy?.industry || 'Technology & Digital Solutions';
  const domain = websiteData?.domain || '';
  const palette = Array.isArray(websiteData?.palette) && websiteData.palette.length
    ? websiteData.palette.slice(0, 3).map((h) => `#${String(h).replace('#', '')} (rgb ${hexRgb(h)})`).join(', ')
    : '#6366f1, #a855f7, #ec4899';
  const slides = buildCarouselSlides(post, strategy, websiteData);
  const tool = post.toolName || brand;
  const studio = post.studio || 'Core';

  const kindLabel = { cover: 'COVER', point: 'KEY POINT', usp: 'WHY IT WINS', cta: 'CALL TO ACTION' };
  const slideBlocks = slides.map((s, i) => {
    const lines = [`SLIDE ${i + 1} — ${kindLabel[s.kind] || 'CONTENT'}`];
    lines.push(`Kicker (small top label): ${s.kicker || brand}`);
    if (s.headline) lines.push(`Headline (big bold text): ${s.headline}`);
    if (s.body) lines.push(`Support line: ${s.body}`);
    if (s.kind === 'point') lines.push('Add a large number chip (02, 03…) top-left of the text block.');
    if (s.kind === 'cta') lines.push(`Add a rounded pill button reading: Visit ${domain || brand}`);
    return lines.join('\n');
  });

  return `PROMPT FOR GEMINI / CHATGPT / MIDJOURNEY — CAROUSEL DECK (${slides.length} SLIDES)
(💡 TIP: Attach 'screenshot_tool_live.jpg' — the live UI of ${tool} — alongside this
prompt so the slides match the real brand typography, colors and product.)

Create a ${slides.length}-slide swipeable Instagram carousel for "${brand}" (${industry}),
promoting the capability "${tool}" (${studio}).

CANVAS & STYLE RULES
- Size: 1080 x 1350 px portrait (4:5), one image per slide, numbered in order.
- One consistent visual system across ALL slides: dark premium background,
  brand-gradient accents in ${palette}, generous margins, crisp sans-serif
  headline typography, subtle progress dots bottom-center (dot ${1} of ${slides.length} highlighted per slide).
- No watermarks, no stock-photo clichés, keep text large and readable.

SLIDE-BY-SLIDE CONTENT (use exactly this copy)

${slideBlocks.join('\n\n')}

HOW TO USE
1. Generate each slide separately ("Slide 1", "Slide 2", …) and save them as
   slide-01.png … slide-0${slides.length}.png.
2. Post them in order as a carousel on ${post.platform || 'Instagram'}.
3. Copy the caption + hashtags from 'post_ready_to_publish.txt' in this folder.`;
}
