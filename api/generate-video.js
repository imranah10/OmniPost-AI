/**
 * Vercel serverless — optional Higgsfield video render bridge.
 *
 * POST { prompt, imageUrl, higgsfieldApiKey, videoScript, strategy, websiteData }
 *   → { videoUrl } on success
 *   → { error }    on any failure (client falls back to the FREE in-browser
 *                  canvas renderer, so the UX never breaks)
 *
 * The Higgsfield API contract is best-effort: we call their generation
 * endpoint with the user's key and poll briefly. If the contract/credits
 * fail, we return a clear error instead of pretending.
 */

const UA = 'OmniPost-AI/1.0 (+https://omnipost.ai)';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const {
    prompt = '',
    imageUrl = '',
    higgsfieldApiKey = '',
  } = req.body || {};

  if (!higgsfieldApiKey) {
    return res.status(400).json({ error: 'No Higgsfield API key provided (add it in Settings).' });
  }

  try {
    // 1) Kick off generation (image-to-video when an AI visual exists)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const genRes = await fetch('https://api.higgsfield.ai/v1/generate', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${higgsfieldApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        model: 'minimax-hailuo-02-standard',
        prompt: String(prompt).slice(0, 1800),
        ...(imageUrl ? { init_image: imageUrl } : {}),
        aspect_ratio: '9:16',
        duration: 6,
      }),
    }).finally(() => clearTimeout(timer));

    const genData = await genRes.json().catch(() => ({}));
    if (!genRes.ok) {
      return res.status(genRes.status).json({
        error: genData?.error?.message || genData?.message || `Higgsfield responded ${genRes.status}`,
      });
    }

    const jobId = genData.id || genData.job_id || genData.task_id;
    if (!jobId) {
      // Some contracts return the video directly
      const direct = genData.video_url || genData.url || genData.output?.[0];
      if (direct) return res.status(200).json({ videoUrl: direct });
      return res.status(502).json({ error: 'Higgsfield did not return a job id or video URL.' });
    }

    // 2) Poll briefly (function budget ~45s; longer renders fall back client-side)
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      const poll = await fetch(`https://api.higgsfield.ai/v1/jobs/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${higgsfieldApiKey}`, 'User-Agent': UA },
      });
      const pd = await poll.json().catch(() => ({}));
      const status = (pd.status || pd.state || '').toLowerCase();
      const videoUrl =
        pd.video_url || pd.output?.[0] || pd.result?.video_url || pd.result?.url || null;
      if (videoUrl && (status === 'succeeded' || status === 'completed' || status === 'done' || !status)) {
        return res.status(200).json({ videoUrl });
      }
      if (['failed', 'error', 'canceled', 'rejected'].includes(status)) {
        return res.status(502).json({ error: pd.error?.message || `Higgsfield job ${status}` });
      }
    }
    return res.status(202).json({ error: 'Higgsfield render still in progress after 40s — check your Higgsfield dashboard, or use the free in-browser render.' });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Higgsfield bridge failed' });
  }
}
