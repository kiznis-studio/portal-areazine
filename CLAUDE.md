# Areazine

Automated US safety alerts news portal transforming government public data (CPSC, FDA, NHTSA, NOAA, USGS, FEMA, AirNow) into SEO-optimized articles using Gemini Flash.

**Live URL:** https://areazine.com
**Growth Roadmap:** [docs/growth-roadmap-1m.md](docs/growth-roadmap-1m.md)

---

## Quick Context

- **Status:** **LIVE** (launched 2026-02-11)
- **Architecture:** Astro 5 static site + Node.js pipeline (Aurora server)
- **Pages:** 4,843 total (4,639 city profiles, 51 state hubs, 135+ articles, compare tool)
- **Data Sources:** 8 active (CPSC, FDA, NHTSA, NOAA, USGS, FEMA, FDA Drug Shortages, AirNow)
- **City Data:** Census Bureau ACS + CDC PLACES + CMS Hospital Compare (county-level)
- **Design System:** Complete (8-phase overhaul, Feb 2026) — data viz, comparison indicators, pure CSS charts
- **Traffic:** Minimal (new site, awaiting index)
- **Revenue:** $0/mo (AdSense not applied yet)
- **Phase:** Content scaling + SEO growth

---

## Project Overview

### Positioning

Automated news aggregator covering US public safety alerts:
- Product recalls (CPSC, FDA, NHTSA)
- Weather alerts (NOAA — Extreme/Severe only)
- Earthquake reports (USGS — M2.5+)
- Disaster declarations (FEMA)
- Drug shortages (FDA)
- Air quality alerts (EPA AirNow — AQI > 100)

**Target audience:** US consumers seeking safety information, parents, homeowners, emergency preparedness enthusiasts.

**Competitive advantage:** Real-time automation, comprehensive coverage, clean presentation, zero manual effort after setup.

---

## Infrastructure

### Frontend (Cloudflare Pages)

- **GitHub:** https://github.com/kiznis-studio/portal-areazine
- **Live URL:** https://areazine.com
- **Cloudflare Pages:** portal-areazine.pages.dev
- **Stack:** Astro 5 + Tailwind CSS 4 (static site generator)
- **Deployment:** Git push triggers Cloudflare Pages build

### Backend Pipeline (Aurora Server)

- **Location:** `/opt/areazine/repo/` (Aurora: root@158.101.199.103)
- **Database:** SQLite at `/storage/areazine/areazine.db`
- **Services:** 3 systemd daemons (fetcher, processor, publisher)
- **AI Model:** Gemini Flash 2.0 (`gemini-2.0-flash-001`)
- **Cost estimate:** ~$5-10/month for 2-4K articles/day

#### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FETCHER (areazine-fetcher)                │
│  Polls government APIs → stores raw JSON in SQLite           │
│  Intervals: CPSC/FDA 4h, NOAA 1h, USGS 30min, AirNow 2h     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  PROCESSOR (areazine-processor)              │
│  Reads unprocessed records → Gemini Flash article generation │
│  Anti-hallucination quality check → marks processed          │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 PUBLISHER (areazine-publisher)               │
│  Reads unpublished articles → writes markdown to repo        │
│  Git commit + push → triggers CF Pages rebuild               │
│  IndexNow submission to Bing                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Analytics & Monitoring

| Service | ID / DSN | Status |
|---------|----------|--------|
| **Umami Analytics** | `b6ea9d90-452d-466f-b32a-b47d7016a909` | Active |
| **Sentry** | DSN: `https://234e5ea110716ac89ad5945a83ea0e5f@o4510827630231552.ingest.de.sentry.io/4510867553779792` | Active (production only) |
| **Google Search Console** | Verified domain property | Active |
| **Bing Webmaster Tools** | Verified (2026-02-11) | Active |

### Sentry Configuration

- **Project:** `areazine`
- **Production check:** `DATA_DIR === '/storage/areazine'` (Aurora environment)
- **Integration:** Astro integration in `astro.config.mjs`, pipeline integration in `pipeline/lib/sentry.js`
- **Behavior:** Sentry only initializes in production environment (Aurora server)

---

## Cloudflare Configuration

- **Zone ID:** `93dca4ca1bbdf9a1e4bfbd53a8f7958d`
- **Email Routing:** hello@, privacy@, legal@ → mindaugas@kiznis.studio
- **Pages Project:** portal-areazine (auto-deploy from main branch)
- **IndexNow Key:** `766538bdafcc4bf2b8f3a2d4d4d0b9fa` (in `/public/766538bdafcc4bf2b8f3a2d4d4d0b9fa.txt`)

### _redirects (301 Permanent)

Old city-based URLs redirect to category pages:
```
/new-york/* /recalls 301
/los-angeles/* /recalls 301
/chicago/* /recalls 301
# ... etc
```

---

## Data Sources

