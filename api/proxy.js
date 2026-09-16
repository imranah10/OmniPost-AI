/**
 * Vercel serverless function — same-origin CORS proxy.
 * Deploys WITH the static site, so the standalone browser engine gets a
 * reliable proxy with zero external dependencies and no API keys.
 *
 * Usage: /api/proxy?url=<encoded-url>
 *  - Streams text or binary (images) through with permissive CORS.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const target = req.query.url;
  if (!target || !/^https?:\/\//i.test(target)) {
    return res.status(400).json({ error: 'missing or invalid url param' });
  }
  // Block obvious SSRF/localhost targets
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254|::1/i.test(target)) {
    return res.status(400).json({ error: 'blocked target' });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const upstream = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);

    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');

    const buf = Buffer.from(await upstream.arrayBuffer());
    // Hard cap ~25MB (function memory safety)
    if (buf.length > 25 * 1024 * 1024) {
      return res.status(502).json({ error: 'upstream too large' });
    }
    res.status(upstream.status).send(buf);
  } catch (err) {
    res.status(502).json({ error: err.message || 'proxy fetch failed' });
  }
}
