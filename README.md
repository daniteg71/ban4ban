# ban4ban — Grant intelligence for companies

**ban4ban** turns a company's own documents into a ranked, explained shortlist of public
grants and incentives it can actually apply for. It discovers the grants, scores each one
against the company, and — on demand — produces a detailed, downloadable application strategy.

> **Context.** This project was commissioned as a real-world challenge to put the Junior
> Enterprise **JESAP** to the test as a potential **technical partner**: a single, end-to-end
> product built from a brief, deployed to production, and designed to show how we work — from
> data plumbing to AI, UX and serverless architecture.

---

## What it does

From the **company DNA** (the real documents in its Google Drive) to the **best-fit grants**,
with a 1–10 score and a ready-to-use action plan for each one.

- **Automatic grant discovery.** Live scraping of the main Italian incentive portals
  (MIMIT, Invitalia, regional sources). Only genuine calls (grants, contributions, tax credits)
  are kept — service pages and noise are filtered out.
- **Two complementary algorithms.**
  1. **Affinity scoring (runs together with the scraping).** Every grant gets a **1–10 fit score**
     against the company profile, so the list arrives already sorted from most to least relevant.
  2. **Detailed strategy (on grant click).** A deeper analysis explains *why* that score, across
     **6 dimensions** (sector, technical, certifications, experience, geography, economic fit),
     with strengths, weaknesses, missing requirements, risks, next actions and an **operational
     checklist** to submit the application — all **downloadable** as a document.
- **Automated Google Drive connection.** The app reads the company's files (registration extracts,
  balance sheets, CVs, capability statements) and synthesizes the **company "DNA"** that powers
  both the score and the strategy. No manual data entry — it refreshes itself when the files change.
- **Real per-company personalization.** A multi-company test setup (one Drive subfolder per company)
  shows the output genuinely changes per company: eligible grants, scores and strategies all differ.

## Why it stands out

- **Real data, not mock-ups.** Grants come from official sources; the profile is built from the
  company's actual documents.
- **Explainability.** Every score is justified and traceable — the user understands the *why*,
  not just a number.
- **Cost-aware, cached architecture.** The first "cold" load is slower, but an intelligent cache
  (shared pre-fetched grant pool, memorized profiles and evaluations) makes consecutive use — e.g.
  browsing several grants in a row — much faster, while cutting AI and compute costs.
- **Production-ready.** Already deployed on a scalable serverless stack, multi-company, **with no
  database** required (stateless by design).

## How it works

1. **Home (`/`)** — Drive connection status, company selector, "Search grants", and the ranked list.
2. **Search** — scrape ➜ per-company eligibility filter (sector + geography) ➜ 1–10 affinity score ➜ sorted list.
3. **DNA (`/dna`)** — a 3D "galaxy" of the company's competences, markets and assets, synthesized from the real files.
4. **Strategy (`/bandi/[id]`)** — the detailed, downloadable application strategy for a single grant.

## Tech stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **Tailwind 4** · **shadcn/ui**
- **AI:** Google **Gemini** (`gemini-2.5-flash`) via a minimal zero-dependency REST client, with
  deterministic fallbacks so the app never breaks when AI is off or unavailable.
- **Data source:** **Google Drive** via a service account (JWT signed in-house, read-only scope).
- **Scraping:** `cheerio` over official RSS/HTML feeds — no API keys, no cost.
- **3D:** `three.js` / react-three-fiber for the DNA galaxy.
- **Caching:** shared grant pool (TTL), per-company DNA cache, score/evaluation caches, request-level memoization.
- **Hosting:** Vercel (serverless functions), stateless — no external database.

## Notes & limitations

- **Cold start vs. cache.** The very first request after an idle period is slower (scraping +
  document reading + AI evaluation run together); subsequent requests reuse the cache and are fast.
- **Scraping scope.** Discovery currently targets selected grant types and sources; JavaScript-only
  portals and EU tenders are out of scope by design for this phase.
- **Secrets.** Credentials (Google service account, Gemini key) live only in environment variables —
  never in the repository.

## Local setup

```bash
npm install
# create .env.local with:
#   GOOGLE_SERVICE_ACCOUNT_JSON=...   # Drive service account (read-only)
#   DRIVE_BANDI_FOLDER_ID=...         # root folder (one subfolder per company)
#   GEMINI_API_KEY=...                # optional: enables real AI scoring & strategy
npm run dev   # http://localhost:3000
```

## Contributors

Built by **JESAP** (Junior Enterprise SAPienza):

- Daniele Tegliucci ([@daniteg71](https://github.com/daniteg71))
- Gustavo ([@gusuzin](https://github.com/gusuzin))
- Andrea Rinaldini ([@Zirin405](https://github.com/Zirin405))