| Source | API Endpoint | Category | Interval | Status | Rate Limit |
|--------|--------------|----------|----------|--------|------------|
| **CPSC** | cpsc.gov/Recalls/retrieve-by-date | recalls-cpsc | 4 hours | Active | 30/24h |
| **FDA** | api.fda.gov/food/enforcement.json | recalls-fda | 4 hours | Active | 30/24h |
| **NHTSA** | api.nhtsa.gov/recalls/campaignNumber | recalls-vehicles | 4 hours | **Active** | 30/24h |
| **NOAA** | api.weather.gov/alerts/active | weather | 1 hour | Active | 20/24h |
| **USGS** | earthquake.usgs.gov/fdsnws/event/1/query | earthquakes | 30 minutes | Active | 15/24h |
| **FEMA** | fema.gov/api/open/v2/DisasterDeclarationsSummaries | disasters | 6 hours | Active | 10/24h |
| **FDA Drug Shortages** | api.fda.gov/drug/shortages.json | drug-shortages | 12 hours | Active | 20/24h |
| **AirNow** | airnowservices.org/aq/forecast/zipCode | air-quality | 2 hours | Active | 15/24h |

**FEMA notes:** API blocks non-US IPs; works from Aurora (US Oracle Cloud). Groups by disaster number to avoid per-county duplicates. Declaration types: DR (Major Disaster), EM (Emergency), FM (Fire Management).

**NHTSA notes:** The `recallsByDate` endpoint returns 403 (requires auth), but the `campaignNumber` endpoint works without auth. Fetcher iterates all 2026 campaign types (V, E, T, C) and campaign numbers sequentially.

**FDA Drug Shortages notes:** The api.data.gov key does NOT work with this endpoint — use public access (no key). `update_date` is MM/DD/YYYY text, not searchable as a date range. Fetcher paginates all current shortages client-side and filters by update date. Groups by generic drug name to produce one record per drug.

**AirNow notes:** Requires separate API key (not api.data.gov). Queries 50 major US metro zip codes. Only generates articles when AQI > 100 (unhealthy for sensitive groups+). Key stored in `/opt/areazine/keys/airnow-api-key.txt`.

### Rate Limiting Logic

Pipeline tracks publication counts per category in 24-hour rolling windows. When limit reached:
- Record stays as unprocessed (not marked as failed)
- **Per-cycle category tracking:** Processor tracks rate-limited categories in a Set per batch cycle. Once a category hits its limit, all remaining records from that category are skipped for the rest of that cycle.
- **5x batch fetching:** Processor fetches `BATCH_SIZE * 5` records to find non-limited records across categories.
- When ALL pending records are rate-limited, processor sleeps 5 minutes before retrying.

### Data Quality

**Anti-hallucination validation** (in `pipeline/lib/quality.js`):
- CPSC: Brand name, manufacturer, product name from structured fields
- FDA: Recalling firm, product description, reason for recall
- NHTSA: Campaign number, manufacturer, make, model, component
- NOAA: Event type, area description (handles both flat and nested GeoJSON)
- USGS: Magnitude (rounded to 1 decimal), place name (stripped of distance prefix)
- FEMA: Declaration string, state, incident type, declaration title
- FDA Drug Shortages: Generic name, dosage form, brand names, status
- AirNow: Reporting area, state code, AQI value, worst parameter
- Failed validation → article discarded, record marked `processed=2`

**Placeholder detection:** Only checks for `TK` (journalism placeholder). `TBD` and `N/A` are NOT flagged because they appear legitimately in FDA drug shortage data.

**NOAA data flattening:** GeoJSON Feature objects stored as flat properties in SQLite for simpler querying.

---

## Content Categories

| Category Slug | Display Name | Source(s) | Article Count |
|--------------|--------------|-----------|---------------|
| `recalls-cpsc` | Product Recalls | CPSC | 16 |
| `recalls-fda` | FDA Recalls | FDA | 24 |
| `recalls-vehicles` | Vehicle Recalls | NHTSA | 30+ (processing) |
| `weather` | Weather Alerts | NOAA | 31 |
| `earthquakes` | Earthquake Reports | USGS | 8 |
| `disasters` | Disaster Declarations | FEMA | 5 |
| `drug-shortages` | Drug Shortages | FDA | 20 (36 rate-limited) |
| `air-quality` | Air Quality Alerts | AirNow | 1 |

### Article Slug Format

`{source}-{slugified-title}` (max 80 characters)

Examples:
- `cpsc-infant-sleepers-recalled-due-to-suffocation-risk`
- `fda-salmonella-contamination-in-ground-beef-products`

---

## Pipeline Details

### Service Management (Aurora)

```bash
# Check all services
systemctl status areazine-fetcher areazine-processor areazine-publisher

# View logs (follow mode)
journalctl -fu areazine-fetcher
journalctl -fu areazine-processor
journalctl -fu areazine-publisher

# Restart after code changes
ssh root@158.101.199.103 "cd /opt/areazine/repo && git pull origin main && systemctl restart areazine-fetcher areazine-processor areazine-publisher"

# Check pipeline stats
ssh root@158.101.199.103 "sqlite3 /storage/areazine/areazine.db \"SELECT source, COUNT(*) as cnt, SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) as pending FROM raw_data GROUP BY source\""
```

