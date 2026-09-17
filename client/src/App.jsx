import React, { useState, useEffect } from 'react';
import Header from './components/Header.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import UrlInputSection from './components/UrlInputSection.jsx';
import AnalysisProgressModal from './components/AnalysisProgressModal.jsx';
import StrategyRecommendation from './components/StrategyRecommendation.jsx';
import CampaignDashboard from './components/CampaignDashboard.jsx';
import { API_BASE } from './config.js';
import { standaloneAnalyze, standaloneGenerateCampaign } from './lib/standalone.js';
import { proxyText } from './lib/net.js';

export default function App() {
  const [keys, setKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('omnipost_keys');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
      hfKeyId: import.meta.env.VITE_HF_KEY_ID || '',
      hfKeySecret: import.meta.env.VITE_HF_KEY_SECRET || '',
      higgsfieldApiKey: import.meta.env.VITE_HIGGSFIELD_API_KEY || ''
    };
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [step, setStep] = useState('input'); // 'input' | 'analyzing' | 'strategy' | 'campaign'
  const [targetUrl, setTargetUrl] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [carouselPrompt, setCarouselPrompt] = useState('');
  const [websiteData, setWebsiteData] = useState(null);
  const [strategy, setStrategy] = useState(null);
  const [posts, setPosts] = useState([]);
  const [masterBrandPrompt, setMasterBrandPrompt] = useState('');
  const [masterImagePrompt, setMasterImagePrompt] = useState('');
  const [masterVideoPrompt, setMasterVideoPrompt] = useState('');
  const [masterBlueprint, setMasterBlueprint] = useState('');
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [engineMode, setEngineMode] = useState('auto'); // 'server' | 'standalone'
  const [liveStep, setLiveStep] = useState(null);
  const [genProgress, setGenProgress] = useState(null);
  // NO AUTOPILOT ANYWHERE: analysis starts on the user's click, the strategy
  // page waits, and generation starts only on "Accept AI Plan & Generate All".
  // No media is generated in the background — posts ship prompts; media lives
  // in the user's hands (and the ZIP).

  const handleSaveKeys = (newKeys) => {
    setKeys(newKeys);
    try {
      localStorage.setItem('omnipost_keys', JSON.stringify(newKeys));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  };

  const [selectedPlatforms, setSelectedPlatforms] = useState(['Instagram', 'LinkedIn', 'Twitter/X', 'TikTok']);

  // Step 1: Trigger autonomous analysis of URL — server first, standalone fallback
  const handleStartAnalysis = async (url, promptText, platforms, carouselText) => {
    const activePlatforms = platforms && platforms.length ? platforms : selectedPlatforms;
    setSelectedPlatforms(activePlatforms);
    setTargetUrl(url);
    setCustomPrompt(promptText || '');
    setCarouselPrompt(carouselText || '');
    setErrorMessage('');
    setStep('analyzing');
    setLiveStep({ key: 'crawl', label: 'Connecting…', progress: 4 });

    const finish = (wd, strat, mode) => {
      setWebsiteData(wd);
      setStrategy(strat);
      setEngineMode(mode);
      setLiveStep(null);
      setStep('strategy');
    };

    // 1) Try the API server when one is configured (local dev / self-host)
    if (API_BASE) {
      try {
        const response = await fetch(`${API_BASE}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            customPrompt: promptText,
            selectedPlatforms: activePlatforms,
            geminiApiKey: keys.geminiApiKey
          })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Website analysis failed');
        finish(data.websiteData, data.strategy, 'server');
        return;
      } catch (err) {
        console.warn('[App] Server engine unavailable, switching to browser standalone engine:', err.message);
      }
    }

    // 2) 100% browser engine — no server, no login, works everywhere
    try {
      const { websiteData: wd, strategy: strat } = await standaloneAnalyze(url, {
        customPrompt: promptText,
        geminiApiKey: keys.geminiApiKey,
        onStep: (s) => setLiveStep(s),
      });
      finish(wd, strat, 'standalone');
    } catch (err) {
      console.error(err);
      setLiveStep(null);
      setErrorMessage(err.message || 'Could not analyze website. Please check the URL.');
      setStep('input');
    }
  };

  // Step 2: Confirm post count & duration, generate all campaign media and copy
  const handleConfirmGeneration = async ({ days, totalPosts }) => {
    setIsGeneratingCampaign(true);
    setErrorMessage('');
    setGenProgress({ done: 0, total: totalPosts });

    const onPostDone = ({ index, total }) => setGenProgress({ done: index, total });

    try {
      if (engineMode === 'server' && API_BASE) {
        const response = await fetch(`${API_BASE}/api/generate-campaign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            websiteData,
            strategy,
            days,
            totalPosts,
            customPrompt,
            carouselPrompt,
            selectedPlatforms,
            geminiApiKey: keys.geminiApiKey,
            higgsfieldApiKey: keys.higgsfieldApiKey
          })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Failed to generate campaign posts');
        setPosts(data.posts || []);
        setMasterBrandPrompt(data.masterBrandPrompt || '');
        setMasterImagePrompt(data.masterImagePrompt || '');
        setMasterVideoPrompt(data.masterVideoPrompt || '');
        setMasterBlueprint(data.masterBlueprint || '');
      } else {
        const result = await standaloneGenerateCampaign({
          websiteData,
          strategy,
          days,
          totalPosts,
          customPrompt,
          carouselPrompt,
          selectedPlatforms,
          geminiApiKey: keys.geminiApiKey,
          onPostDone,
        });
        setPosts(result.posts || []);
        setMasterBrandPrompt(result.masterBrandPrompt || '');
        setMasterImagePrompt(result.masterImagePrompt || '');
        setMasterVideoPrompt(result.masterVideoPrompt || '');
        setMasterBlueprint(result.masterBlueprint || '');
        // Dashboard shows copy-only immediately. NO automatic media generation —
        // the user makes visuals from the per-post prompts (or the ZIP workflow).
        setStep('campaign');
        return;
      }
      setStep('campaign');
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Campaign generation failed.');
    } finally {
      setIsGeneratingCampaign(false);
      setGenProgress(null);
    }
  };

  // One-tap Regenerate — re-runs the full copy generation with the SAME plan
  const handleRegenerate = () => {
    if (isGeneratingCampaign) return;
    handleConfirmGeneration({
      days: strategy?.recommendedDays || 14,
      totalPosts: strategy?.recommendedPostCount || 10,
    });
  };

  const handleBackToInput = () => {
    // Back from the Auto-Pilot result page — keep the analysis data so a new
    // URL paste simply overwrites it; nothing is lost mid-session.
    setErrorMessage('');
    setStep('input');
  };

  const handleReset = () => {
    setStep('input');
    setWebsiteData(null);
    setStrategy(null);
    setPosts([]);
    setMasterBrandPrompt('');
    setMasterImagePrompt('');
    setMasterVideoPrompt('');
    setMasterBlueprint('');
    setTargetUrl('');
    setCustomPrompt('');
    setCarouselPrompt('');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090D16] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        hasGeminiKey={Boolean(keys.geminiApiKey)}
        hasHiggsfieldKey={Boolean(keys.higgsfieldApiKey)}
      />

      {/* Error Alert */}
      {errorMessage && (
        <div className="max-w-2xl mx-auto mt-4 px-4">
          <div className="p-4 rounded-2xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-center justify-between shadow-lg">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage('')}
              className="text-red-400 hover:text-white font-bold ml-4"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Views */}
      <main className="flex-1 pb-16">
        {step === 'input' && (
          <UrlInputSection
            onStartAnalysis={handleStartAnalysis}
            isLoading={false}
          />
        )}

        {step === 'analyzing' && (
          <AnalysisProgressModal
            isOpen={true}
            targetUrl={targetUrl}
            liveStep={liveStep}
          />
        )}

        {step === 'strategy' && strategy && websiteData && (
          <StrategyRecommendation
            websiteData={websiteData}
            strategy={strategy}
            onConfirmGeneration={handleConfirmGeneration}
            isGeneratingCampaign={isGeneratingCampaign}
            onBack={handleBackToInput}
          />
        )}

        {step === 'campaign' && (
          <CampaignDashboard
            posts={posts}
            strategy={strategy}
            websiteData={websiteData}
            masterBrandPrompt={masterBrandPrompt}
            masterImagePrompt={masterImagePrompt}
            masterVideoPrompt={masterVideoPrompt}
            masterBlueprint={masterBlueprint}
            higgsfieldApiKey={keys.higgsfieldApiKey}
            geminiApiKey={keys.geminiApiKey}
            onRegenerate={handleRegenerate}
            isGeneratingCampaign={isGeneratingCampaign}
            onReset={handleReset}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300 font-medium">OmniPost AI</span>
            <span>— Autonomous URL Marketing Machine</span>
          </div>
          <div>
            Built with deep website intelligence, Gemini & Higgsfield AI integrations
          </div>
        </div>
      </footer>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        keys={keys}
        onSaveKeys={handleSaveKeys}
      />
    </div>
  );
}
