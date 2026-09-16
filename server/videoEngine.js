import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import fsp from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { makeVideoSceneCards } from './imageEngine.js';

const ffmpegPath = ffmpegStatic || 'ffmpeg';
const TRANSITIONS = ['smoothleft', 'circleopen', 'fade', 'slideup', 'wipeleft'];

function runFfmpeg(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('ffmpeg timeout'));
    }, timeoutMs);
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-600)}`));
    });
  });
}

/**
 * Cinematic vertical reel builder (1080x1920 @ 30fps):
 * every scene gets a Ken-Burns zoom, premium crossfade transitions,
 * intro/outro fades and a web-optimized mp4 output.
 */
export function buildReelArgs(scenePaths, outPath) {
  const n = scenePaths.length;
  const SEG = 3;
  const FADE = 0.5;
  const FPS = 30;
  const W = 1080;
  const H = 1920;
  const frames = SEG * FPS;

  const args = [];
  for (const p of scenePaths) args.push('-i', p);

  const fc = [];
  scenePaths.forEach((_, i) => {
    const zoomExpr = i % 2 === 0
      ? 'min(zoom+0.0018,1.16)'
      : 'if(eq(on,0),1.16,max(zoom-0.0018,1.0))';
    fc.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,` +
      `zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p[v${i}]`
    );
  });

  let prev = 'v0';
  let offset = SEG - FADE;
  for (let i = 1; i < n; i++) {
    const t = TRANSITIONS[(i - 1) % TRANSITIONS.length];
    fc.push(`[${prev}][v${i}]xfade=transition=${t}:duration=${FADE}:offset=${offset.toFixed(2)}[x${i}]`);
    prev = `x${i}`;
    offset += SEG - FADE;
  }

  const total = n * SEG - (n - 1) * FADE;
  fc.push(`[${prev}]fade=t=in:st=0:d=0.35,fade=t=out:st=${(total - 0.45).toFixed(2)}:d=0.45,format=yuv420p[vout]`);

  const audioFilter = `aevalsrc=sin(2*PI*85*t)*exp(-5*mod(t\\,0.5)) + sin(2*PI*320*t)*0.22*exp(-8*mod(t\\,0.25)) + sin(2*PI*640*t)*0.08*exp(-14*mod(t\\,0.125)):s=44100:d=${total.toFixed(2)},volume=2.2`;

  args.push('-f', 'lavfi', '-i', audioFilter);

  args.push(
    '-filter_complex', fc.join(';'),
    '-map', '[vout]',
    '-map', `${n}:a`,
    '-t', total.toFixed(2),
    '-r', String(FPS),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outPath
  );
  return args;
}
async function tryHiggsfield({ prompt, imagePath, apiKey }) {
  if (!apiKey) throw new Error('No Higgsfield API key provided');

  // Support Key <key_id>:<secret>, Bearer <token>, or plain key
  const authHeaders = [];
  const cleanKey = apiKey.trim();
  if (cleanKey.toLowerCase().startsWith('key ') || cleanKey.toLowerCase().startsWith('bearer ')) {
    authHeaders.push(cleanKey);
  } else if (cleanKey.includes(':')) {
    authHeaders.push(`Key ${cleanKey}`);
  } else {
    authHeaders.push(`Key ${cleanKey}`);
    authHeaders.push(`Bearer ${cleanKey}`);
  }

  const endpoints = [
    'https://api.higgsfield.ai/higgsfield-ai/seedance/v2.5/standard',
    'https://api.higgsfield.ai/v1/generate'
  ];

  let lastError = null;

  for (const auth of authHeaders) {
    for (const url of endpoints) {
      try {
        console.log(`[VideoEngine] Trying Higgsfield API: ${url} with auth style ${auth.split(' ')[0]}...`);
        const payload = {
          prompt: prompt || 'Dynamic cinematic product showcase, energetic camera glide, ultra high quality',
          aspect_ratio: '9:16',
          duration: 5
        };

        const res = await axios.post(url, payload, {
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });

        // 1. Direct video URL in response
        const directUrl =
          res.data?.video_url ||
          res.data?.output_url ||
          res.data?.data?.[0]?.url ||
          res.data?.result?.video_url;

        if (directUrl) {
          console.log('[VideoEngine] Higgsfield returned direct video URL!');
          return directUrl;
        }

        // 2. Asynchronous job with status_url or request_id
        const statusUrl = res.data?.status_url || (res.data?.request_id ? `https://api.higgsfield.ai/v1/status/${res.data.request_id}` : null);
        if (statusUrl) {
          console.log(`[VideoEngine] Higgsfield job submitted. Polling status: ${statusUrl}...`);
          // Poll for up to 30s
          const start = Date.now();
          while (Date.now() - start < 30000) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
              const pollRes = await axios.get(statusUrl, {
                headers: { Authorization: auth },
                timeout: 10000
              });

              const st = pollRes.data?.status?.toLowerCase();
              if (st === 'completed' || st === 'succeeded' || st === 'done') {
                const vid =
                  pollRes.data?.video_url ||
                  pollRes.data?.output_url ||
                  pollRes.data?.data?.[0]?.url ||
                  pollRes.data?.result?.video_url;
                if (vid) {
                  console.log('[VideoEngine] Higgsfield job completed successfully!');
                  return vid;
                }
              } else if (st === 'failed' || st === 'error') {
                throw new Error(pollRes.data?.error || 'Higgsfield job reported failure');
              }
            } catch (pollErr) {
              console.warn('[VideoEngine] Higgsfield poll tick notice:', pollErr.message);
            }
          }
        }
      } catch (err) {
        lastError = err;
        console.warn(`[VideoEngine] Higgsfield attempt notice (${url}):`, err.response?.data || err.message);
      }
    }
  }

  throw lastError || new Error('Higgsfield video generation could not complete');
}