### Systemd Services

| Unit | MemoryMax | Description |
|------|-----------|-------------|
| `areazine-fetcher.service` | 512M | Polls APIs every N minutes |
| `areazine-processor.service` | 1G | Generates articles via Gemini |
| `areazine-publisher.service` | 256M | Git push + IndexNow |

**Service files:** `/etc/systemd/system/areazine-*.service`

### Environment Variables

**File:** `/opt/areazine/repo/pipeline/.env`

```bash
GEMINI_API_KEY=...           # From den.kiznis.com
GEMINI_MODEL=gemini-2.0-flash-001
DATA_DIR=/storage/areazine   # Production data directory
GITHUB_TOKEN=...             # For publisher git push
INDEXNOW_KEY=766538bdafcc4bf2b8f3a2d4d4d0b9fa
SENTRY_DSN=https://...       # Pipeline error tracking
AIRNOW_API_KEY=...           # EPA AirNow API key
DATA_GOV_API_KEY=...         # api.data.gov key (NOT used for FDA shortages)
FETCH_INTERVAL_AIRNOW=120    # Minutes between AirNow fetches
FETCH_INTERVAL_FDA_SHORTAGES=720  # Minutes between FDA shortage fetches
FETCH_INTERVAL_FEMA=360      # Minutes between FEMA fetches
```

**GitHub Token:** Currently uses `gh` OAuth token. Should be replaced with fine-grained PAT:
- Repo: `portal-areazine`
- Permissions: Contents (Read/Write)

### API Keys

| Key | Location | Purpose |
|-----|----------|---------|
| **Gemini** | Aurora `.env` | AI article generation |
| **AirNow** | `/opt/areazine/keys/airnow-api-key.txt` + `.env` | EPA air quality data |
| **api.data.gov** | `keys/data-gov-api-key.txt` + `.env` | Federal agency APIs (USDA, etc.) |
| **GitHub PAT** | Aurora `.env` | Publisher git push |

**Important API quirks:**
- api.data.gov key does NOT work with openFDA drug/shortages.json (use public access, no key)
- AirNow uses its own key system, separate from api.data.gov
- NHTSA campaignNumber endpoint requires no auth

---

## Database Schema

**File:** `pipeline/lib/db.js`

### Tables

#### `raw_data`
Raw API responses before processing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `source` | TEXT | cpsc, fda, nhtsa, noaa, usgs, fema, fda-shortages, airnow |
| `identifier` | TEXT UNIQUE | Recall number, event ID, etc. |
| `data` | TEXT | JSON blob |
| `fetched_at` | TEXT | ISO timestamp |
| `processed` | INTEGER | 0 = pending, 1 = processed |

#### `articles`
Generated articles ready for publishing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `slug` | TEXT UNIQUE | URL slug |
| `category` | TEXT | Category slug |
| `title` | TEXT | Article headline |
| `content` | TEXT | Markdown content |
| `source_id` | INTEGER | FK to raw_data.id |
| `created_at` | TEXT | ISO timestamp |
| `published` | INTEGER | 0 = unpublished, 1 = published |

#### `publication_log`
Tracks publication counts for rate limiting.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `category` | TEXT | Category slug |
| `published_at` | TEXT | ISO timestamp |

---

## Key Files

### Frontend (Astro)

| File | Purpose |
|------|---------|
| `astro.config.mjs` | Sentry integration, sitemap, site URL |
| `src/lib/config.ts` | Category definitions, site metadata |
| `src/content.config.ts` | Article content collection schema |
| `src/pages/index.astro` | Homepage (featured + latest articles) |
| `src/pages/articles.astro` | All articles with category filter |
| `src/pages/[category]/index.astro` | Category archive pages |
| `src/pages/[category]/[...slug].astro` | Article detail pages |
| `src/content/articles/` | Markdown articles (git-generated) |

### Pipeline (Node.js)

| File | Purpose |
|------|---------|
| `pipeline/fetcher.js` | API polling service (registers all sources) |
| `pipeline/processor.js` | Gemini article generation + rate limiting |
| `pipeline/publisher.js` | Git push + IndexNow |
| `pipeline/lib/db.js` | SQLite schema + prepared statements |
| `pipeline/lib/quality.js` | Anti-hallucination validator (all 8 sources) |
| `pipeline/lib/sentry.js` | Sentry initialization (production-only) |
| `pipeline/lib/gemini.js` | Gemini API client |
| `pipeline/lib/sources/cpsc.js` | CPSC recall data fetcher |
| `pipeline/lib/sources/fda.js` | FDA enforcement data fetcher |
| `pipeline/lib/sources/nhtsa.js` | NHTSA vehicle recall fetcher (campaignNumber) |
| `pipeline/lib/sources/noaa.js` | NOAA weather alert fetcher |
| `pipeline/lib/sources/usgs.js` | USGS earthquake fetcher |
| `pipeline/lib/sources/fema.js` | FEMA disaster declaration fetcher |
| `pipeline/lib/sources/fda-shortages.js` | FDA drug shortage fetcher (paginated) |
| `pipeline/lib/sources/airnow.js` | EPA AirNow air quality fetcher |
| `pipeline/templates/` | Gemini prompt templates per category |

