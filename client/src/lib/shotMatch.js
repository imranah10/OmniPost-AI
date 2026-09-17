/**
 * shotMatch.js — Match each campaign post to the screenshot of ITS OWN tool.
 *
 * Fixes the core ZIP complaint: day folders were named after a tool but the
 * screenshots inside were picked by modulo index over the crawl order, so a
 * "Time Machine" folder could contain a blog or Privacy page capture.
 *
 * The analyzer now captures per-tool screenshots keyed by the tool= URL param
 * (Toolverse emits ?tool=<id> in its JSON-LD ItemList; the site opens that
 * tool directly). This module resolves a post → its own screenshot:
 *
 *   1. exact tool URL match  (shot.pageUrl === tool.url, path + tool id)
 *   2. tool-id match         (?tool= / #tool= equal on any studio path)
 *   3. name ⇄ id match       ("Digital Shadow" ⇄ digital-shadow / digitalshadow)
 *   4. studio page match     (plain /studio/<studio> capture, no tool=)
 *   5. homepage fallback     (desktop.jpg)
 *
 * It NEVER returns a blog / legal / footer page screenshot, because the
 * analyzer only captures home, studio and tool pages now.
 */

const normId = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normPath = (s) => {
  try {
    const u = new URL(s);
    return u.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
};

/** Extract tool id from a URL's ?tool= or #tool= (hash form kept for older JSON-LD). */
export function toolIdFromUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.searchParams.get('tool') ||
      new URLSearchParams(u.hash.replace(/^#/, '')).get('tool') ||
      ''
    );
  } catch {
    return '';
  }
}

function isHomeUrl(url) {
  const p = normPath(url);
  return p === '/' || p === '';
}

function isStudioUrl(url) {
  return /\/studio\/[a-z0-9-]+\/?$/i.test(normPath(url));
}

/**
 * Find the screenshot that actually shows `toolName` (inside `studio`).
 * @returns {object|null} the matched screenshot entry (webUrl/localName/…)
 */
export function shotForTool(websiteData, { toolName, studio, toolUrl } = {}) {
  const shots = websiteData?.capturedScreenshots || websiteData?.screenshots || [];
  if (!shots.length) return null;

  const shotsPageUrls = shots.map((s) => s.pageUrl || s.webUrl || '');

  // 1) exact tool URL match (path + tool id both equal)
  if (toolUrl) {
    const wantId = toolIdFromUrl(toolUrl);
    const wantPath = normPath(toolUrl);
    for (let i = 0; i < shots.length; i++) {
      if (!shots[i].pageUrl) continue;
      if (normPath(shots[i].pageUrl) === wantPath && (!wantId || toolIdFromUrl(shots[i].pageUrl) === wantId)) {
        return shots[i];
      }
    }
  }

  const wantToolId = normId(toolIdFromUrl(toolUrl || '') || toolName);
  if (wantToolId) {
    // 2) same tool id on any path
    for (let i = 0; i < shots.length; i++) {
      if (toolIdFromUrl(shotsPageUrls[i]) && normId(toolIdFromUrl(shotsPageUrls[i])) === wantToolId) {
        return shots[i];
      }
    }
    // 3) name ⇄ id containment (handles "Time Machine" vs timemachine / time-machine)
    for (let i = 0; i < shots.length; i++) {
      const id = normId(toolIdFromUrl(shotsPageUrls[i]));
      if (!id) continue;
      if (id.includes(wantToolId) || wantToolId.includes(id)) return shots[i];
    }
  }

  // 4) studio page match (plain /studio/<x> capture)
  const studioSlug = normId(studio);
  for (let i = 0; i < shots.length; i++) {
    if (!shots[i].pageUrl) continue;
    if (!toolIdFromUrl(shotsPageUrls[i]) && isStudioUrl(shotsPageUrls[i]) && studioSlug) {
      const m = normPath(shotsPageUrls[i]).match(/\/studio\/([a-z0-9-]+)/i);
      if (m && normId(m[1]) === studioSlug) return shots[i];
    }
  }

  // 5) homepage fallback — honest generic capture, never a wrong tool's page
  for (let i = 0; i < shots.length; i++) {
    if (shots[i].pageUrl && isHomeUrl(shots[i].pageUrl)) return shots[i];
  }
  return shots[0] || null;
}

/**
 * Resolve the tool object a post refers to (Gemini posts only carry a name).
 * Exact/normalized name match against discoveredTools — never modulo index.
 */
export function toolObjectForPost(websiteData, toolName) {
  const tools = websiteData?.discoveredTools || [];
  if (!tools.length) return null;
  const want = normId(toolName);
  if (!want) return null;
  let partial = null;
  for (const t of tools) {
    const id = normId(t.name);
    if (id === want) return t;
    if (!partial && (id.includes(want) || want.includes(id))) partial = t;
  }
  return partial;
}
