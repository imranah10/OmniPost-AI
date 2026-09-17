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
  readerText,
  microlinkMeta,
  captureScreenshot,
  preloadImage,
  extractPaletteFromImage,
  normalizeUrl,
} from './net.js';
import { toolIdFromUrl } from './shotMatch.js';

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

  // Structured data (schema.org JSON-LD) — machine-readable tool/section
  // registries (ItemList). Studio tool grids are client-rendered, so this is
  // often the ONLY place the real tool inventory is visible to crawlers.
  const ldJson = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = clean(s.textContent);
    if (raw && raw.length > 20) ldJson.push(raw.slice(0, 30000));
    if (ldJson.length >= 8) break;
  }

  return { doc, title, description, ogImage: abs(ogImage) || '', h1s, h2s, navTexts: [...new Set(navTexts)].slice(0, 14), internal, rawSummary, ldJson };
}

/**
 * Parse r.jina.ai Reader markdown into the same shape as parseHtml so the
 * whole downstream pipeline (structure, strategy, campaign) works unchanged
 * even when every raw-HTML proxy is down.
 */
function parseMarkdownPage(md, baseUrl) {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const lines = String(md || '').split('\n');

  let title = '';
  let contentStart = 0;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const m = lines[i].match(/^Title:\s*(.+)$/i);
    if (m) {
      title = clean(m[1].replace(/[*_`]/g, ''));
      contentStart = i + 1;
      break;
    }
  }
  const body = lines.slice(contentStart).join('\n');

  const h1s = [];
  const h2s = [];
  for (const line of body.split('\n')) {
    const h1 = line.match(/^#\s+(.{3,120})\s*$/);
    if (h1 && h1s.length < 6) {
      h1s.push(clean(h1[1].replace(/[*_`]/g, '')));
      continue;
    }
    const h2 = line.match(/^#{2,3}\s+(.{3,120})\s*$/);
    if (h2 && h2s.length < 24) h2s.push(clean(h2[1].replace(/[*_`]/g, '')));
  }

  const origin = new URL(baseUrl).origin;
  const internal = [];
  const seen = new Set();
  const linkRe = /\[([^\]]{2,48})\]\(([^)\s]+)\)/g;
  let m2;
  while ((m2 = linkRe.exec(body)) && internal.length < 60) {
    const name = clean(m2[1].replace(/[*_`]/g, ''));
    let href;
    try {
      href = new URL(m2[2], baseUrl).toString();
    } catch {
      continue;
    }
    if (!href.startsWith(origin) || STOP_LINKS.test(href)) continue;
    if (/\.(pdf|jpg|png|zip|xml|svg|webp)$/i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    internal.push({ href, name: name || href.split('/').filter(Boolean).pop() || 'Page' });
  }

  const navTexts = internal
    .slice(0, 14)
    .map((l) => l.name)
    .filter((t) => t.length > 2 && t.length < 28 && !STOP_LINKS.test(t));

  const plain = body.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>`|]/g, ' ');
  const rawSummary = clean(plain).slice(0, 2400);
  const description = clean(plain).slice(0, 180);

  return { doc: null, title, description, ogImage: '', h1s, h2s, navTexts: [...new Set(navTexts)], internal, rawSummary, ldJson: [] };
}

/** Synthesize reader-style markdown from Microlink metadata (final safety net). */
function mdFromMeta(meta, url) {
  const t = meta.title || url;
  return `Title: ${t}\nURL Source: ${url}\n\nMarkdown Content:\n# ${t}\n\n${meta.description || ''}\n\n${meta.image ? `![preview](${meta.image})\n` : ''}`;
}

const isHtmlPayload = (text) => Boolean(text) && text.trimStart().startsWith('<');

/**
 * SITEMAP DISCOVERY — read /sitemap.xml (and common variants) for the FULL page
 * list. Fixes "adha adhura" crawling: sites like multi-tool platforms list
 * every studio/tool page there, far beyond what nav-links alone reveal.
 * Returns ranked URLs: tool/studio/product pages first, blog last.
 */
async function discoverSitemapUrls(origin) {
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/wp-sitemap.xml`,
  ];
  const found = new Set();
  for (const smUrl of candidates) {
    try {
      const xml = await Promise.race([
        proxyText(smUrl, { timeout: 9000 }),
        new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);
      if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      // sitemap index → descend one level into child sitemaps (max 5)
      if (/sitemapindex/i.test(xml)) {
        const children = locs.filter((l) => l.startsWith(origin)).slice(0, 5);
        for (const child of children) {
          try {
            const childXml = await Promise.race([
              proxyText(child, { timeout: 9000 }),
              new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
            ]);
            if (!childXml) continue;
            [...childXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].forEach((m) => {
              if (m[1].startsWith(origin)) found.add(m[1]);
            });
          } catch { /* keep going */ }
        }
      } else {
        locs.forEach((l) => {
          if (l.startsWith(origin)) found.add(l);
        });
      }
      if (found.size) break;
    } catch { /* try next variant */ }
  }
  const urls = [...found];
  const rank = (u) => {
    const path = u.replace(/^https?:\/\/[^/]+/, '').toLowerCase();
    if (path === '/' || path === '') return 0;
    if (/(studio|tool|product|app|feature|category|suite)s?\//.test(path)) return 1;
    if (/blog|news|article|post\//.test(path)) return 3;
    return 2;
  };
  return urls.sort((a, b) => rank(a) - rank(b));
}

/** Crawl a list of URLs in gentle batches, each URL bounded by a HARD
 *  deadline (Promise.race) so one dead proxy chain can never stall the whole
 *  deep-crawl. Stragglers are dropped silently. */
async function crawlBatched(urls, { batchSize = 9, gapMs = 300, perUrlDeadlineMs = 15000, onBatch = () => {} } = {}) {
  const grab = async (l) => {
    const timer = new Promise((resolve) => setTimeout(() => resolve(null), perUrlDeadlineMs));
    const work = (async () => {
      try {
        const html = await proxyText(l, { timeout: 9000 });
        if (!html) return null;
        const p = isHtmlPayload(html) ? parseHtml(html, l) : parseMarkdownPage(html, l);
        p.url = l;
        return p;
      } catch { return null; }
    })();
    return Promise.race([work, timer]);
  };
  const pages = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(grab));
    results.filter(Boolean).forEach((p) => pages.push(p));
    onBatch({ done: Math.min(i + batchSize, urls.length), total: urls.length, found: pages.length });
    if (i + batchSize < urls.length) await new Promise((r) => setTimeout(r, gapMs));
  }
  return pages;
}

// Section headings that are NOT tools — home/marketing copy used to leak into
// the tool registry as "Popular Tools", "Resources", "Every toolyou need…".
const JUNK_TOOL_NAME = /^(popular tools?|resources?|studios?|tools?|categories?|features?|faq|faqs|pricing|contact|about|home|blogs?|news|how it works|why (choose|us)|every (tool|thing)[\w\s.]*|get started|all tools|more|archive|docs|documentation|api docs|support|community|changelog|testimonials?|reviews?|login|sign ?up|menu|footer|sitemap|use ?cases?|solutions)\b/i;

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

  // ── PASS 1 (TRUTH): schema.org ItemList JSON-LD — the site's own machine-
  // readable tool registry. Studio tool grids are client-rendered, so this is
  // usually the ONLY place the real per-tool inventory is visible. Parsed for
  // ANY site that ships it — try/catch per block, malformed data is skipped.
  for (const p of pages) {
    for (const raw of p.ldJson || []) {
      try {
        const data = JSON.parse(raw);
        const nodes = Array.isArray(data) ? data : [data];
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          if (node['@type'] !== 'ItemList' || !Array.isArray(node.itemListElement)) continue;
          const studioGuess = p.title.split(/[|\-–—:]/)[0].trim().slice(0, 30) || 'Platform';
          if (studioGuess && !studios.includes(studioGuess)) studios.push(studioGuess);
          for (const el of node.itemListElement) {
            const name = typeof el === 'string' ? el : (el && (el.name || (el.item && el.item.name)));
            if (!name || typeof name !== 'string') continue;
            const desc = typeof el === 'object' && el && (typeof el.description === 'string'
              ? el.description
              : (el.item && typeof el.item.description === 'string' ? el.item.description : ''));
            const href = typeof el === 'object' && el && (el.url || (el.item && el.item.url));
            pushTool(name, studioGuess, desc || `${name} on ${domain}`, href || p.url);
          }
        }
      } catch { /* malformed JSON-LD — skip */ }
    }
  }

  const hasStructuredRegistry = toolsMap.size >= 12;

  for (const p of pages) {
    for (const nav of p.navTexts) {
      if (nav.split(' ').length <= 4 && !studios.includes(nav) && !JUNK_TOOL_NAME.test(nav)) studios.push(nav);
    }
    // URL-slug signals: a tool= query param is a per-tool address
    // (/studio/pdf?tool=timemachine → "Time Machine"-style entries); deep
    // multi-segment tool paths (/tool/x, /studios/pdf/merge) count too.
    try {
      const u = new URL(p.url);
      const path = u.pathname;
      const segs = path.split('/').filter(Boolean);
      const toolParam = u.searchParams.get('tool') || new URLSearchParams(u.hash.replace(/^#/, '')).get('tool');
      if (toolParam && /studio/i.test(path)) {
        const idName = toolParam.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
        const studioGuess = p.title.split(/[|\-–—:]/)[0].trim().slice(0, 30) || (segs[1] || '').replace(/\b\w/, (c) => c.toUpperCase());
        if (idName && !JUNK_TOOL_NAME.test(idName)) pushTool(idName, studioGuess, p.description || `${idName} on ${domain}`, p.url);
      } else if (segs.length >= 3 && /^(tool|tools|studio|studios|category|app|apps|feature|features|product|products|suite|suites)/i.test(path)) {
        const slugName = segs[segs.length - 1]
          .replace(/\.(html?|php)$/i, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim();
        const studioGuess = segs.slice(0, -1).join(' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 30);
        if (slugName && slugName.split(' ').length <= 7 && !JUNK_TOOL_NAME.test(slugName)) {
          pushTool(slugName, studioGuess, p.description || `${slugName} on ${domain}`, p.url);
          if (!studios.includes(studioGuess)) studios.push(studioGuess);
        }
      }
    } catch { /* malformed URL — skip */ }
    // Tool-like links (/tool/x, /category/z, /studio/y?tool=w) are gold —
    // a plain studio link is a STUDIO, not a tool.
    for (const l of p.internal) {
      try {
        // Garbled anchor guard: blog CTA widgets concatenate icon ligature
        // names + marketing copy ("arrow_forwardTry PDF Merger  free no
        // signupMerge…"). Such strings are NEVER tool names.
        if (!l.name || l.name.length > 32 || /arrow_forward|free no signup|^\s*try\s/i.test(l.name) || /[a-z]{4,}[A-Z]/.test(l.name)) continue;
        const u = new URL(l.href);
        const path = u.pathname;
        if (!/^(\/)(tool|tools|studio|category|app|feature|product)s?\//i.test(path) || !l.name) continue;
        const toolParam = u.searchParams.get('tool') || new URLSearchParams(u.hash.replace(/^#/, '')).get('tool');
        if (toolParam) {
          const idName = toolParam.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
          if (idName && !JUNK_TOOL_NAME.test(idName)) pushTool(idName, l.name, `${idName} in ${l.name} on ${domain}`, l.href);
        } else if (!/^\/studio\/[^/]+\/?$/i.test(path)) {
          const seg = path.split('/').filter(Boolean);
          const studioGuess = (seg[0] === 'tool' || seg[0] === 'tools' ? 'Tools' : seg[0].charAt(0).toUpperCase() + seg[0].slice(1));
          if (!JUNK_TOOL_NAME.test(l.name)) {
            pushTool(l.name, studioGuess, `${l.name} on ${domain}`, l.href);
            if (!studios.includes(studioGuess)) studios.push(studioGuess);
          }
        } else if (!studios.includes(l.name) && !JUNK_TOOL_NAME.test(l.name) && l.name.length <= 30) {
          studios.push(l.name);
        }
      } catch { /* malformed link — skip */ }
    }
  }

  // ── PASS 2 (fallback): page headings as tool names — ONLY for sites that
  // ship NO structured registry (large studio platforms skip this entirely,
  // otherwise home-page marketing headings pollute the tool list).
  if (!hasStructuredRegistry) {
    for (const p of pages) {
      for (const h of [...(p.h1s || []), ...p.h2s]) {
        const words = h.split(' ');
        if (words.length > 9) continue; // long marketing sentences → skip
        if (JUNK_TOOL_NAME.test(h)) continue;
        pushTool(h, p.title.split(/[|\-–—:]/)[0].trim().slice(0, 30) || 'Platform', h, p.url);
      }
    }
  }

  // Fallback: if nothing discovered, treat nav words as sections
  if (toolsMap.size === 0) {
    (studios.length ? studios : ['Core Platform', 'Features', 'Pricing']).forEach((s) =>
      pushTool(`${s}`, s, `Explore ${s} on ${domain}`, `https://${domain}`)
    );
  }

  let discoveredTools = [...toolsMap.values()];

  // STUDIO ROUND-ROBIN: interleave tools so consecutive posts/tools alternate
  // across studios. Otherwise a 73-tool platform yields posts (and
  // screenshots) from only the first studio alphabetically — the whole
  // campaign looked same-y and ignored most of the product.
  const byStudio = new Map();
  discoveredTools.forEach((t) => {
    const k = (t.studio || 'Platform').toLowerCase();
    if (!byStudio.has(k)) byStudio.set(k, []);
    byStudio.get(k).push(t);
  });
  const interleaved = [];
  let added = true;
  while (added) {
    added = false;
    for (const list of byStudio.values()) {
      if (list.length) {
        interleaved.push(list.shift());
        added = true;
      }
    }
  }
  discoveredTools = interleaved.slice(0, 100);

  const isStudioPlatform = discoveredTools.length >= 12 || studios.length >= 6;

  return {
    studios: studios.slice(0, 16),
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

export async function analyzeSite(targetUrl, { onStep = () => {}, maxPages = 34 } = {}) {
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
    onStep({ key: 'crawl3', label: 'Retrying live crawl routes…', progress: 15 });
    await new Promise((r) => setTimeout(r, 4000));
    homeHtml = await proxyText(url);
  }
  if (!homeHtml) {
    onStep({ key: 'crawl4', label: 'Trying reader service…', progress: 18 });
    homeHtml = await readerText(url);
  }
  if (!homeHtml) {
    onStep({ key: 'crawl5', label: 'Fetching site metadata…', progress: 20 });
    const meta = await microlinkMeta(url);
    if (meta) homeHtml = mdFromMeta(meta, url);
  }
  if (!homeHtml) {
    throw new Error(
      'Live crawl is busy right now — every free crawl route got rate-limited. Please press Start again in a minute; a retry usually succeeds.'
    );
  }

  onStep({ key: 'parse', label: 'Extracting brand DNA & structure…', progress: 25 });
  const home = isHtmlPayload(homeHtml) ? parseHtml(homeHtml, url) : parseMarkdownPage(homeHtml, url);
  home.url = url;

  // FULL-SITE discovery: sitemap first (every tool/studio page listed), then
  // nav links as fallback — dedup, drop assets, rank tool-pages first.
  onStep({ key: 'sitemap', label: 'Discovering every page via sitemap…', progress: 32 });
  const sitemapUrls = await discoverSitemapUrls(origin);
  const seenHrefs = new Set([url]);
  const linkBased = home.internal
    .map((l) => l.href)
    .filter((href) => !/\.(pdf|jpg|png|zip|xml)$/i.test(href));
  const crawlTargets = [];
  for (const href of [...sitemapUrls, ...linkBased]) {
    if (seenHrefs.has(href)) continue;
    seenHrefs.add(href);
    crawlTargets.push(href);
    if (crawlTargets.length >= maxPages - 1) break;
  }
  const pages = [home];
  if (crawlTargets.length) {
    const more = await crawlBatched(crawlTargets, {
      onBatch: ({ done, total, found }) => {
        onStep({ key: 'deep', label: `Deep-reading every page… ${done}/${total} (${found} parsed)`, progress: 40 + Math.round((done / total) * 15) });
      },
    });
    pages.push(...more);
  }

  onStep({ key: 'structure', label: 'Mapping studios, tools & capabilities…', progress: 58 });
  const structure = deriveStructure(pages, domain);

  // ── SCREENSHOT TARGETS: tools first, studios second, home last. Blogs,
  // legal pages, contact/footer links are NEVER screenshotted — the ZIP's
  // day folders pair each post with the screenshot of ITS OWN tool, so a
  // wrong-page capture here would poison the whole kit downstream.
  const JUNK_SHOT_PATH = /\/(blog|privacy|terms|about|contact|api-docs|sponsors|category|tag)(\/|$)/i;
  const shotCap = 30;

  const slugOf = (id) => String(id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'tool';
  const seenShotPaths = new Set();
  const toolShotTargets = (structure.discoveredTools || [])
    .map((t) => ({
      tool: t,
      // Normalize legacy #tool= fragments into ?tool= queries: screenshot
      // services never send fragments, and their caches collapse
      // fragment-only variants into ONE entry (= wrong tool's image).
      url: t.url ? t.url.replace(/#tool=/, '?tool=') : '',
    }))
    .filter(({ tool, url }) => url && !JUNK_SHOT_PATH.test(url))
    .filter(({ url }) => {
      try {
        const u = new URL(url);
        const key = `${u.pathname}?${u.search}`;
        if (seenShotPaths.has(key)) return false;
        seenShotPaths.add(key);
        return true;
      } catch {
        return false;
      }
    })
    .slice(0, 25)
    .map(({ tool, url }) => ({
      url,
      title: tool.name,
      description: `${tool.name} — ${tool.studio}${tool.description ? ` — ${tool.description.slice(0, 80)}` : ''}`,
      kind: 'tool',
      localName: `tool-${slugOf(toolIdFromUrl(url) || tool.name)}.jpg`,
    }));

  // Studio overview shots (fill remaining slots) — the honest fallback when a
  // specific tool capture is missing.
  const studioPaths = [];
  for (const t of structure.discoveredTools || []) {
    try {
      const p = new URL(t.url || '').pathname;
      const m = p.match(/^\/studio\/([a-z0-9-]+)\/?$/i);
      if (m && !studioPaths.some((s) => s.path === p)) studioPaths.push({ path: p, slug: m[1] });
    } catch { /* skip */ }
  }
  const remaining = Math.max(0, shotCap - 1 - toolShotTargets.length);
  const studioShotTargets = studioPaths.slice(0, remaining).map(({ path, slug }) => ({
    url: `${origin}${path}`,
    title: `${slug.charAt(0).toUpperCase() + slug.slice(1)} Studio`,
    description: `Live capture of ${slug} studio — all tools overview`,
    kind: 'studio',
    localName: `studio-${slug}.jpg`,
  }));

  const shotTargets = [
    { url, title: home.title || 'Landing Page', description: home.description || 'Hero & full platform view', kind: 'home', localName: 'desktop.jpg' },
    ...toolShotTargets,
    ...studioShotTargets,
  ];
  onStep({ key: 'screenshots', label: `Capturing live snapshots of ${toolShotTargets.length} tools + ${studioShotTargets.length} studios…`, progress: 68 });
  const screenshots = [];
  let homeShotImg = null;
  for (let i = 0; i < shotTargets.length; i++) {
    const t = shotTargets[i];
    const fname = t.localName || (i === 0 ? 'desktop.jpg' : `section-${i}.jpg`);
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
      setTimeout(() => {
        preloadImage(shotUrl, { cors: false, timeout: 12000 }).catch(() => {});
      }, i * 350); // stagger — be gentle with the free screenshot service
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