---

## Content Structure

### Article Frontmatter

```yaml
---
title: "Product Name Recalled Due to Hazard"
date: 2026-02-11
category: recalls-cpsc
source: cpsc
identifier: "26-123"
summary: "Brief description of the recall."
---
```

### Structured Data

All article pages include:
- **NewsArticle** schema (headline, datePublished, articleBody, author, publisher)
- **BreadcrumbList** schema (Home → Category → Article)

---

## Standard Pages

- [x] Homepage (featured article, category columns, latest articles)
- [x] Articles index (/articles) with category filter
- [x] Category pages (/recalls, /weather, /earthquakes, /disasters, /drug-shortages, /air-quality)
- [x] Category-specific pages (/recalls/cpsc, /recalls/fda, /recalls/vehicles)
- [x] About page (methodology, data sources, editorial standards)
- [x] Privacy Policy (GDPR/CCPA compliant, cookie-free analytics)
- [x] Terms of Use (disclaimers, limitation of liability)
- [x] robots.txt (correct sitemap URL, AI crawler friendly)
- [x] llms.txt (AI visibility, attribution guidelines)
- [x] RSS feed (/rss.xml)
- [x] Sitemap (auto-generated by Astro)
- [x] 404 error page

---

## Features

- **Dark/light theme toggle** (localStorage persistence)
- **Category filtering** on articles page
- **RSS feed** at `/rss.xml`
- **IndexNow auto-submission** on publish (Bing)
- **Cloudflare _redirects** for old city URLs (301 → category pages)
- **Rate limiting** per category (prevents API abuse)
- **Anti-hallucination quality validation** (identifier matching)
- **Structured data** (NewsArticle + BreadcrumbList on every article)

---

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Start Astro dev server
npm run dev

# Build static site
npm run build

# Preview build
npm run preview
```

### Sync Data from Aurora

**Scripts:** `scripts/sync-from-aurora.sh`

```bash
# Sync everything (articles + database)
./scripts/sync-from-aurora.sh

# Sync database only (pipeline state)
./scripts/sync-from-aurora.sh --db

# Sync git only (articles)
./scripts/sync-from-aurora.sh --git
```

**What it does:**
1. `--db`: Copies `/data/areazine.db` from Aurora to local `/data/`
2. `--git`: Pulls latest from `main` branch (includes generated articles)
3. No args: Both of the above

### Pipeline Development

**Test pipeline locally:**

```bash
cd pipeline

# Test fetcher (dry run)
node fetcher.js

# Test processor (requires Gemini API key)
GEMINI_API_KEY=... node processor.js

# Test publisher (requires GitHub token)
GITHUB_TOKEN=... node publisher.js
```

**Deploy pipeline changes to Aurora:**

```bash
# From local dev machine
ssh root@158.101.199.103 "cd /opt/areazine/repo && git pull origin main && systemctl restart areazine-fetcher areazine-processor areazine-publisher"
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-11 | Gemini Flash 2.0 for article generation | Fast, cheap ($0.075/1M input tokens), good quality |
| 2026-02-11 | SQLite for pipeline state | Simple, reliable, no external dependencies |
| 2026-02-11 | Astro 5 for frontend | Static site = fast, cheap, secure |
| 2026-02-11 | 3 separate systemd services | Isolation, independent failure, easier monitoring |
| 2026-02-11 | Anti-hallucination validation | Prevent incorrect recall numbers/event IDs |
| 2026-02-11 | Rate limiting per category | Prevent API abuse, maintain quality over quantity |
| 2026-02-11 | IndexNow over sitemap ping | Bing prefers IndexNow, instant notification |
| 2026-02-11 | Publisher git push triggers rebuild | Decouples pipeline from frontend deployment |
| 2026-02-11 | Sentry production-only | Avoid dev noise, save quota |
| 2026-02-11 | NOAA data flattening | Simpler queries, SQLite doesn't need full GeoJSON |
| 2026-02-11 | areazine.com domain | Clear, memorable, .com TLD for trust |
| 2026-02-11 | City redirects to categories | Simplify IA, focus on content type not location |
| 2026-02-11 | Leave records unprocessed on rate limit | Enable retry without manual intervention |
| 2026-02-11 | NHTSA campaignNumber over recallsByDate | recallsByDate returns 403; campaignNumber works without auth |
| 2026-02-11 | FDA shortages no API key | api.data.gov key rejected; public access with client-side filtering works |
| 2026-02-11 | Remove TBD/N/A from placeholder check | Government data legitimately contains these strings |
| 2026-02-11 | Per-cycle category rate-limit tracking | Prevents one high-volume source from starving all others |
| 2026-02-11 | AirNow AQI > 100 threshold | Only newsworthy air quality (unhealthy for sensitive groups+) |
| 2026-02-11 | DATA_DIR=/storage/areazine | Dedicated storage volume for production data |
| 2026-02-11 | Dynamic homepage categories | Show all active categories instead of hardcoded 3 columns |
| 2026-02-11 | Pure CSS data viz on city/state pages | 4,639 pages × any JS = massive weight. CSS bars achieve 95% visual impact at 0kb cost |
| 2026-02-11 | National avg comparison as primary context | "$136,689 — 116% above avg" tells a story; raw numbers don't |
| 2026-02-11 | Client-side JS only on /cities and /compare | Search/filter/sort and autocomplete need JS; everything else is static HTML/CSS |
| 2026-02-11 | TSV data embedding for client-side search | Compact tab-separated format in `<script type="text/data">` blocks, ~220KB for 4,639 cities |
| 2026-02-11 | Respectful ethnicity labels | Use "African American", "Hispanic or Latino", "Other / Multiethnic" — avoid "Black", "races" terminology |
| 2026-02-11 | County-level data, city-level population | Census ACS data is county-level (smallest consistent geography); GeoNames provides city population |
| 2026-02-11 | City profiles organized by state directory | `city-profiles/CA/san-francisco.json` for filesystem sanity at 4,639 files |
| 2026-02-11 | Comparison tool with shareable URLs | `/compare?a=austin-tx&b=seattle` — all data embedded client-side, no server needed |

