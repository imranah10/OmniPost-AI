import React, { useState } from 'react';
import { X, Key, ShieldCheck, Video, Sparkles, Check, ExternalLink, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { testGeminiKey } from '../lib/aiClient.js';

export default function SettingsModal({ isOpen, onClose, keys, onSaveKeys }) {
  if (!isOpen) return null;

  const [geminiKey, setGeminiKey] = useState(keys.geminiApiKey || '');
  const [hfKeyId, setHfKeyId] = useState(keys.hfKeyId || (keys.higgsfieldApiKey?.includes(':') ? keys.higgsfieldApiKey.split(':')[0] : ''));
  const [hfKeySecret, setHfKeySecret] = useState(keys.hfKeySecret || (keys.higgsfieldApiKey?.includes(':') ? keys.higgsfieldApiKey.split(':')[1] : ''));
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, error }

  const handleTestKey = async () => {
    if (!geminiKey.trim() || testing) return;
    setTesting(true);
    setTestResult(null);
    const result = await testGeminiKey(geminiKey.trim());
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const combinedHf = hfKeyId.trim() && hfKeySecret.trim() ? `${hfKeyId.trim()}:${hfKeySecret.trim()}` : (hfKeySecret.trim() || hfKeyId.trim());
    onSaveKeys({
      geminiApiKey: geminiKey.trim(),
      hfKeyId: hfKeyId.trim(),
      hfKeySecret: hfKeySecret.trim(),
      higgsfieldApiKey: combinedHf
    });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0e1626] border border-slate-700/80 rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-indigo-500/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-bold text-white">AI Provider Keys</h3>
              <p className="text-xs text-slate-400">Keys are stored locally in your browser</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="mt-6 space-y-5">
          {/* Gemini Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:underline flex items-center gap-1"
              >
                Get Free Gemini Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700/80 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
            <p className="text-[11px] text-slate-400">
              Powers AI strategy + campaign copy. Without it the built-in Smart Engine runs everything (still 100% free).
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={!geminiKey.trim() || testing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-slate-200 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-indigo-300" />}
                {testing ? 'Testing…' : 'Test Key'}
              </button>
              {testResult?.ok && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Key works — AI copy enabled
                </span>
              )}
              {testResult && !testResult.ok && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400" title={testResult.error}>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="line-clamp-1">{testResult.error}</span>
                </span>
              )}
            </div>
          </div>

          {/* Higgsfield Key ID & Secret */}
          <div className="space-y-3 pt-1 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-purple-400" />
                Higgsfield AI Video Keys
              </label>
              <a
                href="https://cloud.higgsfield.ai"
                target="_blank"
                rel="noreferrer"
                className="text-purple-400 hover:underline flex items-center gap-1"
              >
                Higgsfield Cloud <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                HF_API_KEY_ID (UUID)
              </label>
              <input
                type="text"
                value={hfKeyId}
                onChange={(e) => setHfKeyId(e.target.value)}
                placeholder="your-higgsfield-key-id..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                HF_API_KEY_SECRET
              </label>
              <input
                type="password"
                value={hfKeySecret}
                onChange={(e) => setHfKeySecret(e.target.value)}
                placeholder="e48b770d7016c81a..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>

            <p className="text-[11px] text-slate-400">
              Used for generating high-motion cinematic video reels with Higgsfield Cloud.
            </p>
          </div>

          {/* Autonomous Fallback Notice */}
          <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 flex items-start gap-3 text-xs text-indigo-200">
            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Zero Setup Required: </span>
              If no keys are provided, OmniPost AI's built-in Autonomous Heuristic AI + Pollinations HD generation engine will run 100% free of charge!
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save API Keys</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
