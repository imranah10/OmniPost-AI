# 🚀 OmniPost AI — Autonomous URL-to-Campaign Marketing Machine

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