---

## Learnings

### What Works

- **Gemini Flash quality** - Consistently produces clean, accurate articles from structured data
- **Anti-hallucination checks** - Catch ~5% of generations with incorrect identifiers
- **SQLite prepared statements** - Fast, safe, no ORM complexity
- **Systemd timers** - More reliable than cron for frequent jobs
- **Git-based publishing** - Cloudflare Pages auto-rebuild is seamless
- **IndexNow submission** - Bing indexes articles within hours

### What Doesn't

- **NHTSA recallsByDate endpoint** - Returns 403, requires auth. Use `campaignNumber` endpoint instead (no auth needed)
- **api.data.gov key on openFDA** - Returns `API_KEY_INVALID` on drug/shortages.json. Use public access (no key)
- **gh OAuth tokens for publisher** - Expire unpredictably, use PAT instead
- **Aggressive rate limiting** - Initial 10/day was too conservative, bumped to 15-30
- **TBD/N/A as placeholders** - FDA drug shortage data legitimately contains these strings. Only `TK` is a safe placeholder marker.

### Patterns Discovered

- **Magnitude rounding for USGS** - API returns float (4.567), Gemini generates rounded (4.6), validator must round for comparison
- **NOAA GeoJSON complexity** - Store as flat properties, not nested Feature objects
- **Rate limit as quality control** - Forces focus on high-value content (significant earthquakes, major recalls)
- **Production-only Sentry** - Check `DATA_DIR` env var to differentiate environments
- **Article slug truncation** - Limit to 80 chars to avoid URL encoding issues
- **Separated services benefit** - Fetcher keeps running even if processor crashes
- **Per-cycle rate-limit tracking** - Without it, one high-volume rate-limited source (drug-shortages) blocks processing of all other sources
- **Client-side date filtering** - Some FDA API date fields are text (MM/DD/YYYY), not queryable server-side
- **NHTSA campaign number iteration** - Iterate types (V, E, T, C) and sequential numbers to discover all campaigns for a year
- **CSS progress bars at scale** - Pure CSS flex-based bars with `width: X%` are performant across 4,639 pages with zero JS overhead
- **Vite import.meta.glob** - Load all JSON profiles at build time; `eager: true` prevents async complexity
- **ComparisonResult pattern** - `compareToNational(metric, value)` returning `{ direction, pct, label }` is reusable across all data components
- **DOM createElement over innerHTML** - Security hook flags innerHTML usage; use createElement/textContent/appendChild pattern for all dynamic content
- **National stats as comparison baseline** - Pre-computed `national-stats.json` loaded once, used by every component
- **Ethnicity labels matter** - Use census-aligned but respectful terms: "African American" not "Black", "Hispanic or Latino" not "Hispanic", "Other / Multiethnic" not "Other / Multiracial"
- **Census race vs ethnicity** - Hispanic/Latino is an ethnicity (B03001 table), NOT a race. It overlaps with White, Black, Asian, Other. Never subtract Hispanic from race total — produces negative numbers. Display separately as "Hispanic or Latino (any race): X%"
- **NOAA precipitation gaps** - Some weather stations only report temperature, not precipitation. Track `precipCount` separately; set annual total to `null` (not `0`) when no precip data exists. Otherwise cities appear to have zero rainfall.
- **State-level data ≠ city data** - Never display state-level statistics (e.g., state crime rates) as if they're city-specific. Users expect city data on a city page. Omit the section entirely rather than show misleading data.
- **NCES school matching by city name** - School data uses city names that may not match profile slugs (e.g., "Queens Village" school district vs "Queens" borough). Validate with schools-per-capita ratio: >50 schools per 10K population indicates a matching error (likely pulling county/state data).
- **Aurora publisher git conflicts** - When local dev and pipeline both push to the same repo, publisher's `git push` fails. Fix: SSH into Aurora, `cd /opt/areazine/repo && git pull --rebase origin main && git push`. Add `--rebase` logic to publisher for auto-recovery.
- **Batch data fixes at scale** - For fixing 4,640+ city profiles, write a Node.js script that loads all JSON files, applies transforms, and writes back. Much safer than manual edits. Always validate output counts match input counts.

