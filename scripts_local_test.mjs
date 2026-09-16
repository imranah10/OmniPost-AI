// Local test server that mirrors the Vercel deployment:
// static client/dist + same-origin /api/proxy (same logic as api/proxy.js)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 4173;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

app.get('/api/proxy', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const target = req.query.url;
  if (!target || !/^https?:\/\//i.test(target)) return res.status(400).json({ error: 'bad url' });
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254|::1/i.test(target)) return res.status(400).json({ error: 'blocked' });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const upstream = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,image/*;q=0.9,*/*;q=0.8' },
    });
    clearTimeout(timer);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/html');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).send(buf);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'client/dist')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'client/dist/index.html')));

app.listen(PORT, () => console.log(`test server on :${PORT}`));
