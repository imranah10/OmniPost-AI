import React from 'react';
import { Sparkles, Key, Globe, ShieldCheck, Zap } from 'lucide-react';

export default function Header({ onOpenSettings, hasGeminiKey, hasHiggsfieldKey }) {
  return (
    <header className="border-b border-slate-800/80 bg-[#0b1120]/80 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/25 flex items-center justify-center">
            <div className="w-full h-full bg-[#090D16] rounded-[14px] flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-heading text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-indigo-300">
                OmniPost AI
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                AutoMarket Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">100% Autonomous URL-to-Campaign AI Agent</p>
          </div>
        </div>

        {/* Center Highlights */}
        <div className="hidden md:flex items-center gap-6 text-xs text-slate-400 font-medium">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Deep Scrapes Any URL</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>AI Auto-Decides Post Count</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            <span>Images + Video Reels</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900/90 hover:bg-slate-800 hover:text-white border border-slate-700/70 transition-all shadow-sm group"
          >
            <Key className="w-3.5 h-3.5 text-indigo-400 group-hover:rotate-45 transition-transform" />
            <span>API Keys</span>
            {(hasGeminiKey || hasHiggsfieldKey) ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            ) : (
              <span className="text-[10px] text-indigo-300/80 bg-indigo-500/20 px-1.5 py-0.5 rounded">Free Mode</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
