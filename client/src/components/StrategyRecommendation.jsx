import React, { useMemo, useState } from 'react';
import { 
  Sparkles, 
  Calendar, 
  Layers, 
  Video, 
  Image as ImageIcon, 
  ExternalLink, 
  Check, 
  ArrowRight, 
  ArrowLeft, 
  SlidersHorizontal,
  Bot,
  Target,
  Flame,
  Zap,
  Download,
  Eye,
  Maximize2,
  X
} from 'lucide-react';
import SmartShotImg from './SmartShotImg.jsx';

const shotKindLabel = (shot) =>
  shot?.kind === 'tool' ? 'Tool' : shot?.kind === 'home' ? 'Homepage' : 'Studio';

export default function StrategyRecommendation({ 
  websiteData, 
  strategy, 
  onConfirmGeneration, 
  isGeneratingCampaign,
  onBack
}) {
  const [days, setDays] = useState(strategy.recommendedDays || 14);
  const [totalPosts, setTotalPosts] = useState(strategy.recommendedPostCount || 10);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedStudioTab, setSelectedStudioTab] = useState('all');
  // Screenshots that never resolved from mShots' "generating" placeholder —
  // their cards are removed from the gallery (a blank is NEVER shown) and the
  // counters below update live as pending captures finish or die.
  const [failedShots, setFailedShots] = useState(() => new Set());
  const [resolvedShots, setResolvedShots] = useState(() => new Set());
  const allCaptured = websiteData.capturedScreenshots || websiteData.screenshots || [];
  const visibleShots = useMemo(
    () => allCaptured.filter((s) => !failedShots.has(s.webUrl)),
    [allCaptured, failedShots]
  );
  const markFailedShot = (url) =>
    setFailedShots((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  const markResolvedShot = (url) =>
    setResolvedShots((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  // NO AUTOPILOT. Generation starts ONLY when the user clicks
  // "Accept AI Plan & Generate All" (or the custom-generate button).

  const videoCount = strategy.recommendedBreakdown?.videoReels || Math.floor(totalPosts * 0.4);
  const imageCount = strategy.recommendedBreakdown?.imagePosts || (totalPosts - videoCount);

  const handleDownloadScreenshot = (e, shot) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = shot.webUrl;
    link.download = `${(shot.title || 'screenshot').toLowerCase().replace(/[^a-z0-9]/gi, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleQuickAccept = () => {
    onConfirmGeneration({
      days: strategy.recommendedDays || 14,
      totalPosts: strategy.recommendedPostCount || 10
    });
  };

  const handleCustomConfirm = () => {
    onConfirmGeneration({
      days,
      totalPosts
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Back button — the Auto-Pilot result page must never be a dead end */}
      {onBack && (
        <div className="mb-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-indigo-400" />
            <span>Back</span>
          </button>
        </div>
      )}
      {/* Top Banner */}
      <div className="p-6 sm:p-8 rounded-3xl glass-panel border border-indigo-500/30 relative overflow-hidden shadow-2xl">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Website Intelligence Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left info */}
          <div className="lg:col-span-7 space-y-4 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" />
                AI Website Analysis Complete
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {strategy.industry}
              </span>
              {strategy.engine === 'gemini' ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Written by Google Gemini
                </span>
              ) : (
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/40 flex items-center gap-1.5"
                  title={strategy.geminiError || 'Add a Gemini key in Settings for AI-written strategy'}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Smart Engine
                </span>
              )}
            </div>

            {strategy.engine !== 'gemini' && (
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                {strategy.geminiError
                  ? `⚠ Gemini unavailable even after auto-retries: ${strategy.geminiError} — the ready-to-use plan below was written by the built-in Smart Engine.`
                  : 'Tip: add a free Gemini API key in Settings (⚙️) — strategy & captions will be written by Google Gemini instead of the built-in Smart Engine.'}
              </p>
            )}

            <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-white">
              {strategy.brandName}
            </h2>

            <p className="text-sm text-slate-300 leading-relaxed">
              <span className="text-slate-400 font-medium">Core Value Prop: </span>
              {strategy.uniqueSellingPoint}
            </p>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Target className="w-4 h-4 text-pink-400 shrink-0" />
              <span>
                <strong className="text-slate-200">Target Audience:</strong> {strategy.targetAudience}
              </span>
            </div>

            <div className="pt-1">
              <a
                href={websiteData.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition underline underline-offset-4"
              >
                <span>Visit {websiteData.domain}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Right Live Screenshot Card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950/80 shadow-xl group">
              <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  <span className="ml-2 font-mono text-[11px] truncate max-w-[180px]">
                    {websiteData.domain}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Snapshot
                </span>
              </div>
              <div className="relative aspect-[16/10] bg-slate-900 flex items-center justify-center overflow-hidden">
                <img
                  src={websiteData.screenshotUrl}
                  alt={`Screenshot of ${websiteData.domain}`}
                  className="w-full h-full object-cover object-top hover:scale-105 transition duration-500"
                  onError={(e) => {
                    // Fallback to ogImage or placeholder
                    if (websiteData.ogImage) e.target.src = websiteData.ogImage;
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Website Health Check — Automated Testing Report */}
        {websiteData.testReport && (
          <div className="mt-8 p-6 rounded-2xl glass-panel border border-slate-800 text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex items-center gap-4 shrink-0">
                <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center border ${
                  websiteData.testReport.score >= 75
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : websiteData.testReport.score >= 60
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  <span className="text-xl font-black font-heading">{websiteData.testReport.score}</span>
                  <span className="text-[9px] uppercase tracking-wider">Grade {websiteData.testReport.grade}</span>
                </div>
                <div>
                  <h4 className="font-heading text-sm font-bold text-white flex items-center gap-2">
                    Website Health Check
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {websiteData.testReport.pagesChecked} pages tested
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Automated browser testing: load speed, JS errors, broken links, SEO tags</p>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {(websiteData.testReport.checks || []).map((chk, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2 rounded-lg border ${
                      chk.pass
                        ? 'bg-emerald-950/20 border-emerald-500/25 text-emerald-200'
                        : 'bg-amber-950/20 border-amber-500/25 text-amber-200'
                    }`}
                  >
                    <span className="mt-0.5 font-bold">{chk.pass ? '✓' : 'ℹ'}</span>
                    <span>
                      <strong>{chk.name}:</strong> {chk.pass ? 'Passed & Optimized' : 'Notice'}
                    </span>
                  </div>
                ))}
              </div>

              {websiteData.mobileScreenshotUrl && (
                <div className="shrink-0 w-20 rounded-xl overflow-hidden border border-slate-700/80 hidden lg:block">
                  <img src={websiteData.mobileScreenshotUrl} alt="Mobile view" className="w-full h-32 object-cover object-top" />
                  <div className="px-1.5 py-1 text-[9px] text-center text-slate-400 bg-slate-900">Mobile</div>
                </div>
              )}
            </div>

            {websiteData.palette && websiteData.palette.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-3 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">Brand palette (auto-extracted):</span>
                <div className="flex items-center gap-1.5">
                  {(websiteData.palette || []).map((c, i) => (
                    <span key={i} className="w-5 h-5 rounded-md border border-white/20" style={{ backgroundColor: c }} title={c} />
                  ))}
                </div>
                <span className="font-mono text-[10px]">{(websiteData.palette || []).join(' · ')}</span>
              </div>
            )}
          </div>
        )}

        {/* Autonomous AGI Deep Exploration — Discovered Studios & Tools Gallery */}
        {((websiteData.studios && websiteData.studios.length > 0) || (websiteData.capturedScreenshots && websiteData.capturedScreenshots.length > 0)) && (
          <div className="mt-8 p-6 rounded-3xl bg-slate-900/70 border border-indigo-500/30 text-left space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <h4 className="font-heading text-base font-bold text-white">
                    {websiteData.isStudioPlatform
                      ? 'Deep AGI Exploration: Discovered Studios & Tools'
                      : 'Deep AGI Exploration: Discovered Sections & Services'}
                  </h4>
                </div>
                <p className="text-xs text-slate-400">
                  {websiteData.isStudioPlatform
                    ? 'AI thoroughly explored your website, opened studios, tested key tools, and captured live screenshots for campaign assets.'
                    : 'AI thoroughly explored your website, scanned all core business sections, verified key offerings, and captured live screenshots for campaign assets.'}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 self-start sm:self-auto">
                {(websiteData.studios?.length || 0) > 0
                  ? `${websiteData.studios.length} ${websiteData.isStudioPlatform ? 'Studios' : 'Key Sections'}`
                  : `${websiteData.discoveredTools?.length || 0} Tools`}
                {' • '}
                {visibleShots.length} Live Screenshots
              </span>
            </div>

            {/* Studio / Section badges */}
            {websiteData.studios && websiteData.studios.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {websiteData.studios.map((s, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs font-semibold text-slate-200 flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* Captured screenshots preview grid */}
            {visibleShots.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2.5">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Captured {websiteData.isStudioPlatform ? 'Tool & Studio' : 'Section & Service'} Live Snapshots ({visibleShots.length}):
                  </span>
                  <span className="text-[11px] text-slate-400">Click any card to zoom • Arrow button to download</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {visibleShots.map((shot, idx) => (
                    <div
                      key={shot.webUrl || idx}
                      onClick={() => resolvedShots.has(shot.webUrl) && setPreviewImage(shot)}
                      className="rounded-xl overflow-hidden border border-slate-800 hover:border-indigo-500/60 bg-slate-950/90 shadow-md group relative aspect-[16/10] cursor-pointer transition duration-300 hover:shadow-indigo-500/20 hover:shadow-lg"
                    >
                      <SmartShotImg
                        src={shot.webUrl}
                        alt={shot.title}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition duration-500"
                        onResolved={() => markResolvedShot(shot.webUrl)}
                        onFailed={() => markFailedShot(shot.webUrl)}
                      />

                      {/* Top Action overlay: Download & Maximize */}
                      <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-emerald-400 border border-emerald-500/30">
                          {shotKindLabel(shot)}
                        </span>
                        <div className="flex items-center gap-1 pointer-events-auto">
                          <button
                            onClick={(e) => handleDownloadScreenshot(e, shot)}
                            title="Download Screenshot"
                            className="p-1.5 rounded-lg bg-black/80 hover:bg-black text-white hover:text-emerald-400 border border-white/20 transition cursor-pointer shadow-md"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Bottom Info Bar */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2.5">
                        <div className="text-[11px] font-bold text-white truncate flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="truncate">{shot.title}</span>
                        </div>
                        <div className="text-[9px] text-indigo-300 truncate mt-0.5">
                          {shot.testAction || shot.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comprehensive All 100+ Discovered Tools & Studios Directory */}
            {websiteData.discoveredTools && websiteData.discoveredTools.length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <h5 className="font-heading text-sm font-bold text-white">
                      Complete Tool Catalog ({websiteData.discoveredTools.length} Tools Discovered)
                    </h5>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      ⚡ {(websiteData.capturedScreenshots || []).filter((s) => s.captured === true).length || (resolvedShots.size || 0)} Verified Live Captures
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 font-semibold">
                      📋 {websiteData.discoveredTools.length} Total Discovered
                    </span>
                  </div>
                </div>

                {/* Studio filter tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => setSelectedStudioTab('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      selectedStudioTab === 'all'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({websiteData.discoveredTools.length})
                  </button>
                  {websiteData.studios?.map((st, i) => {
                    const stClean = st.toLowerCase().trim();
                    const count = websiteData.discoveredTools.filter(t => {
                      const s = (t.studio || '').toLowerCase().trim();
                      const c = (t.category || '').toLowerCase().trim();
                      return s === stClean || s.includes(stClean) || stClean.includes(s) || c.includes(stClean);
                    }).length;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedStudioTab(st)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                          selectedStudioTab === st
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-slate-800/80 text-slate-400 hover:text-white'
                        }`}
                      >
                        {st} {count > 0 ? `(${count})` : ''}
                      </button>
                    );
                  })}
                </div>

                {/* Tools Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                  {websiteData.discoveredTools
                    .filter(t => {
                      if (selectedStudioTab === 'all') return true;
                      const stClean = selectedStudioTab.toLowerCase().trim();
                      const s = (t.studio || '').toLowerCase().trim();
                      const c = (t.category || '').toLowerCase().trim();
                      return s === stClean || s.includes(stClean) || stClean.includes(s) || c.includes(stClean);
                    })
                    .map((tool, tIdx) => (
                      <div
                        key={tIdx}
                        className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition ${
                          tool.isTested
                            ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/60'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold text-white truncate" title={tool.name}>
                              {tool.name}
                            </span>
                            {tool.isTested && (
                              <span className="text-[8px] font-bold px-1 rounded bg-emerald-500/20 text-emerald-300 shrink-0">
                                TESTED
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] text-slate-400 truncate mt-0.5">
                            {tool.studio}
                          </div>
                        </div>
                        {tool.testAction && (
                          <div className="text-[8px] text-emerald-400 truncate mt-1 pt-1 border-t border-slate-800/60">
                            {tool.testAction}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Autonomous Strategy Recommendation Banner */}
        <div className="mt-8 pt-8 border-t border-slate-800/80">
          <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/70 via-purple-950/50 to-slate-900 border border-indigo-500/40 shadow-xl text-left">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              
              {/* Recommendation Details */}
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <span className="font-heading text-sm uppercase tracking-wider font-bold text-indigo-300">
                    AI Autonomous Strategy Recommendation
                  </span>
                </div>

                <h3 className="font-heading text-2xl sm:text-3xl font-extrabold text-white flex flex-wrap items-center gap-3">
                  <span>{strategy.recommendedPostCount} High-Impact Posts</span>
                  <span className="text-slate-500 font-light">over</span>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-pink-400">
                    {strategy.recommendedDays} Days
                  </span>
                </h3>

                <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                  {strategy.rationale}
                </p>

                {/* Media Distribution Badge */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-200">
                    <Video className="w-3.5 h-3.5 text-purple-400" />
                    {strategy.recommendedBreakdown?.videoReels || 4} Short-Form Video Reels
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-blue-500/15 border border-blue-500/30 text-blue-200">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                    {strategy.recommendedBreakdown?.imagePosts || 6} Visual Cards & Carousels
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Formats: Instagram, LinkedIn, Twitter/X, TikTok
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
                <button
                  type="button"
                  disabled={isGeneratingCampaign}
                  onClick={handleQuickAccept}
                  className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:to-pink-400 text-white font-bold text-sm sm:text-base shadow-xl shadow-indigo-500/30 flex items-center justify-center gap-2.5 transition transform active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isGeneratingCampaign ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generating Posts & Media...</span>
                    </>
                  ) : (
                    <>
                      <span>Accept AI Plan & Generate All</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowCustomizer(!showCustomizer)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-xs font-semibold text-slate-300 border border-slate-700/80 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{showCustomizer ? 'Close Adjustments' : 'Customize Days / Post Count'}</span>
                </button>
              </div>
            </div>

            {/* Customizer Slider Panel */}
            {showCustomizer && (
              <div className="mt-6 pt-6 border-t border-slate-800/80 space-y-6 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Days Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        Campaign Duration
                      </span>
                      <span className="text-indigo-400 font-bold font-mono">{days} Days</span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={30}
                      value={days}
                      onChange={(e) => setDays(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>3 days (Sprint)</span>
                      <span>14 days (Recommended)</span>
                      <span>30 days (Full Month)</span>
                    </div>
                  </div>

                  {/* Post Count Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-400" />
                        Total Posts to Generate
                      </span>
                      <span className="text-purple-400 font-bold font-mono">{totalPosts} Posts</span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={25}
                      value={totalPosts}
                      onChange={(e) => setTotalPosts(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>5 posts</span>
                      <span>10 posts (Recommended)</span>
                      <span>25 posts (Power Blast)</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={isGeneratingCampaign}
                    onClick={handleCustomConfirm}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
                  >
                    <span>Generate Custom {totalPosts} Posts Over {days} Days</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Full Lightbox Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-5xl w-full max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {previewImage.studio || 'Studio View'}
                </span>
                <h4 className="text-sm font-bold text-white truncate max-w-md">
                  {previewImage.title}
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.webUrl}
                  download={`${(previewImage.title || 'screenshot').toLowerCase().replace(/[^a-z0-9]/gi, '_')}.png`}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Full HD</span>
                </a>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Image Preview Body */}
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-black/50">
              <img 
                src={previewImage.webUrl} 
                alt={previewImage.title}
                className="max-h-[70vh] w-auto object-contain rounded-lg border border-slate-800 shadow-2xl" 
              />
            </div>

            {/* Test Action Footer */}
            {previewImage.testAction && (
              <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                <span className="font-bold text-emerald-400">🧪 AGI Automated Test Action:</span>
                <span>{previewImage.testAction}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
