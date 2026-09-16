/**
 * analyzer.js — Autonomous website crawler that runs 100% in the browser.
 *
 * Port of the server's Playwright deep-crawl to the DOM API:
 *  1. Fetch HTML through the proxy chain (no browser emulation needed)
 *  2. Parse with DOMParser: title, meta, headings, nav, sections, internal links
 *  3. BFS-crawl up to N internal pages (2 rounds) to map studios/sections/tools
 *  4. Free live screenshots of every key page (mShots, no API key)
 *  5. Brand palette extracted from the hero screenshot via canvas
 *
 * Output shape mirrors the server's websiteData so every downstream
 * component (Strategy, Dashboard, ZIP) works unchanged.
 */
import {
  proxyText,
  waybackText,
  captureScreenshot,
  preloadImage,
  extractPaletteFromImage,
  normalizeUrl,
} from './net.js';

const STOP_LINKS = /login|signin|signup|register|privacy|terms|cookie|blog\/(20|tag)|wp-|admin|cart|checkout|#|mailto:|tel:|javascript:/i;

function parseHtml(html, baseUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const abs = (u) => {
    try {
      return new URL(u, baseUrl).toString();
    } catch {
      return null;
    }
  };

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const title = clean(doc.querySelector('title')?.textContent);
  const description =
    clean(doc.querySelector('meta[name="description"]')?.getAttribute('content')) ||
    clean(doc.querySelector('meta[property="og:description"]')?.getAttribute('content'));
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

  const h1s = [...doc.querySelectorAll('h1')].map((h) => clean(h.textContent)).filter(Boolean).slice(0, 6);
  const h2s = [...doc.querySelectorAll('h2, h3')].map((h) => clean(h.textContent)).filter((t) => t.length > 3).slice(0, 24);

  // Nav items = top-level section names
  const navTexts = [...doc.querySelectorAll('nav a, header a')]
    .map((a) => clean(a.textContent))
    .filter((t) => t && t.length > 2 && t.length < 28 && !STOP_LINKS.test(t));

  // Internal links for BFS + tool discovery
  const origin = new URL(baseUrl).origin;
  const internal = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = abs(a.getAttribute('href'));
    if (!href || !href.startsWith(origin) || STOP_LINKS.test(href)) continue;
    if (internal.some((x) => x.href === href)) continue;
    internal.push({ href, name: clean(a.textContent) || href.split('/').filter(Boolean).pop() || 'Page' });
    if (internal.length >= 60) break;
  }

  // Body summary text
  const bodyClone = doc.body.cloneNode(true);
  bodyClone.querySelectorAll('script, style, nav, footer, header, svg, noscript').forEach((n) => n.remove());
  const rawSummary = clean(bodyClone.textContent).slice(0, 2400);

  // Feature-ish sentences from headings + short paragraphs
  const features = h2s.slice(0, 10);
  if (features.length < 4) {
    [...doc.querySelectorAll('p')].forEach((p) => {
      const t = clean(p.textContent);
      if (t.length > 24 && t.length < 120 && !features.includes(t)) features.push(t);
      if (features.length >= 10) return;
    });
  }

  return { doc, title, description, ogImage: abs(ogImage) || '', h1s, h2s, navTexts: [...new Set(navTexts)].slice(0, 14), internal, rawSummary };
}

/** Derive studios (sections) + discovered tools from nav/headings/links. */
function deriveStructure(pages, domain) {
  const studios = [];
  const toolsMap = new Map();

  const pushTool = (name, studio, description, href) => {
    const cleanName = (name || '').replace(/[^\w\s&+.\-/]/g, '').trim().slice(0, 48);
    if (!cleanName || cleanName.length < 3 || toolsMap.has(cleanName.toLowerCase())) return;
    toolsMap.set(cleanName.toLowerCase(), {
      name: cleanName,
      studio: studio || 'Platform',
      description: (description || '').slice(0, 140),
      url: href,
    });
  };

  for (const p of pages) {
    for (const nav of p.navTexts) {
      if (nav.split(' ').length <= 4 && !studios.includes(nav)) studios.push(nav);
    }
    // h2/h3 headings on each page look like tool/capability names
    for (const h of p.h2s) {
      const words = h.split(' ');
      if (words.length > 9) continue; // long marketing sentences → skip
      pushTool(h, p.title.split(/[|\-–—:]/)[0].trim().slice(0, 30) || 'Platform', h, p.url);
    }
    // Tool-like links (/tool/x, /studio/y, /category/z) are gold
    for (const l of p.internal) {
      const path = new URL(l.href).pathname;
      if (/^\/(tool|tools|studio|category|app|feature|product)s?\//.test(path) && l.name) {
        const seg = path.split('/').filter(Boolean);
        const studioGuess = (seg[0] === 'tool' || seg[0] === 'tools' ? 'Tools' : seg[0].charAt(0).toUpperCase() + seg[0].slice(1));
        pushTool(l.name, studioGuess, `${l.name} on ${domain}`, l.href);
        if (!studios.includes(studioGuess)) studios.push(studioGuess);
      }
    }
  }

  // Fallback: if nothing discovered, treat nav words as sections
  if (toolsMap.size === 0) {
    (studios.length ? studios : ['Core Platform', 'Features', 'Pricing']).forEach((s) =>
      pushTool(`${s}`, s, `Explore ${s} on ${domain}`, `https://${domain}`)
    );
  }

  const discoveredTools = [...toolsMap.values()].slice(0, 40);
  const isStudioPlatform = discoveredTools.length >= 12 || studios.length >= 6;

  return {
    studios: studios.slice(0, 12),
    discoveredTools,
    isStudioPlatform,
    sectionTypeLabel: isStudioPlatform ? 'Studios' : 'Sections & Services',
  };
}

