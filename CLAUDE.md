# Areazine

Automated US safety alerts news portal transforming government public data (CPSC, FDA, NOAA, USGS) into SEO-optimized articles using Gemini Flash.

**Live URL:** https://areazine.com
**Growth Roadmap:** [docs/growth-roadmap-1m.md](docs/growth-roadmap-1m.md)

---

## Quick Context

- **Status:** **LIVE** (launched 2026-02-11)
- **Architecture:** Astro 5 static site + Node.js pipeline (Aurora server)
- **Content:** Automated article generation from government APIs
- **Traffic:** Minimal (new site, awaiting index)
- **Revenue:** $0/mo (AdSense not applied yet)
- **Phase:** Bootstrap - establishing content foundation

---

## Project Overview

### Positioning

Automated news aggregator covering US public safety alerts:
- Product recalls (CPSC, FDA)
- Weather alerts (NOAA)
- Earthquake reports (USGS)
- Vehicle recalls (NHTSA - paused, needs auth)

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
- **Database:** SQLite at `/data/areazine.db`
- **Services:** 3 systemd daemons (fetcher, processor, publisher)
- **AI Model:** Gemini Flash 2.0 (`gemini-2.0-flash-001`)
- **Cost estimate:** ~$5-10/month for 2-4K articles/day

#### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FETCHER (areazine-fetcher)                │
│  Polls government APIs → stores raw JSON in SQLite           │
│  Intervals: CPSC/FDA 4h, NOAA 1h, USGS 30min                │
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
- **Production check:** `DATA_DIR === '/data'` (Aurora environment)
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
| **NOAA** | api.weather.gov/alerts/active | weather | 1 hour | Active | 20/24h |
| **USGS** | earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson | earthquakes | 30 minutes | Active | 15/24h |
| **NHTSA** | api.nhtsa.gov/recalls/recallsByVehicle | recalls-vehicles | N/A | **Paused** | N/A |

**NHTSA status:** API now requires authentication. Need to apply for API key or find alternative endpoint.

### Rate Limiting Logic

Pipeline tracks publication counts per category in 24-hour rolling windows. When limit reached:
- Record remains unprocessed (not marked as failed)
- Will be retried in next processing cycle
- Automatic cleanup after limit window expires

### Data Quality

**Anti-hallucination validation** (in `pipeline/lib/quality.js`):
- CPSC: Match recall number exactly
- FDA: Match recall number exactly
- NOAA: Match event ID exactly
- USGS: Match magnitude (rounded to 1 decimal)
- Failed validation → article discarded, record marked processed

**NOAA data flattening:** GeoJSON Feature objects stored as flat properties in SQLite for simpler querying.

---

## Content Categories

