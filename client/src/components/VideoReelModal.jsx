import React, { useState } from 'react';
import { 
  X, 
  Play, 
  Sparkles, 
  Copy, 
  Check, 
  Download, 
  ExternalLink, 
  Layers, 
  RefreshCw,
  Video,
  Clock,
  Volume2
} from 'lucide-react';
import { API_BASE } from '../config.js';

export default function VideoReelModal({ isOpen, onClose, post, brandName, higgsfieldApiKey, strategy, websiteData }) {
  if (!isOpen || !post || !post.videoScript) return null;

  const { videoScript } = post;
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isRenderingHiggsfield, setIsRenderingHiggsfield] = useState(false);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState(null);

  const scenes = videoScript.scenes || [];

  const handleCopyFullScript = () => {
    const text = `🎬 VIDEO REEL SCRIPT: ${post.hook}
Brand: ${brandName}
Target Duration: ${videoScript.duration || '30s'}
Audio Vibe: ${videoScript.audioVibe || 'Energetic tech lo-fi'}

SCENES & TIMECODES:
${scenes.map(s => `[${s.time || `Scene ${s.sceneNumber}`}]
• Visual: ${s.visualDirection}
• On-Screen Text: "${s.onScreenText}"
• Voiceover: "${s.voiceoverAudio}"
`).join('\n')}
Call to Action: ${post.callToAction}
`;
    navigator.clipboard.writeText(text);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleRenderHiggsfield = async () => {
    setIsRenderingHiggsfield(true);
    try {
      const res = await fetch(`${API_BASE}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${post.imagePrompt}, cinematic 9:16 vertical video, 4k ultra detailed, smooth camera glide`,
          imageUrl: post.generatedImageUrl,
          higgsfieldApiKey,
          videoScript,
          strategy,
          websiteData
        })
      });
      const data = await res.json();
      if (data.videoUrl) {
        setRenderedVideoUrl(data.videoUrl);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRenderingHiggsfield(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-[#0d1322] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-bold text-white text-base sm:text-lg">
                  Short-Form Video Reel Studio
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {post.platform} Reel / TikTok / Short
                </span>
              </div>
              <p className="text-xs text-slate-400">{post.day} • {videoScript.duration || '30s'} dynamic cut</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left: 9:16 Video Player Simulator */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="relative w-[280px] aspect-[9/16] rounded-3xl overflow-hidden border-4 border-slate-800 bg-slate-950 shadow-2xl shadow-purple-500/15 group">
              
              {/* Background Video */}
              <video
                key={renderedVideoUrl || post.videoUrl}
                src={renderedVideoUrl || post.videoUrl || "https://assets.mixkit.co/videos/preview/mixkit-futuristic-holographic-data-screen-42354-large.mp4"}
                autoPlay
                loop
                muted={isMuted}
                controls
                playsInline
                className="w-full h-full object-cover"
              />

              {/* Unmute/Mute Toggle overlay */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/70 hover:bg-black/90 text-white backdrop-blur-md border border-white/20 transition cursor-pointer"
                title={isMuted ? "Unmute Audio" : "Mute Audio"}
              >
                <Volume2 className={`w-4 h-4 ${isMuted ? 'text-slate-400 opacity-60' : 'text-emerald-400 animate-pulse'}`} />
              </button>

              {/* Gradient overlay for readability (simulator mode only) */}
              <div className={`absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/85 pointer-events-none ${post.videoUrl || renderedVideoUrl ? 'hidden' : ''}`} />

              {/* Top info badge */}
              <div className="absolute top-4 inset-x-4 flex items-center justify-between pointer-events-none">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-white border border-white/10">
                  {brandName}
                </span>
                <span className="text-[10px] font-semibold text-purple-300 bg-purple-900/60 px-2 py-0.5 rounded-md backdrop-blur-md">
                  {videoScript.duration || '30s'}
                </span>
              </div>

              {/* Center dynamic on-screen text for active scene */}
              <div className={`absolute inset-x-4 top-1/2 -translate-y-1/2 pointer-events-none text-center ${post.videoUrl || renderedVideoUrl ? 'hidden' : ''}`}>
                <div className="inline-block px-3 py-2 rounded-xl bg-black/75 backdrop-blur-lg border border-purple-500/40 shadow-xl max-w-full">
                  <p className="font-heading font-extrabold text-sm sm:text-base text-white tracking-wide leading-snug drop-shadow-md">
                    {scenes[activeSceneIndex]?.onScreenText || post.hook}
                  </p>
                </div>
              </div>

              {/* Bottom Caption / Audio Info */}
              <div className={`absolute bottom-4 inset-x-4 pointer-events-none space-y-2 ${post.videoUrl || renderedVideoUrl ? 'hidden' : ''}`}>
                <div className="text-[11px] font-semibold text-white/95 line-clamp-2 drop-shadow">
                  {post.hook}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-purple-300 bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-md w-fit">
                  <Volume2 className="w-3 h-3 text-purple-400 animate-pulse" />
                  <span className="truncate max-w-[170px]">{videoScript.audioVibe}</span>
                </div>
              </div>

            </div>

            {/* Scene Selectors */}
            <div className="flex items-center gap-2 mt-4">
              {scenes.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveSceneIndex(idx)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    activeSceneIndex === idx
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                >
                  Scene {idx + 1}
                </button>
              ))}
            </div>

            {post.videoUrl && (
              <a
                href={post.videoUrl}
                download
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/30 text-xs font-semibold border border-emerald-500/30 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Download rendered reel (MP4)
              </a>
            )}
          </div>

          {/* Right: Scene Breakdown & Voiceover Guide */}
          <div className="lg:col-span-7 space-y-5 text-left">
            
            {/* Audio & Hook Overview */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-400">Viral Opening Hook (0-3s)</span>
                <span className="text-purple-400 font-mono text-[11px]">Thumb-Stopper</span>
              </div>
              <p className="font-heading font-bold text-slate-100 text-sm sm:text-base">
                "{videoScript.hook || post.hook}"
              </p>
              <div className="pt-2 text-xs text-slate-400 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Recommended Vibe: <strong className="text-slate-200">{videoScript.audioVibe}</strong></span>
              </div>
            </div>

            {/* Scene-by-scene script cards */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                Scene Breakdown & Voiceover Directions
              </h4>

              {scenes.map((scene, idx) => (
                <div
                  key={idx}
                  onClick={() => setActiveSceneIndex(idx)}
                  className={`p-4 rounded-2xl border transition cursor-pointer ${
                    activeSceneIndex === idx
                      ? 'bg-purple-950/30 border-purple-500/50 shadow-lg shadow-purple-500/10'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Scene {scene.sceneNumber || idx + 1} ({scene.time || `${idx * 7}s - ${(idx + 1) * 7}s`})
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {activeSceneIndex === idx ? 'Previewing on Reel' : 'Click to preview'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="font-semibold text-slate-400">Visual Direction: </span>
                      <span className="text-slate-200">{scene.visualDirection}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-purple-300">On-Screen Text: </span>
                      <span className="text-white font-medium">"{scene.onScreenText}"</span>
                    </div>
                    <div className="pt-1 text-slate-300 italic bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                      <span className="font-semibold not-italic text-indigo-400">🎙️ Voiceover: </span>
                      "{scene.voiceoverAudio}"
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleCopyFullScript}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                {copiedScript ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Script Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-400" />
                    <span>Copy Full Script & Voiceover</span>
                  </>
                )}
              </button>

              {(post.videoUrl || renderedVideoUrl) && (
                <a
                  href={renderedVideoUrl || post.videoUrl}
                  download={`${brandName.replace(/\s+/g, '_')}_reel_${post.day}.mp4`}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Reel (.MP4)</span>
                </a>
              )}

              <button
                type="button"
                disabled={isRenderingHiggsfield}
                onClick={handleRenderHiggsfield}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/20 transition cursor-pointer disabled:opacity-50"
              >
                {isRenderingHiggsfield ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Rendering Video with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{higgsfieldApiKey ? 'Generate with Higgsfield API' : 'Re-Render Video Reel'}</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
