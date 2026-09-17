import { useEffect, useRef, useState } from 'react';
import { isPlaceholderImg } from '../lib/net.js';
import { Loader2 } from 'lucide-react';

/**
 * SmartShotImg — a screenshot <img> that NEVER shows the mshots black
 * "generating" placeholder (the blank cards users reported).
 *
 * Lifecycle:
 *  - loading   : first fetch in flight → subtle shimmer
 *  - capturing : upstream still generating (400x300 placeholder detected) →
 *                shimmer + "Capturing live view…" while quietly re-polling
 *  - done      : real capture → rendered (onResolved fired)
 *  - failed    : placeholder never resolved after maxTries → renders nothing
 *                and fires onFailed, so the parent can drop the dead card
 *                instead of showing a blank.
 *
 * The <img> element stays MOUNTED the whole time (hidden while pending) so
 * loads keep advancing under the shimmer — unmounting it would freeze the
 * poll loop.
 */
export default function SmartShotImg({
  src,
  alt = '',
  className = '',
  onResolved,
  onFailed,
  maxTries = 6,
  gapMs = 10000,
}) {
  const [phase, setPhase] = useState('loading'); // loading | capturing | done | failed
  const [renderSrc, setRenderSrc] = useState(src);
  const imgRef = useRef(null);
  const triesRef = useRef(0);
  const aliveRef = useRef(true);
  const timerRef = useRef(null);
  const cbRef = useRef({ onResolved, onFailed });
  cbRef.current = { onResolved, onFailed };

  useEffect(() => {
    aliveRef.current = true;
    triesRef.current = 0;
    setPhase('loading');
    setRenderSrc(src);
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [src]);

  const scheduleRetry = () => {
    if (!aliveRef.current) return;
    if (triesRef.current >= maxTries) {
      setPhase('failed');
      cbRef.current.onFailed?.();
      return;
    }
    triesRef.current += 1;
    setPhase('capturing');
    timerRef.current = setTimeout(() => {
      if (!aliveRef.current) return;
      const sep = src.includes('?') ? '&' : '?';
      setRenderSrc(`${src}${sep}cb=${Date.now()}`); // fresh fetch — never a stale browser cache
    }, gapMs);
  };

  const inspect = (el) => {
    if (!aliveRef.current || !el) return;
    if (el.naturalWidth === 0) {
      scheduleRetry(); // broken load — retry with cache buster
      return;
    }
    if (isPlaceholderImg(el, 1280)) {
      scheduleRetry(); // upstream "generating" placeholder — keep waiting
      return;
    }
    setPhase('done');
    cbRef.current.onResolved?.();
  };

  // Images restored from browser memory can complete before React attaches
  // onLoad — inspect on mount / src change as well.
  useEffect(() => {
    if (imgRef.current?.complete) inspect(imgRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderSrc]);

  if (phase === 'failed') return null;

  return (
    <div className="relative w-full h-full">
      <img
        ref={imgRef}
        src={renderSrc}
        alt={alt}
        loading="lazy"
        className={`${className} ${phase === 'done' ? '' : 'opacity-0'}`}
        onLoad={(e) => inspect(e.target)}
        onError={() => scheduleRetry()}
      />
      {phase !== 'done' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90">
          <div className="absolute inset-0 overflow-hidden animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-600/25 to-transparent" />
          </div>
          <Loader2 className="w-5 h-5 text-indigo-300 animate-spin" />
          <span className="text-[10px] font-semibold text-slate-300 px-2 text-center leading-tight">
            {phase === 'capturing' ? 'Capturing live view…' : 'Loading snapshot…'}
          </span>
        </div>
      )}
    </div>
  );
}