/**
 * Generates a complete vertical marketing reel for one post.
 * 1) Tries the Higgsfield API (if the user supplied a key).
 * 2) Falls back to a locally rendered cinematic reel via FFmpeg:
 *    hook card -> campaign visual -> CTA card, zoom + crossfades.
 */
export async function renderReelVideo({
  post,
  imagePath,
  strategy,
  websiteData,
  outDir,
  webPrefix,
  index,
  higgsfieldApiKey
}) {
  const videosDir = path.join(outDir, 'videos');
  await fsp.mkdir(videosDir, { recursive: true });
  const outPath = path.join(videosDir, `reel-${index}.mp4`);

  if (higgsfieldApiKey) {
    try {
      const remote = await tryHiggsfield({
        prompt: `${post.imagePrompt || post.hook} — cinematic 9:16 vertical, premium brand ad`,
        imagePath: imagePath && !imagePath.startsWith('/') ? imagePath : '',
        apiKey: higgsfieldApiKey
      });
      return { url: remote, provider: 'Higgsfield AI', remote: true, path: null };
    } catch (e) {
      console.warn('[VideoEngine] Higgsfield failed, falling back to local FFmpeg reel:', e.response?.status || e.message);
    }
  }

  try {
    const { hookCard, ctaCard } = await makeVideoSceneCards({ post, strategy, websiteData, outDir, index });
    const scenes = [hookCard];

    // 1. If post has real input state screenshot, include it before the creative visual
    if (post.inputScreenshotUrl) {
      const inputFs = webUrlToFs(post.inputScreenshotUrl);
      if (inputFs) {
        try {
          await fsp.access(inputFs);
          scenes.push(inputFs);
        } catch {}
      }
    }

    // 2. Creative visual / AI generated visual card
    if (imagePath && !imagePath.startsWith('http')) {
      try {
        await fsp.access(imagePath);
        scenes.push(imagePath);
      } catch {
        /* skip missing source image */
      }
    }

    // 3. If post has real output execution screenshot, include it after the creative visual
    if (post.outputScreenshotUrl) {
      const outputFs = webUrlToFs(post.outputScreenshotUrl);
      if (outputFs && outputFs !== imagePath) {
        try {
          await fsp.access(outputFs);
          scenes.push(outputFs);
        } catch {}
      }
    }

    scenes.push(ctaCard);

    await runFfmpeg(buildReelArgs(scenes, outPath));
    const stat = await fsp.stat(outPath);
    if (stat.size < 10000) throw new Error('rendered video too small');

    return {
      url: `${webPrefix}/videos/reel-${index}.mp4`,
      provider: 'OmniPost Cinematic Engine (FFmpeg)',
      remote: false,
      path: outPath
    };
  } catch (e) {
    console.warn('[VideoEngine] FFmpeg reel failed:', e.message);
    return null;
  }
}
/* Map a /generated/... web URL back to its filesystem path */
function webUrlToFs(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/^\/generated\/(.+)$/);
  if (!m) return null;
  return path.join(process.cwd(), 'server', 'generated', m[1]);
}

