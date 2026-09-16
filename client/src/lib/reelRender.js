/**
 * reelRender.js — 100% FREE in-browser video reel renderer (no API key).
 *
 * Takes AI still frames + the video script scenes and renders a real,
 * downloadable WebM video using Canvas + MediaRecorder:
 *   - Ken Burns motion (slow zoom/pan) on every frame
 *   - Scene-by-scene on-screen text from the video script
 *   - Brand badge + hook + progress bar
 *
 * Works fully offline-in-browser, so "users never leave the platform".
 */

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
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

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

/**
 * Render the reel. Returns { blob, url, mimeType, width, height, durationMs }.
 * frames: array of image srcs (one per scene; last one repeats if shorter).
 */
export async function renderReelWebM({
  frames = [],
  scenes = [],
  hook = '',
  brand = '',
  palette = [],
  width = 720,
  height = 1280,
  sceneSeconds = 3.5,
  fps = 30,
  onProgress = () => {},
} = {}) {
  const mime = pickMime();
  if (!mime) throw new Error('Video recording is not supported in this browser.');
  if (!scenes.length) throw new Error('No scenes to render.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const accent = palette[0] || '#7c5cff';
  const accent2 = palette[1] || '#2dd4bf';

  // Preload frames (fallback: branded gradient background)
  const loaded = [];
  for (let i = 0; i < scenes.length; i++) {
    const src = frames[i % Math.max(1, frames.length)];
    let el = null;
    if (src) {
      try {
        el = await loadImageEl(src);
      } catch {
        el = null;
      }
    }
    loaded.push(el);
    onProgress({ phase: 'frames', index: i + 1, total: scenes.length });
  }

  const totalMs = scenes.length * sceneSeconds * 1000;
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };

  const done = new Promise((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  rec.start(250);
  const t0 = performance.now();

  await new Promise((resolve) => {
    const draw = () => {
      const now = performance.now() - t0;
      const sceneIdx = Math.min(scenes.length - 1, Math.floor(now / (sceneSeconds * 1000)));
      const sceneT = Math.min(1, Math.max(0, (now - sceneIdx * sceneSeconds * 1000) / (sceneSeconds * 1000)));
      const scene = scenes[sceneIdx] || {};

      // ---- background image with Ken Burns
      const img = loaded[sceneIdx];
      const g0 = ctx.createLinearGradient(0, 0, width, height);
      g0.addColorStop(0, '#0b0f1a');
      g0.addColorStop(1, '#141b2e');
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, width, height);

      if (img) {
        const zoom = 1.04 + sceneT * 0.09;
        const panX = Math.sin(sceneIdx * 2.1) * 26 * sceneT;
        const panY = Math.cos(sceneIdx * 1.7) * 18 * sceneT;
        const r = Math.max(width / img.naturalWidth, height / img.naturalHeight) * zoom;
        const dw = img.naturalWidth * r;
        const dh = img.naturalHeight * r;
        ctx.drawImage(img, (width - dw) / 2 + panX, (height - dh) / 2 + panY, dw, dh);
      }

      // ---- scrims
      const gTop = ctx.createLinearGradient(0, 0, 0, height * 0.22);
      gTop.addColorStop(0, 'rgba(5,8,16,0.75)');
      gTop.addColorStop(1, 'rgba(5,8,16,0)');
      ctx.fillStyle = gTop;
      ctx.fillRect(0, 0, width, height * 0.22);

      const gBot = ctx.createLinearGradient(0, height * 0.55, 0, height);
      gBot.addColorStop(0, 'rgba(5,8,16,0)');
      gBot.addColorStop(0.75, 'rgba(5,8,16,0.88)');
      gBot.addColorStop(1, 'rgba(5,8,16,0.97)');
      ctx.fillStyle = gBot;
      ctx.fillRect(0, height * 0.55, width, height * 0.45);

      // ---- brand badge (top-left)
      ctx.font = '800 30px system-ui, -apple-system, Segoe UI, sans-serif';
      const brandW = ctx.measureText(brand).width + 44;
      ctx.fillStyle = 'rgba(5,8,16,0.65)';
      roundRectPath(ctx, 28, 30, brandW, 54, 27);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      roundRectPath(ctx, 28, 30, brandW, 54, 27);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(brand, 50, 66);

      // ---- scene counter (top-right)
      ctx.font = '700 24px system-ui, sans-serif';
      const cnt = `${sceneIdx + 1}/${scenes.length}`;
      const cw = ctx.measureText(cnt).width + 36;
      ctx.fillStyle = 'rgba(5,8,16,0.65)';
      roundRectPath(ctx, width - cw - 28, 34, cw, 44, 22);
      ctx.fill();
      ctx.fillStyle = accent2;
      ctx.fillText(cnt, width - cw - 10, 65);

      // ---- on-screen text (from script)
      const text = scene.onScreenText || hook || '';
      const lines = wrapLines(ctx, text, width - 120).slice(0, 4);
      let ty = height - 300 - (lines.length - 1) * 62;
      ctx.font = '800 52px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      for (const line of lines) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(line, width / 2 + 3, ty + 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, width / 2, ty);
        ty += 62;
      }

      // ---- caption strip (voiceover hint)
      ctx.font = '500 26px system-ui, sans-serif';
      const vo = (scene.voiceoverAudio || '').slice(0, 64);
      if (vo) {
        const vw = Math.min(width - 96, ctx.measureText(vo).width + 48);
        ctx.fillStyle = 'rgba(124,92,255,0.28)';
        roundRectPath(ctx, (width - vw) / 2, height - 200, vw, 52, 26);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(vo, width / 2, height - 165);
      }
      ctx.textAlign = 'left';

      // ---- progress bar (top)
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, 0, width, 8);
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width * (now / totalMs), 8);

      if (now >= totalMs) {
        resolve();
        return;
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });

  rec.stop();
  const blob = await done;
  onProgress({ phase: 'encode', index: scenes.length, total: scenes.length });

  // Track object URLs so callers can revoke
  const url = URL.createObjectURL(blob);
  return { blob, url, mimeType: mime, width, height, durationMs: totalMs };
}