| Category Slug | Display Name | Source(s) | Article Count |
|--------------|--------------|-----------|---------------|
| `recalls-cpsc` | Product Recalls | CPSC | 14+ |
| `recalls-fda` | FDA Recalls | FDA | TBD |
| `recalls-vehicles` | Vehicle Recalls | NHTSA | 0 (paused) |
| `weather` | Weather Alerts | NOAA | TBD |
| `earthquakes` | Earthquake Reports | USGS | TBD |

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
ssh root@158.101.199.103 "sqlite3 /data/areazine.db \"SELECT source, COUNT(*) as cnt, SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) as pending FROM raw_data GROUP BY source\""
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
DATA_DIR=/data               # Production flag for Sentry
DATABASE_PATH=/data/areazine.db
GITHUB_TOKEN=...             # For publisher git push
INDEXNOW_KEY=766538bdafcc4bf2b8f3a2d4d4d0b9fa
SENTRY_DSN=https://...       # Pipeline error tracking
```

**GitHub Token:** Currently uses `gh` OAuth token. Should be replaced with fine-grained PAT:
- Repo: `portal-areazine`
- Permissions: Contents (Read/Write)

---

## Database Schema

**File:** `pipeline/lib/db.js`

### Tables

#### `raw_data`
Raw API responses before processing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `source` | TEXT | cpsc, fda, nhtsa, noaa, usgs |
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
| `pipeline/fetcher.js` | API polling service |
| `pipeline/processor.js` | Gemini article generation |
| `pipeline/publisher.js` | Git push + IndexNow |
| `pipeline/lib/db.js` | SQLite schema + prepared statements |
| `pipeline/lib/quality.js` | Anti-hallucination validator |
| `pipeline/lib/sentry.js` | Sentry initialization (production-only) |
| `pipeline/lib/gemini.js` | Gemini API client |
| `pipeline/prompts/` | Article generation prompts per category |

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
- [x] Category pages (/recalls, /weather, /earthquakes)
- [x] Category-specific pages (/recalls/cpsc, /recalls/fda, etc.)
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

- **NHTSA open API** - Now requires authentication, can't poll freely
- **gh OAuth tokens for publisher** - Expire unpredictably, use PAT instead
- **Aggressive rate limiting** - Initial 10/day was too conservative, bumped to 15-30

### Patterns Discovered

- **Magnitude rounding for USGS** - API returns float (4.567), Gemini generates rounded (4.6), validator must round for comparison
- **NOAA GeoJSON complexity** - Store as flat properties, not nested Feature objects
- **Rate limit as quality control** - Forces focus on high-value content (significant earthquakes, major recalls)
- **Production-only Sentry** - Check `DATA_DIR === '/data'` to differentiate environments
- **Article slug truncation** - Limit to 80 chars to avoid URL encoding issues
- **Separated services benefit** - Fetcher keeps running even if processor crashes

### Pipeline Failure Modes

| Failure | Symptom | Recovery |
|---------|---------|----------|
| Gemini API timeout | Unprocessed records accumulate | Auto-retry next cycle (30s-4h) |
| Quality validation fail | Article discarded, record marked processed | Manual review of raw_data if recurring |
| Git push failure | Articles unpublished, queue grows | Check GitHub token, restart publisher |
| API rate limit hit | No new records fetched | Wait for interval, automatic resume |
| Database lock | Service waits, may timeout | SQLite WAL mode enabled, rare issue |

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
ssh root@158.101.199.103 'sqlite3 /data/areazine.db "SELECT source, COUNT(*) as total, SUM(CASE WHEN processed=0 THEN 1 ELSE 0 END) as pending FROM raw_data GROUP BY source"'

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
  'recalls-cpsc': 30,      // per 24 hours
  'recalls-fda': 30,
  'weather': 20,
  'earthquakes': 15,
};
```

Restart processor: `systemctl restart areazine-processor`

### Fix NHTSA Source

1. Apply for NHTSA API key at https://vpic.nhtsa.dot.gov/api/
2. Add `NHTSA_API_KEY` to `/opt/areazine/repo/pipeline/.env`
3. Update fetcher to use authenticated endpoint
4. Restart fetcher: `systemctl restart areazine-fetcher`

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
sqlite3 /data/areazine.db
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

- [ ] Create Sentry project for error tracking
- [ ] Complete Bing Webmaster Tools verification (add CNAME record)
- [ ] Replace `gh` OAuth token with GitHub PAT for publisher
- [ ] Fix NHTSA source (apply for API key or use alternative endpoint)
- [ ] Monitor pipeline output quality for 1-2 weeks
- [ ] Add Pagefind for client-side search

### Medium Priority

- [ ] Expand data sources (SEC, BLS, USPTO)
- [ ] Build email newsletter (export to Mailpit/Listmonk)
- [ ] Add category-specific RSS feeds
- [ ] Implement article deduplication logic
- [ ] Add image support (pull from APIs, generate with Gemini Vision)

### Low Priority

- [ ] Build admin dashboard for pipeline monitoring
- [ ] Add user engagement features (save articles, email alerts)
- [ ] Explore social media auto-posting
- [ ] A/B test headline variations

---

## Troubleshooting

### Pipeline not generating articles

```bash
# Check if fetcher is running
systemctl status areazine-fetcher

# Check if raw data exists
sqlite3 /data/areazine.db "SELECT COUNT(*) FROM raw_data WHERE processed=0"

# Check processor logs for errors
journalctl -u areazine-processor --since '1 hour ago'

# Manually trigger processor (test mode)
cd /opt/areazine/repo/pipeline
node processor.js
```

### Articles not publishing

```bash
# Check if articles are ready
sqlite3 /data/areazine.db "SELECT COUNT(*) FROM articles WHERE published=0"

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

**Last Updated:** 2026-02-11
