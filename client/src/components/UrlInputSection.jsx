import React, { useState } from 'react';
import { 
  Globe, 
  ArrowRight, 
  Sparkles, 
  Sliders, 
  CheckCircle2, 
  Flame, 
  Share2, 
  Video, 
  Layers
} from 'lucide-react';

export default function UrlInputSection({ onStartAnalysis, isLoading }) {
  const [url, setUrl] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState([
    'Instagram',
    'LinkedIn',
    'Twitter/X',
    'TikTok'
  ]);

  const platformOptions = [
    { id: 'Instagram', label: 'Instagram', icon: '📸', desc: 'Reels 9:16 + Carousels' },
    { id: 'LinkedIn', label: 'LinkedIn', icon: '💼', desc: 'SaaS Growth & Deep Dives' },
    { id: 'Twitter/X', label: 'Twitter / X', icon: '🐦', desc: 'Viral Launch Threads' },
    { id: 'TikTok', label: 'TikTok', icon: '🎵', desc: 'Fast-Paced Demo Reels' },
    { id: 'YouTube Shorts', label: 'YT Shorts', icon: '🔴', desc: 'Tool Tutorials' },
    { id: 'Facebook', label: 'Facebook', icon: '👥', desc: 'High-CTR Ad Posts' }
  ];

  const sampleSites = [
    { name: 'Toolverse (100+ Tools)', url: 'https://toolverse-official.vercel.app/' },
    { name: 'Linear (SaaS)', url: 'https://linear.app' },
    { name: 'Shopify (E-comm)', url: 'https://shopify.com' },
    { name: 'Notion (Workspace)', url: 'https://notion.so' }
  ];

  const togglePlatform = (id) => {
    if (selectedPlatforms.includes(id)) {
      if (selectedPlatforms.length === 1) return; // keep at least one
      setSelectedPlatforms(selectedPlatforms.filter((p) => p !== id));
    } else {
      setSelectedPlatforms([...selectedPlatforms, id]);
    }
  };

  const selectAllPlatforms = () => {
    setSelectedPlatforms(platformOptions.map((p) => p.id));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    onStartAnalysis(url.trim(), customPrompt.trim(), selectedPlatforms);
  };

  const handleSelectSample = (sampleUrl) => {
    setUrl(sampleUrl);
  };

  return (
    <section className="relative pt-12 pb-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-pink-500/10 blur-[130px] pointer-events-none -z-10" />

      {/* Hero Badge */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-6 shadow-inner">
        <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
        <span>Autonomous AGI Marketing Agent • Deeply Explores Studios & Tools • 100% Automated</span>
      </div>

      {/* Main Title */}
      <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
        Turn Any Website Into a{' '}
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
          Viral Social Campaign
        </span>
      </h1>

      <p className="mt-4 text-base sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed">
        Our autonomous AGI agent crawls your entire website, explores all studios, tests key tools, takes real screenshots,
        and generates high-converting marketing photos and video reels — <span className="text-white font-semibold">100% on autopilot</span>.
      </p>

      {/* Form Card */}
      <div className="mt-10 max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 rounded-3xl glass-panel-glow text-left transition-all space-y-4">
          
          {/* URL Input Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative flex-1 w-full">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-indigo-400">
                <Globe className="w-5 h-5" />
              </div>
              <input
                type="text"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourwebsite.com (e.g. https://toolverse-official.vercel.app/)"
                className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-900/90 text-white placeholder:text-slate-500 border border-slate-700/70 focus:outline-none focus:border-indigo-500 text-sm sm:text-base font-medium transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2.5 transition-all transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Deep Exploring...</span>
                </>
              ) : (
                <>
                  <span>Auto-Pilot Launch</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Social Media Platform Selector */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                Select Target Social Platforms
              </label>
              <button
                type="button"
                onClick={selectAllPlatforms}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer font-medium"
              >
                Select All
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {platformOptions.map((p) => {
                const active = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 cursor-pointer ${
                      active
                        ? 'bg-indigo-950/60 border-indigo-500/50 text-white shadow-md shadow-indigo-500/10'
                        : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-base">{p.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold leading-tight">{p.label}</div>
                      <div className="text-[10px] text-slate-400 truncate">{p.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Prompt Toggle */}
          <div className="pt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1.5 font-medium transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showAdvanced ? 'Hide Optional Custom Prompt' : '+ Add Custom Instructions / Campaign Focus (Optional)'}</span>
            </button>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Zero manual work required • AI handles everything
            </span>
          </div>

          {/* Advanced Prompt Area */}
          {showAdvanced && (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 animate-in fade-in duration-200">
              <label className="block text-xs font-semibold text-slate-300">
                Custom Focus / Specific Offer (Optional)
              </label>
              <textarea
                rows={2}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. 'Highlight our 9 studios and 100+ free tools', 'Focus on 100% private client-side processing'..."
                className="w-full p-3 rounded-lg bg-slate-900 border border-slate-700/80 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </form>

        {/* Instant Fast Demo Clicks */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
          <span className="text-slate-400">Try Instant Sample:</span>
          {sampleSites.map((sample) => (
            <button
              key={sample.name}
              type="button"
              onClick={() => handleSelectSample(sample.url)}
              className="px-2.5 py-1 rounded-lg bg-slate-900/60 hover:bg-indigo-900/30 hover:border-indigo-500/40 border border-slate-800 text-slate-300 hover:text-indigo-200 transition text-[11px] cursor-pointer"
            >
              {sample.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
