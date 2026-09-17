import React, { useState } from 'react';
import { 
  Sparkles, 
  Copy, 
  Check, 
  X, 
  Image as ImageIcon, 
  Video, 
  FileText, 
  Layers, 
  ExternalLink,
  Camera,
  Info,
  Download,
  ShieldCheck,
  Monitor
} from 'lucide-react';
import { getUnifiedScreenshots } from './CampaignDashboard.jsx';
import SmartShotImg from './SmartShotImg.jsx';
import { API_BASE } from '../config.js';
import { proxyImageBlob } from '../lib/net.js';

export default function MasterStudioModal({
  isOpen,
  onClose,
  strategy,
  websiteData,
  masterBrandPrompt,
  masterImagePrompt,
  masterVideoPrompt,
  masterBlueprint
}) {
  const [activeTab, setActiveTab] = useState('blueprint'); // 'blueprint' | 'image' | 'video' | 'screenshots' | 'brief'
  const [copiedType, setCopiedType] = useState(null);

  if (!isOpen) return null;

  const brandName = strategy?.brandName || websiteData?.title || 'Brand';
  const domain = websiteData?.domain || websiteData?.url || '';

  const allScreenshots = getUnifiedScreenshots ? getUnifiedScreenshots(websiteData) : [];

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2200);
  };

  const handleDownloadTextFile = (filename, content) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSingleShot = async (shot) => {
    try {
      const blob = await proxyImageBlob(shot.webUrl);
      if (!blob) throw new Error('Fetch failed');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = shot.fileName || 'screenshot.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      window.open(shot.webUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] rounded-3xl bg-[#0d121f] border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden text-left">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-900/60">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Sparkles className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Entire Website Master AI Studio & Prompts
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                100% "Hubahu" UI Guidance
              </span>
            </div>
            <h2 className="font-heading text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
              <span>{brandName} Master Studio</span>
              <span className="text-xs font-medium text-slate-400">({domain})</span>
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Copy-paste ready master prompts for any AI model (<strong className="text-slate-200">ChatGPT, Gemini, Midjourney, Higgsfield, Runway</strong>) with exact screenshot reference instructions and real site captures so nothing is ever missed.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-slate-800/80 bg-slate-950/50 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('blueprint')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'blueprint'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>📑 Master Brand Blueprint</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'image'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>🎨 Master Image Prompt</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'video'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>🎬 Master Video Reel Prompt</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('screenshots')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'screenshots'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>📸 All Captured Screenshots ({allScreenshots.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('brief')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'brief'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>📝 All-In-One Brief</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">

          {/* TAB 1: MASTER BRAND BLUEPRINT */}
          {activeTab === 'blueprint' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-blue-950/25 border border-blue-500/30 text-blue-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-blue-300">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>The Master Brand Blueprint (Architectural Truth Document):</span>
                </div>
                <p className="text-[11px] text-blue-200/90 leading-relaxed">
                  This blueprint covers 100% of the platform's features, suites, and screenshot references. Attach it alongside your prompt to ChatGPT, Gemini, or Claude to get 100% authentic, zero-hallucination results matching the website down to the finest detail.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-bold text-slate-300">
                    MASTER_BRAND_BLUEPRINT.md Preview:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(masterBlueprint, 'blueprint')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-blue-600/20"
                    >
                      {copiedType === 'blueprint' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Blueprint Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Blueprint</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadTextFile(`${brandName.replace(/\s+/g, '_')}_MASTER_BRAND_BLUEPRINT.md`, masterBlueprint)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download (.MD)</span>
                    </button>
                  </div>
                </div>

                <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto scrollbar-thin selection:bg-blue-600 selection:text-white">
                  {masterBlueprint}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 2: MASTER IMAGE PROMPT */}
          {activeTab === 'image' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Screenshots Guide Card */}
              <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-amber-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
                  <Camera className="w-4 h-4 text-amber-400" />
                  <span>Attach These Screenshots to ChatGPT (DALL-E 3) / Gemini / Midjourney:</span>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  For 100% authentic brand UI replication, attach the following screenshots directly into your chat session along with this prompt. ChatGPT/Gemini will inspect their structure and generate a 1:1 photorealistic commercial mockup:
                </p>

                {/* Screenshot badges */}
                <div className="flex flex-wrap gap-2 pt-1 max-h-40 overflow-y-auto scrollbar-thin">
                  {allScreenshots.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/50 border border-amber-500/20 text-[11px] text-slate-200"
                    >
                      {s.webUrl && (
                        <div className="relative w-6 h-6">
                          <SmartShotImg
                            src={s.webUrl}
                            alt={s.title}
                            className="w-6 h-6 rounded object-cover border border-slate-700"
                            maxTries={3}
                            gapMs={8000}
                          />
                        </div>
                      )}
                      <span className="font-mono font-semibold text-amber-300">{s.fileName}</span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                        ({s.title})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prompt Text Viewer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    Master Commercial Image Prompt (ChatGPT, Gemini, Midjourney, Stable Diffusion):
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(masterImagePrompt, 'image')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer shadow-md shadow-amber-500/20"
                  >
                    {copiedType === 'image' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Prompt Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Master Image Prompt</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin selection:bg-amber-500 selection:text-slate-950">
                  {masterImagePrompt}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: MASTER VIDEO PROMPT */}
          {activeTab === 'video' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Video Reference Frame Guide */}
              <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 text-purple-200 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-xs text-purple-300">
                  <Video className="w-4 h-4 text-purple-400" />
                  <span>Start Frame & Keyframe Guidance for Higgsfield / Runway / Luma / Sora:</span>
                </div>
                <p className="text-[11px] text-purple-200/90 leading-relaxed">
                  In Higgsfield or Runway Gen-3, select <strong>Image-to-Video</strong> mode and upload <code className="text-purple-300 font-mono bg-black/40 px-1 py-0.5 rounded">desktop.jpg</code> as the initial start frame. Paste this prompt to animate the real platform into a viral commercial reel:
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/50 border border-purple-500/30 text-[11px] text-slate-200">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                    <span className="font-mono font-bold text-purple-300">desktop.jpg</span>
                    <span className="text-[10px] text-slate-400">➔ Initial Camera Push-in Start Frame</span>
                  </div>
                  {allScreenshots[2] && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/50 border border-purple-500/30 text-[11px] text-slate-200">
                      <span className="font-mono font-bold text-purple-300">{allScreenshots[2].fileName}</span>
                      <span className="text-[10px] text-slate-400">➔ Mid-Transition Keyframe ({allScreenshots[2].title})</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Prompt Text Viewer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    Master Commercial Video Reel Prompt (9:16 Vertical & 16:9 Cinematic):
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(masterVideoPrompt, 'video')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-purple-600/20"
                  >
                    {copiedType === 'video' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Prompt Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Master Video Prompt</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin selection:bg-purple-500 selection:text-white">
                  {masterVideoPrompt}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: ALL CAPTURED SCREENSHOTS GALLERY */}
          {activeTab === 'screenshots' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-emerald-950/25 border border-emerald-500/30 text-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-300">
                    <Monitor className="w-4 h-4 text-emerald-400" />
                    <span>All Real Website Screenshots ({allScreenshots.length} Captures)</span>
                  </div>
                  <p className="text-[11px] text-emerald-200/90">
                    These screenshots are captured directly by the autonomous browser engine. Click any screenshot to download it — the full campaign ZIP bundles every capture too.
                  </p>
                </div>
              </div>

              {/* Screenshots Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[460px] overflow-y-auto p-1 scrollbar-thin">
                {allScreenshots.map((shot, sIdx) => (
                  <div
                    key={sIdx}
                    className="group rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition p-3 space-y-2.5 shadow-lg flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                        <SmartShotImg
                          src={shot.webUrl}
                          alt={shot.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur text-[10px] font-mono text-emerald-400 font-bold border border-emerald-500/30">
                          {shot.fileName}
                        </div>
                      </div>

                      <div className="text-left space-y-0.5">
                        <h4 className="text-xs font-bold text-white truncate" title={shot.title}>
                          {shot.title}
                        </h4>
                        <p className="text-[10px] text-slate-400 truncate" title={shot.description}>
                          {shot.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
                      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        {shot.type || 'Screenshot'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDownloadSingleShot(shot)}
                        className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer transition"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download JPG</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: ALL-IN-ONE MASTER STRATEGY BRIEF */}
          {activeTab === 'brief' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 text-indigo-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs text-indigo-300">
                  <Info className="w-4 h-4 text-indigo-400" />
                  <span>The Ultimate Master AI Prompt for ChatGPT (GPT-4o), Gemini & Claude:</span>
                </div>
                <p className="text-[11px] text-indigo-200/90 leading-relaxed">
                  This master document embeds the complete website DNA, all live-tested tools, USP, tone, target audience, plus the full image and video prompt specs. Paste it into any AI to generate infinite marketing materials!
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    Comprehensive Master Brand & Multi-Model Brief:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(masterBrandPrompt, 'brief')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-indigo-600/20"
                  >
                    {copiedType === 'brief' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Brief Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Full Master Brief</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto scrollbar-thin selection:bg-indigo-500 selection:text-white">
                  {masterBrandPrompt}
                </pre>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>The <strong className="text-slate-300">/all_website_screenshots/</strong> folder and <strong className="text-slate-300">MASTER_BRAND_BLUEPRINT.md</strong> are always included inside the exported ZIP bundle.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Close Studio
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

