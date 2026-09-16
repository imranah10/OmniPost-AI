# 🚀 OmniPost AI — Autonomous URL-to-Campaign Marketing Machine

> **100% browser-based — NO backend needed.** Paste any website URL: OmniPost crawls every page, captures live screenshots, extracts the brand palette, auto-decides the campaign duration, writes day-wise posts with captions + hashtags, generates AI marketing artwork & video prompts, and packs EVERYTHING into one ZIP you can feed to ChatGPT / Gemini / Midjourney / Runway / Higgsfield.
> Works with zero API keys (free heuristic engine + free Pollinations image AI). Add a Gemini API key in Settings for CMO-grade AI copywriting.

An intelligent, fully automated marketing platform that reads any website URL, performs comprehensive automated research, captures live website screenshots, evaluates brand identity, automatically determines optimal campaign duration and post count, and generates complete multi-day social media campaigns ($15–$30 agency quality posts, captions, hashtags, ultra-HD images, and short-form video reels).

---

## ✨ Features

- 🌐 **Deep Website Scraper & Live Screenshot**: Scrapes page content, hero text, headlines, value props, and captures live high-res desktop screenshots.
- 🧠 **Autonomous AI Strategist**: 
  - Detects business type (B2B SaaS, E-Commerce, Agency, Mobile App, etc.).
  - Automatically calculates and suggests optimal post count & campaign duration (e.g. *10 posts over 14 days: 4 Video Reels + 6 Visual Cards*).
  - Provides a flexible slider if the user wants to customize days (3–30) and post count (3–25).
- 🎯 **Optional Custom Prompt**: Allows entering specific targets (e.g. *"Focus on our 30% discount launch"* or *"Target tech founders on LinkedIn"*).
- 🎬 **Short-Form Video Reel Studio**:
  - Full scene-by-scene script with timestamps, visual directions, on-screen text, and voiceover copy.
  - Interactive 9:16 mobile player preview with simulated audio waveform and synchronized captions.
  - Ready for **Higgsfield API** rendering.
- 📸 **Ultra-HD Marketing Visuals**:
  - Photorealistic AI promotional graphics powered by Pollinations Flux / Turbo and custom image prompts.
- 📦 **1-Click Full Campaign Export (.ZIP)**:
  - Exports all generated images, captions (.txt), full video scripts (.md), and campaign schedule CSV in one click.
- 🔑 **Custom API Keys (Zero Setup Needed)**:
  - Built-in UI to enter **Gemini API Key** and **Higgsfield API Key**.
  - Includes a smart autonomous heuristic engine that works 100% free out-of-the-box even without API keys!

---

## 🧩 How it works (Standalone Engine)

Everything runs **in your browser** — no login, no server, no data leaves your machine:

| Step | What happens | Tech |
|---|---|---|
| 1. Deep crawl | Fetches homepage + up to 5 internal pages, parses headings/nav/links → discovers sections, studios & tools | Same-origin Vercel proxy + DOMParser |
| 2. Live screenshots | Real captures of homepage & key pages | WordPress mShots (free, no key) |
| 3. Brand DNA | Title, USP, headings, features, health score, 5-color palette from the live screenshot | Canvas pixel analysis |
| 4. Strategy | Auto-decides days / post count / video-vs-image mix | Free heuristics, or your Gemini key |
| 5. Campaign | Day-wise posts: hook, caption, hashtags, CTA, best time, per-platform | Free templates, or your Gemini key |
| 6. AI artwork | Photorealistic marketing visuals + branded 1080×1350 cards with your palette | Pollinations Flux (free) |
| 7. Video reels | Scene-by-scene scripts + AI storyboard frames per scene | Prompt-ready for Runway / Higgsfield / Sora |
| 8. 1-click ZIP | Master prompts, day-wise plan, schedule CSV, captions, AI images, screenshots, README | JSZip in-browser |

**Deployed functions:** `/api/proxy` (Vercel serverless, included) fetches pages/screenshots with CORS — no third-party proxy dependency.

## 🛠️ Quick Start

### 1. Install & Run
```bash
# Start backend server (serves frontend at http://localhost:5000)
npm start
```
Or for local development:
```bash
# Terminal 1: Start backend
npm run server

# Terminal 2: Start frontend dev server
npm run client
```

### 2. Open in Browser
Visit: **`http://localhost:5000`** (or `http://localhost:3000` in dev mode)

### 3. Usage
1. Enter any website URL (e.g. `https://linear.app`, `https://shopify.com` or your own site).
2. (Optional) Enter custom campaign instructions or discount focus.
3. Click **"Auto-Pilot Launch"**.
4. The AI will scan the website, capture a live screenshot, and present its recommended strategy and post breakdown.
5. Click **"Accept AI Plan & Generate All"** (or adjust using the sliders).
6. Explore your complete marketing campaign with Instagram, LinkedIn, Twitter/X posts, and interactive Video Reel scripts!
7. Click **"Export Full Campaign (ZIP)"** to download everything in 1 click.
