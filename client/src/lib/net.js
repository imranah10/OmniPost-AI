/**
 * net.js — CORS-free networking layer for the 100% browser standalone engine.
 *
 * The deployed site is a static SPA with NO backend, so every cross-origin
 * fetch goes through a resilient fallback chain of public proxies:
 *
 *   Text/HTML : corsproxy.io → api.allorigins.win/raw → codetabs
 *   Images    : direct → wsrv.nl (image CDN, CORS) → allorigins/raw
 *
 * Every helper returns null on total failure so callers can degrade
 * gracefully instead of crashing the flow.
 */

const TEXT_PROXIES = [
  (u) => `/api/proxy?url=${encodeURIComponent(u)}`, // same-origin Vercel function (deployed with the site)
  (u) => `https://test.cors.workers.dev/?${u}`,
  (u) => `https://api.cors.lol/?url=${u}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, // JSON-wrapped variant
];

const IMAGE_PROXIES = [
  (u) => `/api/proxy?url=${encodeURIComponent(u)}`, // same-origin first — no CORS issues at all
  (u) => u,
  (u) => `https://wsrv.nl/?url=${encodeURIComponent(u)}&output=jpg&q=88`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

/**
 * mShots screenshots have no CORS headers — the same-origin proxy or
 * wsrv.nl (ACAO:*) must come before the direct fetch.
 * Pollinations AI art HAS CORS but can take >25s to generate — the
 * same-origin proxy would time out, so go DIRECT first for it.
 */
const isMshots = (u) => /s\.wordpress\.com\/mshots/.test(u);
const isPollinations = (u) => /image\.pollinations\.ai/.test(u);
const imageChain = (u) => {
  if (isPollinations(u)) return [IMAGE_PROXIES[1], IMAGE_PROXIES[2], IMAGE_PROXIES[0]]; // direct → wsrv → same-origin
  if (isMshots(u)) return [IMAGE_PROXIES[0], IMAGE_PROXIES[2], IMAGE_PROXIES[3]]; // same-origin → wsrv → allorigins
  return IMAGE_PROXIES;
};

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a cross-origin HTML/text payload through the proxy chain. */
export async function proxyText(url, { timeout = 15000 } = {}) {
  for (const make of TEXT_PROXIES) {
    try {
      const res = await withTimeout(fetch(make(url), { redirect: 'follow' }), timeout);
      if (!res.ok) continue;
      let text = await res.text();
      // allorigins /get wraps the payload in JSON { contents: "..." }
      if (text.startsWith('{"contents"')) {
        try {
          text = JSON.parse(text).contents || '';
        } catch {
          /* keep raw */
        }
      }
      if (text && text.length > 200) return text;
    } catch {
      /* try next proxy */
    }
  }
  return null;
}

/** Fetch any image (screenshot/AI art) as a Blob for canvas & ZIP export. */
export async function proxyImageBlob(url, { timeout = 30000 } = {}) {
  if (!url) return null;
  for (const make of imageChain(url)) {
    try {
      const res = await withTimeout(fetch(make(url), { redirect: 'follow' }), timeout);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob && blob.size > 512 && blob.type.startsWith('image')) return blob;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Free screenshot service (WordPress mShots) — no API key needed.
 * The first ever request for a URL often returns a "generating"
 * placeholder; we preload via <img> and retry to get the real capture.
 */
export function mshotsUrl(pageUrl, w = 1280, h = 800) {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(pageUrl)}?w=${w}&h=${h}`;
}

export function preloadImage(src, { timeout = 20000, cors = true } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    const done = (ok) => {
      img.onload = img.onerror = null;
      resolve(ok ? img : null);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    setTimeout(() => done(false), timeout);
    img.src = src;
  });
}

/**
 * Warm the mShots cache and wait for the real capture.
 * mShots' first-ever request returns a 400x300 "generating" placeholder;
 * re-requesting after a delay returns the real shot. We load through
 * wsrv.nl with CORS so the returned <img> is canvas-safe (palette usable).
 */
export async function captureScreenshot(pageUrl, { w = 1280, h = 800, retries = 3 } = {}) {
  const url = mshotsUrl(pageUrl, w, h);
  // warm the upstream cache (plain load, no CORS needed)
  await preloadImage(url, { cors: false, timeout: 15000 });
  for (let i = 0; i < retries; i++) {
    await new Promise((r) => setTimeout(r, 1000 + i * 3500));
    // canvas-safe loads: same-origin proxy first, then wsrv.nl (both send CORS)
    const viaProxy = await preloadImage(`/api/proxy?url=${encodeURIComponent(url)}&cb=${Date.now()}`, { cors: true, timeout: 20000 });
    if (viaProxy && viaProxy.naturalWidth >= w * 0.6) return viaProxy;
    const viaWsrv = await preloadImage(`${wsrvUrl(url)}&cb=${Date.now()}`, { cors: true, timeout: 20000 });
    if (viaWsrv && viaWsrv.naturalWidth >= w * 0.6) return viaWsrv;
  }
  return null;
}

export function wsrvUrl(u) {
  return `https://wsrv.nl/?url=${encodeURIComponent(u)}&output=jpg&q=88`;
}

/** Extract a 5-color brand palette from a screenshot image element. */
export async function extractPaletteFromImage(img) {
  const DEFAULT = ['#6366f1', '#a855f7', '#ec4899', '#22d3ee', '#f59e0b'];
  try {
    const canvas = document.createElement('canvas');
    const W = 64;
    const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
    canvas.width = W;
    canvas.height = H || 40;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, canvas.height);
    const { data } = ctx.getImageData(0, 0, W, canvas.height);

    const buckets = {};
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max - min < 12 && (max > 235 || max < 25)) continue; // skip bg/near-white/black
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const s = (max - min) + Math.min(r, g, b); // favor saturated + bright
      buckets[key] = buckets[key] || { n: 0, r: 0, g: 0, b: 0, s: 0 };
      buckets[key].n++; buckets[key].r += r; buckets[key].g += g; buckets[key].b += b; buckets[key].s += s;
    }
    const top = Object.values(buckets)
      .sort((a, b) => (b.s * Math.log(b.n + 1)) - (a.s * Math.log(a.n + 1)))
      .slice(0, 5)
      .map((c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v / c.n).toString(16).padStart(2, '0')).join(''));
    return top.length >= 3 ? top : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Last-resort text fetch via the Wayback Machine (CORS-enabled, may be slow). */
export async function waybackText(url, { timeout = 45000 } = {}) {
  try {
    const res = await withTimeout(
      fetch(`https://web.archive.org/web/2026/${url}`, { redirect: 'follow' }),
      timeout
    );
    if (!res.ok) return null;
    const text = await res.text();
    if (text && text.length > 200) return text;
  } catch {
    /* ignore */
  }
  return null;
}

export function normalizeUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    return new URL(s).toString();
  } catch {
    return '';
  }
}
