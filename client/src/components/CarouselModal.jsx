import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Loader2, GalleryHorizontal } from 'lucide-react';
import { renderFullCarousel } from '../lib/carousel.js';

/**
 * CarouselModal — swipeable branded carousel preview for any post.
 * Slides render instantly on canvas (no network, no key) and can be
 * downloaded as ready-to-post PNGs.
 */
export default function CarouselModal({ post, strategy, websiteData, onClose }) {
  const [slides, setSlides] = useState([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const touchX = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const dataUrls = await renderFullCarousel(post, strategy, websiteData);
        if (!alive) return;
        setSlides(dataUrls);
      } catch (err) {
        if (alive) setError(err.message || 'Could not render carousel');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [post, strategy, websiteData]);

  const next = () => setIdx((i) => Math.min(slides.length - 1, i + 1));
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  const downloadAll = async () => {
    if (!slides.length) return;
    setIsExporting(true);
    try {
      for (let i = 0; i < slides.length; i++) {
        const a = document.createElement('a');
        a.href = slides[i];
        a.download = `${(post.day || 'post').replace(/\s+/g, '-')}_${post.toolName || 'carousel'}_slide-${i + 1}.png`.replace(/[^a-zA-Z0-9._-]/g, '-');
        document.body.appendChild(a);
        a.click();
        a.remove();
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      setIsExporting(false);
    }
  };

  if (!post) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0]?.clientX - touchX.current;
        if (dx < -50) next();
        else if (dx > 50) prev();
        touchX.current = null;
      }}
    >
      <div className="relative w-full max-w-md bg-[#0e1626] border border-slate-700/80 rounded-3xl shadow-2xl p-5 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-28 bg-indigo-500/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
              <GalleryHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Carousel Preview</h3>
              <p className="text-[11px] text-slate-400">
                {post.day} · {post.platform} · {post.toolName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slide area */}
        <div className="relative mt-4 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800">
          {loading ? (
            <div className="h-[480px] flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
              <span className="text-xs">Rendering branded slides…</span>
            </div>
          ) : error ? (
            <div className="h-[480px] flex items-center justify-center text-center px-6 text-sm text-red-300">
              {error}
            </div>
          ) : (
            <>
              <img
                src={slides[idx]}
                alt={`Slide ${idx + 1}`}
                className="w-full h-[480px] object-contain select-none"
                draggable={false}
              />
              {idx > 0 && (
                <button
                  onClick={prev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/55 hover:bg-black/80 text-white transition cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {idx < slides.length - 1 && (
                <button
                  onClick={next}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/55 hover:bg-black/80 text-white transition cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Dots + counter */}
        {!loading && !error && slides.length > 0 && (
          <div className="flex items-center justify-center gap-2 mt-3">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  i === idx ? 'w-6 bg-indigo-400' : 'w-2 bg-slate-600 hover:bg-slate-500'
                }`}
              />
            ))}
            <span className="ml-2 text-[11px] text-slate-400 font-medium">
              {idx + 1}/{slides.length}
            </span>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={downloadAll}
            disabled={loading || !slides.length || isExporting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{isExporting ? 'Downloading…' : `Download all ${slides.length || ''} slides (PNG)`}</span>
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500 text-center">
          Slides use your live brand palette — included in the campaign ZIP under 06_CAROUSELS/
        </p>
      </div>
    </div>
  );
}