### Pipeline Failure Modes

| Failure | Symptom | Recovery |
|---------|---------|----------|
| Gemini API timeout | Unprocessed records accumulate | Auto-retry next cycle (30s-4h) |
| Quality validation fail | Record marked `processed=2` | `UPDATE raw_data SET processed=0 WHERE processed=2` to retry |
| Git push failure | Articles unpublished, queue grows | Check GitHub token, restart publisher |
| API rate limit hit | No new records fetched | Wait for interval, automatic resume |
| Category rate limit | Records skipped per cycle | Processor auto-retries next cycle, sleeps 5min if all limited |
| Database lock | Service waits, may timeout | SQLite WAL mode enabled, rare issue |
| Publisher git conflict | Push rejected | Publisher needs `git pull --rebase` logic |

---

## Design System (Completed Feb 2026)

8-phase design overhaul: "Bloomberg terminal meets NYT data journalism"

### Components (`src/components/data/` and `src/components/ui/`)

| Component | Purpose | JS Required |
|-----------|---------|:-----------:|
| StatCard | Metric display with national avg comparison | No |
| ComparisonIndicator | Arrow + "116% above avg" text | No |
| ComparisonBar | Horizontal bar with national avg marker line | No |
| DemographicsChart | Stacked horizontal bar, colored segments + legend | No |
| HealthMetricRow | Health metric with bar + color coding | No |
| HospitalRatingDist | Star distribution as horizontal bars | No |
| HospitalCard | Individual hospital card with star rating | No |
| RankRow | Ranking entry with position badge + relative bar | No |
| DataSourceFooter | Collapsible source attribution | No |
| Breadcrumb | Unified breadcrumb navigation | No |
| SectionHeader | Uppercase tracked section heading with count | No |

### Utility Libraries (`src/lib/`)

| Library | Purpose |
|---------|---------|
| `format.ts` | `fmt()`, `fmtMoney()`, `fmtPct()`, `fmtCompact()` |
| `comparison.ts` | `compareToNational(metric, value)` → `{ direction, pct, label }` |

### Page Types

| Page | Count | JS | Size |
|------|-------|:--:|------|
| City profile (`/cities/[slug]`) | 4,639 | None (pure CSS) | ~35-41 KB |
| State detail (`/states/[state]`) | 51 | None | ~222 KB (CA) |
| States index (`/states/`) | 1 | None | ~71 KB |
| Cities index (`/cities/`) | 1 | Client-side search/filter/sort | ~221 KB |
| Compare tool (`/compare`) | 1 | Autocomplete + comparison | ~481 KB |
| Homepage | 1 | None | ~44 KB |

### Data Neutrality & Sensitivity (Mandatory)

**Racial and ethnic neutrality is non-negotiable.** All data must be presented factually without editorializing, ranking by demographic characteristics, or implying value judgments about any group.

- **Official terminology only:** Follow Census Bureau naming — "White", "African American", "Asian", "Hispanic or Latino", "Other / Multiracial"
- **Race vs ethnicity:** Hispanic/Latino is an ethnicity (not a race). Show race categories summing to 100% in one breakdown; show Hispanic/Latino separately with "(ethnicity, any race)" qualifier
- **Section headers:** "Demographics" is neutral and acceptable
- **Never fabricate or extrapolate:** If data isn't available at the correct geographic level (e.g., city-level crime from state-level source), omit it entirely — never display misleading approximations
- **Source attribution required:** Every data section must show source agency and data year
- **No loaded comparisons:** Don't rank or sort cities by demographic or socioeconomic characteristics in ways that stigmatize communities
- **Missing data:** Show "Data not available" or hide the section — never show zeros or placeholders that could be mistaken for real values
- **Context matters:** Crime rates, poverty rates, and health metrics should always include context (e.g., sample size, geographic scope, data vintage)

### Planned Enhancements

- **Historical data timeline** — Sparkline charts showing 5-10 year trends (population, income, home values) from Census ACS annual vintages. Major differentiator vs competitors.
- **Pagefind site-wide search** — Build-time search index for full-text search across all pages
- **Additional data sources** — FBI crime data (~3K city crime pages), NASA wildfire detection, SEC fraud alerts

---

## State Management (Critical)

