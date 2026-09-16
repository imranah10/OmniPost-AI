import React, { useEffect, useState } from 'react';
import { Loader2, Globe, Camera, BrainCircuit, Sparkles, CheckCircle2 } from 'lucide-react';

export default function AnalysisProgressModal({ isOpen, targetUrl }) {
  if (!isOpen) return null;

  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    { title: 'Scraping & Reading Full Website Content', desc: 'Extracting headlines, features, value propositions, and offerings...', icon: Globe },
    { title: 'Capturing Live Website Screenshot', desc: 'Taking high-resolution snapshot to use in brand creative assets...', icon: Camera },
    { title: 'AI Brand & Persona Analysis', desc: 'Identifying target audience, tone of voice, and competitive advantage...', icon: BrainCircuit },
    { title: 'Formulating Optimal Campaign Strategy', desc: 'Calculating exact post count, video/image ratio, and multi-day cadence...', icon: Sparkles },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg p-6 sm:p-8 rounded-3xl glass-panel-glow border border-indigo-500/30 text-center overflow-hidden">
        {/* Glowing aura */}
        <div className="absolute -top-20 -left-20 w-48 h-48 bg-indigo-600/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-purple-600/30 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-5">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>

        <h3 className="font-heading text-xl font-bold text-white">
          Autonomous AI Engine Working...
        </h3>
        <p className="mt-1 text-xs text-indigo-300 font-mono truncate max-w-sm mx-auto">
          {targetUrl}
        </p>

        {/* Stepper list */}
        <div className="mt-6 space-y-3.5 text-left">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isDone = activeStep > idx;
            const isCurrent = activeStep === idx;

            return (
              <div
                key={idx}
                className={`p-3 rounded-xl border transition-all flex items-start gap-3.5 ${
                  isDone
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : isCurrent
                    ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200 ring-1 ring-indigo-500/20 shadow-lg shadow-indigo-500/10'
                    : 'bg-slate-900/30 border-slate-800/60 text-slate-500 opacity-60'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                  ) : (
                    <Icon className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`text-xs font-semibold ${isCurrent ? 'text-white' : ''}`}>
                    {step.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] text-slate-400">
          Everything is 100% automated. Generating complete marketing assets...
        </div>
      </div>
    </div>
  );
}