/** Basic site-health score (mirrors server testReport so the UI shows it). */
function healthReport(pages, hasHttps) {
  let score = 40;
  const main = pages[0] || {};
  if (hasHttps) score += 10;
  if (main.title) score += 10;
  if (main.description) score += 10;
  if (main.ogImage) score += 5;
  if (main.h1s?.length) score += 10;
  if (pages.length > 3) score += 5;
  if (main.doc?.querySelector('meta[name="viewport"]')) score += 10;
  return { score: Math.min(100, score), label: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Needs Work' };
}

export async function analyzeSite(targetUrl, { onStep = () => {}, maxPages = 6 } = {}) {
  const url = normalizeUrl(targetUrl);
  if (!url) throw new Error('Invalid URL');
  const uObj = new URL(url);
  const domain = uObj.hostname.replace(/^www\./, '');
  const origin = uObj.origin;

  onStep({ key: 'crawl', label: `Crawling ${domain}…`, progress: 8 });
  let homeHtml = await proxyText(url);
  if (!homeHtml) {
    onStep({ key: 'crawl2', label: 'Trying archive fallback…', progress: 12 });
    homeHtml = await waybackText(url);
  }
  if (!homeHtml) {
    throw new Error('Could not reach the website through any proxy. Check the URL or try again.');
  }

  onStep({ key: 'parse', label: 'Extracting brand DNA & structure…', progress: 25 });
  const home = parseHtml(homeHtml, url);
  home.url = url;

  // Round 2: crawl up to maxPages-1 interesting internal pages in parallel
  const interesting = home.internal
    .filter((l) => l.href !== url && !/\.(pdf|jpg|png|zip|xml)$/i.test(l.href))
    .slice(0, maxPages - 1);
  const pages = [home];
  if (interesting.length) {
    onStep({ key: 'deep', label: `Deep-testing ${interesting.length + 1} pages…`, progress: 40 });
    const more = await Promise.all(
      interesting.map(async (l) => {
        const html = await proxyText(l.href, { timeout: 12000 });
        if (!html) return null;
        const p = parseHtml(html, l.href);
        p.url = l.href;
        return p;
      })
    );
    pages.push(...more.filter(Boolean));
  }

  onStep({ key: 'structure', label: 'Mapping studios, tools & capabilities…', progress: 55 });
  const structure = deriveStructure(pages, domain);

  onStep({ key: 'screenshots', label: 'Capturing live page screenshots…', progress: 68 });
  const shotTargets = [
    { url, title: home.title || 'Landing Page', description: home.description || 'Hero & full platform view' },
    ...interesting.slice(0, 4).map((l) => ({
      url: l.href,
      title: l.name,
      description: `Live capture of ${l.href.replace(origin, '') || '/'} `,
    })),
  ];
  const screenshots = [];
  let homeShotImg = null;
  for (let i = 0; i < shotTargets.length; i++) {
    const t = shotTargets[i];
    const fname = i === 0 ? 'desktop.jpg' : `section-${i}.jpg`;
    // Warm mShots for every page (real capture generates upstream & gets
    // cached — the ZIP export fetches it later). Only the homepage waits
    // for the full capture because we need it for the palette.
    if (i === 0) {
      homeShotImg = await captureScreenshot(t.url);
      screenshots.push({
        webUrl: `https://s.wordpress.com/mshots/v1/${encodeURIComponent(t.url)}?w=1280&h=800`,
        localName: fname,
        fileName: fname,
        title: t.title,
        description: t.description,
        pageUrl: t.url,
        captured: Boolean(homeShotImg),
      });
    } else {
      const shotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(t.url)}?w=1280&h=800`;
      preloadImage(shotUrl, { cors: false, timeout: 12000 }).catch(() => {});
      screenshots.push({
        webUrl: shotUrl,
        localName: fname,
        fileName: fname,
        title: t.title,
        description: t.description,
        pageUrl: t.url,
        captured: 'pending',
      });
    }
  }

  onStep({ key: 'palette', label: 'Extracting brand color palette…', progress: 82 });
  const palette = homeShotImg || (await captureScreenshot(url, { retries: 1 }));
  const paletteColors = palette ? await extractPaletteFromImage(palette) : undefined;

  const websiteData = {
    url,
    domain,
    title: home.title || domain,
    description: home.description || '',
    ogImage: home.ogImage,
    h1s: home.h1s,
    h2s: home.h2s.slice(0, 16),
    features: (home.h2s.length ? home.h2s : []).slice(0, 10),
    rawSummary: home.rawSummary,
    screenshotUrl: screenshots[0]?.webUrl || '',
    desktopScreenshotPath: null,
    screenshots,
    capturedScreenshots: screenshots,
    palette: paletteColors,
    testReport: healthReport(pages, uObj.protocol === 'https:'),
    engine: 'browser-standalone',
    crawledPages: pages.map((p) => p.url),
    ...structure,
  };
  onStep({ key: 'done', label: 'Analysis complete!', progress: 100 });
  return websiteData;
}