**This CLAUDE.md is the single source of truth for the Areazine project.**

### Rules for Claude

1. **Before ANY work:** Read this file completely
2. **After pipeline changes:** Update Decision Log and Learnings
3. **After infrastructure changes:** Update relevant sections (Analytics, Services, etc.)
4. **Before session end:** Verify all changes are reflected in this file
5. **If unsure about state:** SSH to Aurora and check live services/database

### State Verification Commands

```bash
# Check live site
curl -s https://areazine.com | grep -o '<title>[^<]*' | head -1

# Check pipeline services (Aurora)
ssh root@158.101.199.103 'systemctl is-active areazine-fetcher areazine-processor areazine-publisher'

# Check database stats (Aurora)
ssh root@158.101.199.103 'sqlite3 /storage/areazine/areazine.db "SELECT source, COUNT(*) as total, SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) as pending FROM raw_data GROUP BY source"'

# Check article count
ssh root@158.101.199.103 'ls -1 /opt/areazine/repo/src/content/articles/ | wc -l'
```

### What to Track

- Pipeline service status (active/failed)
- Database record counts (total, pending, published)
- Article counts per category
- Any API endpoint changes or failures
- Rate limit adjustments
- Gemini model/config changes

---

## Common Tasks

### Add New Data Source

1. Add API client to `pipeline/fetcher.js`
2. Add category to `src/lib/config.ts`
3. Create prompt in `pipeline/prompts/{category}.txt`
4. Add quality validator to `pipeline/lib/quality.js`
5. Add rate limit entry to `pipeline/processor.js`
6. Test fetch → process → publish cycle locally
7. Deploy to Aurora, restart services
8. Monitor logs for 24h

### Adjust Rate Limits

Edit `pipeline/processor.js`:

```javascript
const RATE_LIMITS = {
  weather: { max: 20, hours: 24 },
  earthquakes: { max: 15, hours: 24 },
  'recalls-cpsc': { max: 30, hours: 24 },
  'recalls-fda': { max: 30, hours: 24 },
  'recalls-vehicles': { max: 30, hours: 24 },
  'disasters': { max: 10, hours: 24 },
  'drug-shortages': { max: 20, hours: 24 },
  'air-quality': { max: 15, hours: 24 },
};
```

Restart processor: `systemctl restart areazine-processor`

### Reset Failed Records for Reprocessing

```bash
# Reset quality-check failures (processed=2) for a specific source
ssh root@158.101.199.103 "sqlite3 /storage/areazine/areazine.db \"UPDATE raw_data SET processed=0 WHERE source='SOURCE_NAME' AND processed=2;\""

# Restart processor to pick up reset records
ssh root@158.101.199.103 "systemctl restart areazine-processor"
```

### Replace GitHub Token

```bash
# Generate fine-grained PAT at https://github.com/settings/tokens
# Repo: portal-areazine, Permissions: Contents (Read/Write)

# Update env file on Aurora
ssh root@158.101.199.103
nano /opt/areazine/repo/pipeline/.env
# Set GITHUB_TOKEN=github_pat_...

# Restart publisher
systemctl restart areazine-publisher
```

### Monitor Pipeline Health

```bash
# Live log tailing (all services)
ssh root@158.101.199.103
journalctl -f -u areazine-fetcher -u areazine-processor -u areazine-publisher

# Check for errors in last hour
journalctl -u areazine-processor --since '1 hour ago' | grep ERROR

# Database inspection
sqlite3 /storage/areazine/areazine.db
.mode column
.headers on
SELECT * FROM raw_data WHERE processed=0 LIMIT 10;
SELECT category, COUNT(*) FROM articles WHERE published=0 GROUP BY category;
```

---

## Growth Strategy

See [docs/growth-roadmap-1m.md](docs/growth-roadmap-1m.md) for comprehensive plan to 1M daily visits.

**Key milestones:**
- Month 1-3: Establish content foundation (10K+ articles)
- Month 3-6: SEO optimization, social seeding
- Month 6-12: Scale data sources, expand categories
- Month 12-24: Monetization, advanced features

---

## Next Actions

### High Priority

- [x] ~~Create Sentry project for error tracking~~ **DONE**
- [x] ~~Complete Bing Webmaster Tools verification~~ **DONE** (2026-02-11)
- [x] ~~Submit to Google Search Console~~ **DONE** (2026-02-11)
- [x] ~~Fix NHTSA source~~ **DONE** (campaignNumber endpoint, no auth needed)
- [x] ~~Add FDA Drug Shortages source~~ **DONE**
- [x] ~~Add AirNow air quality source~~ **DONE**
- [x] ~~Fix processor rate-limit spinning~~ **DONE** (per-cycle category tracking)
- [ ] Replace `gh` OAuth token with GitHub PAT for publisher
- [ ] Monitor pipeline output quality for 1-2 weeks
- [ ] Add Pagefind for client-side search
- [ ] Fix IndexNow 403 (verify API key setup for areazine.com)

