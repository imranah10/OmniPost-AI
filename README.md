# OmniPost AI — Paste a URL. Get a complete social media campaign in one ZIP.

> **100% browser-based. No login, no backend database, nothing stored on any server.**
> Paste any website URL — OmniPost crawls the site (sitemap-first), captures live screenshots, extracts the brand palette, writes a day-wise posting plan with captions and hashtags for 6 platforms, generates AI marketing images + short-form video scripts, and packs everything into a single ZIP you can post from or feed to ChatGPT / Gemini / Midjourney / Runway / Higgsfield.

🌐 **Live app:** [https://imranah10.github.io/OmniPost-AI/](https://imranah10.github.io/OmniPost-AI/)

**Works with zero API keys** — the built-in heuristic engine plans campaigns and the free Pollinations AI generates images. Optionally add a **Gemini API key** in Settings for CMO-grade AI copywriting (your key stays in your browser) and **Higgsfield keys** for AI video rendering.

---

## ✨ What it does

- 🌐 **Universal website analyzer (any URL)** — Not tied to any one site. Give it any public URL (e.g. `ilovepdf.com`, `iloveimg.com`, your own site): it reads the sitemap, crawls internal pages, filters out language/locale duplicates, and maps the site's real structure — tools, products, features, studios.
- 📸 **Live screenshots** — Real captures of the homepage and key internal pages (WordPress mShots, free, no key), shown alongside the analysis and exported into the ZIP.
- 🎨 **Brand DNA extraction** — Title, USP, headings, key features and a 5-color palette derived from the live screenshot's pixels (canvas analysis), so generated posts match the brand.
- 🧠 **Campaign strategy** — Detects the business type, then recommends campaign length, post count and the video-vs-image mix. Adjustable sliders let you override the plan. A Back button returns you to the input without losing data.
- 📝 **Day-wise campaign** — For each day: hook, caption, hashtags, CTA, best posting time and target platform assignment across **Instagram, LinkedIn, Twitter/X, TikTok, YouTube and Facebook**.
- 🖼️ **AI marketing images** — Photorealistic visuals generated via free Pollinations (Flux/Turbo), with per-post image prompts. Carousel posts get **ready-to-use slide prompts** instead of pre-baked images, so you can design them your way.
- 🎬 **Short-form video scripts** — Scene-by-scene 9:16 reel scripts with timestamps, visual directions, on-screen text and voiceover copy — prompt-ready for Runway / Higgsfield / Sora.
- 🏛️ **Master Studio** — A modal with the full brand blueprint, master prompts, the platform posting guide and the master asset kit — all viewable and copyable in-app before you export.
- 📦 **1-click ZIP export** — Everything below, in one download (see exact ZIP map).
- 🔑 **Optional keys, zero setup** — Gemini key (with automatic model fallback chain and a Test-Key checker) and Higgsfield video keys, entered in Settings and stored only in your browser's localStorage.

---

## 🧩 How it works

| Step | What happens | Tech |
|---|---|---|
| 1. Deep crawl | Sitemap-first crawl of internal pages, then homepage-link discovery; locale/language links filtered; retry round for rate-limited fetches; Wayback Machine fallback | Same-origin Vercel proxy `/api/proxy` → allorigins → cors.workers.dev → cors.lol → codetabs → r.jina.ai + DOMParser |
| 2. Live screenshots | Homepage + key internal pages captured | WordPress mShots (free, no key) |
| 3. Brand DNA | Title, USP, headings, features, 5-color palette from screenshot pixels | Canvas pixel analysis |
| 4. Strategy | Business type, campaign length, post count, video/image mix | Free heuristics, or your Gemini key |
| 5. Campaign | Day-wise posts: hook, caption, hashtags, CTA, best time, platform | Free templates, or your Gemini key |
| 6. AI artwork | Photorealistic marketing visuals + per-post and carousel prompts | Pollinations Flux/Turbo (free) |
| 7. Video reels | Scene-by-scene scripts + per-scene storyboard prompts | Prompt-ready for Runway / Higgsfield / Sora |
| 8. 1-click ZIP | Full export (map below) | JSZip, in-browser |

**Deployed function:** `/api/proxy` (Vercel serverless, included in this repo) fetches pages with CORS so the browser never hits rate limits alone.

---

## 📦 What's inside the exported ZIP

```
START_HERE.txt                     ← read-me-first: what this ZIP is, reading order
CAMPAIGN_OVERVIEW.md               ← campaign summary + ZIP map
PLATFORM_POSTING_GUIDE.md          ← per selected platform: which posts go where,
                                     how to post, what to write, caption limits,
                                     ready-to-paste X captions, final pre-publish check
MASTER_ASSET_POSTING_KIT.md        ← ready-to-paste captions for the master image &
                                     master video on every selected platform
MASTER_ALL_IN_ONE_PROMPT.txt       ← brand DNA + image/video specs (one master prompt)
MASTER_BRAND_COPYWRITING_PROMPT.txt ← text-writing engine: voice, per-platform rules
MASTER_IMAGE_PROMPT.txt            ← master hero-image prompt
MASTER_VIDEO_PROMPT.txt            ← master brand-reel prompt
schedule.csv                       ← full day-wise schedule (opens in Excel/Sheets)
day-XX_<post-name>/                ← one folder per post: caption .txt,
                                     post_ready_to_publish.txt, image prompts, images
all_website_screenshots/           ← the live site captures
```

---

## 🚀 Quick Start

### Option A — Use it live (no install)
Open **[imranah10.github.io/OmniPost-AI](https://imranah10.github.io/OmniPost-AI/)**, paste a URL, click **Auto-Pilot Launch**, review the plan, click **Accept AI Plan & Generate All**, then **Export Full Campaign (ZIP)**.

### Option B — Run locally (client only)
```bash
git clone https://github.com/imranah10/OmniPost-AI.git
cd OmniPost-AI/client
npm install
npm run dev        # Vite dev server
```
The app falls back to public CORS proxies in local dev, so analysis works without any backend.

### Option C — Deploy your own (Vercel)
The repo ships with `vercel.json` (Vite build + `/api/proxy` serverless function). Import the repo into Vercel and deploy — no environment variables required for free mode.

---

## 🔑 API keys (all optional)

| Key | Where | What it unlocks |
|---|---|---|
| Gemini API Key | Settings (⚙️) | AI-written strategy + campaign copy, with automatic model fallback and a Test-Key checker |
| Higgsfield Key ID + Secret | Settings (⚙️) | AI video rendering for the reel scripts |

Without any key: heuristic strategy, template copy and Pollinations images still work — the full pipeline is usable for free.

---

## ⚠️ Honest limitations

- Heavily bot-protected sites (aggressive Cloudflare rules that block every free proxy) can't be deep-crawled from the browser; analysis then completes with the homepage capture and a heuristic plan instead of failing.
- Screenshot quality depends on the third-party mShots service; slow-loading pages may capture partially rendered.
- AI images are generated by the free Pollinations service — quality varies and no SLA is promised.

---

## 🛠️ Tech stack

React + Vite · JavaScript · JSZip · Canvas API · Gemini API (BYOK) · Pollinations · WordPress mShots · Vercel Serverless Functions · GitHub Pages

---

Built by [Imran Ahmad](https://github.com/imranah10) — also see [PromptForge](https://promptforge-navy-psi.vercel.app/) (BYOK AI studio) and [Toolverse](https://toolverse-official.vercel.app/) (AI tools directory).