/**
 * Manual render endpoint used by the Reel Studio modal.
 * Tries Higgsfield (if key), else renders a local cinematic reel.
 */
export async function renderHiggsfieldVideo({
  prompt,
  imageUrl,
  apiKey,
  videoScript,
  outDir,
  webPrefix,
  strategy,
  websiteData
}) {
  const brand = strategy?.brandName || 'OmniPost AI';
  const safeSite = websiteData || { palette: undefined, domain: '' };

  if (apiKey) {
    try {
      const remote = await tryHiggsfield({
        prompt: prompt || videoScript?.hook || 'Cinematic premium brand reel',
        imagePath: imageUrl && /^https?:\/\//.test(imageUrl) ? imageUrl : '',
        apiKey
      });
      return { success: true, videoUrl: remote, provider: 'Higgsfield AI', status: 'completed' };
    } catch (e) {
      console.warn('[VideoEngine] Higgsfield manual render failed:', e.response?.status || e.message);
    }
  }

  try {
    const ts = Date.now();
    const post = {
      hook: videoScript?.hook || videoScript?.scenes?.[0]?.onScreenText || prompt || 'Watch now',
      callToAction:
        videoScript?.scenes?.slice(-1)[0]?.onScreenText ||
        (safeSite.domain ? `Visit ${safeSite.domain}` : 'Link in bio')
    };
    const { hookCard, ctaCard } = await makeVideoSceneCards({
      post,
      strategy: { ...strategy, brandName: brand },
      websiteData: safeSite,
      outDir,
      index: `m${ts}`
    });

    const scenes = [hookCard];
    if (imageUrl) {
      const localPath = webUrlToFs(imageUrl);
      if (localPath) {
        try {
          await fsp.access(localPath);
          scenes.push(localPath);
        } catch { /* skip */ }
      } else if (/^https?:\/\//.test(imageUrl)) {
        try {
          const resp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
          const tmp = path.join(outDir, 'videos', `remote-${ts}.jpg`);
          await fsp.mkdir(path.dirname(tmp), { recursive: true });
          await fsp.writeFile(tmp, resp.data);
          scenes.push(tmp);
        } catch { /* skip */ }
      }
    }
    scenes.push(ctaCard);

    const outPath = path.join(outDir, 'videos', `reel-manual-${ts}.mp4`);
    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    await runFfmpeg(buildReelArgs(scenes, outPath));

    return {
      success: true,
      videoUrl: `${webPrefix}/videos/reel-manual-${ts}.mp4`,
      provider: 'OmniPost Cinematic Engine (FFmpeg)',
      status: 'completed'
    };
  } catch (e) {
    console.error('[VideoEngine] Manual reel render failed:', e.message);
    return { success: false, error: e.message || 'Video render failed' };
  }
}