### Medium Priority

- [ ] Add NHTSA complaints/investigations source (P2 from research)
- [ ] Add FDA adverse events source (P2 from research)
- [ ] Add NASA FIRMS wildfire detection (P2 from research)
- [ ] Build email newsletter (export to Mailpit/Listmonk)
- [ ] Add category-specific RSS feeds
- [ ] Implement article deduplication logic

### Low Priority

- [ ] Expand data sources (SEC, BLS, USPTO)
- [ ] Build admin dashboard for pipeline monitoring
- [ ] Add user engagement features (save articles, email alerts)
- [ ] Explore social media auto-posting
- [ ] Historical data imports (backfill USGS, NOAA archives)
- [ ] Add image support (pull from APIs, generate with Gemini Vision)

---

## Troubleshooting

### Pipeline not generating articles

```bash
# Check if fetcher is running
systemctl status areazine-fetcher

# Check if raw data exists
sqlite3 /storage/areazine/areazine.db "SELECT COUNT(*) FROM raw_data WHERE processed=0"

# Check processor logs for errors
journalctl -u areazine-processor --since '1 hour ago'

# Manually trigger processor (test mode)
cd /opt/areazine/repo/pipeline
node processor.js
```

### Articles not publishing

```bash
# Check if articles are ready
sqlite3 /storage/areazine/areazine.db "SELECT COUNT(*) FROM articles WHERE published=0"

# Check publisher logs
journalctl -u areazine-publisher --since '1 hour ago'

# Verify GitHub token
cd /opt/areazine/repo
git push origin main  # Should succeed without password prompt
```

### Gemini API errors

- Check quota: https://aistudio.google.com/app/apikey
- Verify API key in `/opt/areazine/repo/pipeline/.env`
- Check rate limit (1500 requests/day on free tier)
- Review Sentry for error patterns

### Sentry not reporting errors

- Verify `DATA_DIR=/data` in Aurora environment
- Check DSN in `astro.config.mjs` and `pipeline/.env`
- Trigger test error: `throw new Error('Sentry test');`
- Check Sentry project dashboard

---

## Credentials

**All credentials stored in `/opt/areazine/repo/pipeline/.env` (Aurora server, gitignored)**

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Google AI Studio API key |
| `GITHUB_TOKEN` | GitHub PAT for publisher |
| `INDEXNOW_KEY` | Bing IndexNow submission key |
| `SENTRY_DSN` | Sentry error tracking |
| `AIRNOW_API_KEY` | EPA AirNow API key |
| `DATA_GOV_API_KEY` | api.data.gov key (unused by FDA shortages, may be used by future sources) |

**Key files on Aurora:**
- `/opt/areazine/repo/pipeline/.env` — All environment variables
- `/opt/areazine/keys/airnow-api-key.txt` — AirNow API key (backup)

**Local development:** Copy `.env.example` to `.env` and populate with your own keys.

---

## Contact & Support

- **Email:** hello@areazine.com → mindaugas@kiznis.studio
- **GitHub Issues:** https://github.com/kiznis-studio/portal-areazine/issues
- **Sentry:** https://kiznis-studio.sentry.io/projects/areazine/

---

## AI Sidekick Operating Principles

### What I Should Always Do

1. **Verify pipeline state before making changes** - SSH to Aurora, check services/database
2. **Test changes locally** - Use sync scripts to get latest data, test full cycle
3. **Document decisions** - Add to Decision Log with date and rationale
4. **Monitor after deploy** - Check logs for at least 1 hour after restarting services
5. **Update this CLAUDE.md** - Keep it in sync with reality
6. **Respect rate limits** - Don't aggressive-tune without understanding API constraints
7. **Preserve quality** - Anti-hallucination checks are non-negotiable

### What I Should Never Do

1. **Modify database schema without migration** - Articles and raw_data are coupled
2. **Disable quality validation** - Silent hallucinations destroy credibility
3. **Remove rate limiting** - API abuse risks project shutdown
4. **Deploy untested pipeline changes** - Affects all three services, hard to rollback
5. **Commit .env files** - Credentials must stay gitignored
6. **Ignore Sentry errors** - Production errors indicate real user impact
7. **Assume articles are perfect** - Always review sample output after prompt changes

---

## Session Start Checklist

1. Read this CLAUDE.md completely
2. Check pipeline status: `ssh root@158.101.199.103 'systemctl status areazine-*'`
3. Review recent commits: `git log --oneline -10`
4. Check Sentry for errors: https://kiznis-studio.sentry.io/projects/areazine/
5. Verify live site: `curl -s https://areazine.com | head -20`

---

## Session End Checklist

1. Update Decision Log if decisions were made
2. Update Learnings if patterns discovered
3. Update Next Actions if priorities changed
4. Commit this file: `git add CLAUDE.md && git commit -m "Update Areazine project state"`
5. Push changes: `git push origin main`

---

**Last Updated:** 2026-02-11 (Phase 2: all 8 sources operational, 135+ articles)
