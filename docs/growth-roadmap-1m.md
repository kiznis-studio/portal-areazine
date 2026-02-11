# Areazine Growth Roadmap: Path to 1M Daily Visits

## Vision
Areazine becomes THE go-to safety alerts platform in the US — the "weather.com of safety". Automated, comprehensive, location-aware, real-time.

## Current State (Feb 2026)
- **Articles**: ~80 (16 CPSC, 24 FDA, 27 weather, 8 earthquakes)
- **Pipeline**: 3 autonomous services (fetcher, processor, publisher)
- **Sources**: CPSC, FDA, NOAA, USGS (NHTSA auth-blocked)
- **Traffic**: Early stage, just launched
- **Revenue**: $0

## Target: 1M Daily Visits (~30M Monthly)
Benchmark: Weather.com gets 1.3B/mo with 68% direct, 30% organic.

## Milestone Targets

| Milestone | Daily Visits | Monthly | Target Date | Key Unlock |
|-----------|------------|---------|-------------|------------|
| M1 | 1,000 | 30K | Apr 2026 | Google News + 5 data sources |
| M2 | 10,000 | 300K | Jul 2026 | City pages + push notifications |
| M3 | 50,000 | 1.5M | Oct 2026 | Programmatic SEO at scale |
| M4 | 100,000 | 3M | Jan 2027 | Google Discover + email digest |
| M5 | 500,000 | 15M | Jun 2027 | Brand pages + mobile app |
| M6 | 1,000,000 | 30M | Dec 2027 | Multi-channel dominance |

---

## Phase 1: Foundation (Feb-Apr 2026) — Target: 1K/day

### 1.1 Google News Compliance
- [ ] Add Google News sitemap (`/news-sitemap.xml`) — rolling 48-hour window, max 1000 URLs
- [ ] Add NewsArticle structured data (JSON-LD) to all article pages
- [ ] Add publisher info: name, logo, founding date
- [ ] Register in Google Publisher Center
- [ ] Ensure articles have: author name, publication date, clear headlines

### 1.2 Expand Data Sources (5→8)
- [ ] **EPA AirNow** — Real-time air quality alerts (free, no auth, hourly updates)
  - API: https://docs.airnowapi.org/ (requires free API key)
  - Content: "[city] air quality", "is it safe to go outside"
  - Estimated: 50-200 alerts/day during wildfire/pollution events
- [ ] **FEMA Disaster Declarations** — Disaster alerts, emergency declarations
  - API: https://www.fema.gov/about/openfema/api (free, no auth)
  - Content: "[state] disaster declaration", "FEMA emergency"
  - Estimated: 5-20/month
- [ ] **Fix NHTSA** — Vehicle recalls (currently auth-blocked)
  - Research alternative endpoints or apply for API key
  - Very high search volume: "car recall", "[model] recall check"
  - Historical data: 50 years × 200 recalls/year = 10,000+ pages

### 1.3 SEO Infrastructure (Template-Level)
- [ ] Article structured data (NewsArticle schema) in article layout
- [ ] BreadcrumbList schema on all pages
- [ ] FAQ schema where applicable (category pages)
- [ ] Organization schema on homepage
- [ ] WebSite schema with SearchAction (sitelinks search box)
- [ ] Custom favicon + apple-touch-icon + web manifest
- [ ] Dynamic OG images per article (title + category + source badge)
- [ ] Proper robots.txt with all sitemaps listed
- [ ] llms.txt for AI visibility

### 1.4 Content Quality
- [ ] Add "About Areazine" page with mission, data sources, methodology
- [ ] Add author/source attribution to each article
- [ ] Add "Last updated" timestamps
- [ ] Add related articles component
- [ ] Source links to official government pages
- [ ] Content freshness indicators (severity badges, time-since-published)

---

## Phase 2: Scale (Apr-Jul 2026) — Target: 10K/day

### 2.1 Programmatic City Pages
- [ ] Build city/county safety pages: ~3,000 US counties + top 500 cities
- [ ] Each page: local weather alerts + nearby earthquakes + regional recalls + air quality
- [ ] Only publish pages with 5+ pieces of content (avoid thin content)
- [ ] URL pattern: `/[state]/[city]/` (e.g., `/california/los-angeles/`)
- [ ] City metadata: lat/long, population, FEMA region, NOAA forecast zone

### 2.2 Push Notifications
- [ ] Integrate OneSignal (free tier: 10K subscribers)
- [ ] Prompt for subscription on article pages
- [ ] Send real-time push for urgent alerts (Extreme weather, major earthquakes M5+)
- [ ] Daily digest push for non-urgent recalls
- [ ] Location-based targeting (send LA earthquake to CA subscribers)

### 2.3 Email Newsletter
- [ ] Set up daily safety digest (auto-generated from pipeline)
- [ ] Email capture on all pages (non-intrusive footer/sidebar)
- [ ] Weekly roundup email (top 10 most important alerts)
- [ ] Use Mailchimp or self-hosted (existing Mailpit for dev)

### 2.4 Social Distribution
- [ ] Auto-post to Twitter/X on each publish (via n8n or Ayrshare API)
- [ ] Auto-post to relevant Reddit subreddits (r/recalls, r/weather, r/earthquakes)
- [ ] Create Bluesky presence
- [ ] Format: headline + severity + source + link

### 2.5 Additional Data Sources
- [ ] **FBI/Crime Data** — Location-based safety scores
  - API: https://api.usa.gov/crime/fbi/sapi
  - Content: "is [city] safe", "[city] crime rate 2026"
  - Estimated: 3,000+ city crime pages
- [ ] **SEC EDGAR** — Financial fraud alerts, company investigations
  - API: https://data.sec.gov/
  - Content: "[company] SEC investigation", "is [company] stock safe"
- [ ] **CDC** — Public health alerts, disease outbreaks
  - API: https://open.cdc.gov/apis.html
  - Content: "[disease] outbreak", "health advisory [state]"

---

## Phase 3: Authority (Jul-Dec 2026) — Target: 50K/day

### 3.1 Brand/Product Safety Pages
- [ ] "Is [brand] safe?" pages for top 10,000 consumer brands
- [ ] Aggregate all recalls by brand, product category
- [ ] Safety scores based on recall history
- [ ] URL pattern: `/brands/[brand-name]/`

### 3.2 Historical Data Import
- [ ] Import CPSC recall history (50 years, ~10,000 recalls)
- [ ] Import FDA recall history
- [ ] Import NHTSA recall history (VIN lookup integration)
- [ ] Create timeline/trend pages: "2025 recalls", "most recalled products"

### 3.3 Google Discover Optimization
- [ ] Dynamic featured images per article (auto-generated, 1200px+)
- [ ] Strengthen E-E-A-T: editorial standards page, source methodology
- [ ] Improve engagement metrics (time on page, scroll depth)
- [ ] Local relevance signals (US-focused, location-aware content)

### 3.4 Internal Linking Strategy
- [ ] Related articles component (by category, location, brand)
- [ ] City page → article cross-linking
- [ ] Brand page → recall article linking
- [ ] "More from [source]" sections

---

## Phase 4: Dominance (2027) — Target: 100K→1M/day

### 4.1 Mobile App / PWA
- [ ] Progressive Web App with offline support
- [ ] Mobile push notifications (native)
- [ ] Location-based alert feeds
- [ ] "My Safety Dashboard" (personalized by location + interests)

### 4.2 Real-Time Features
- [ ] WebSocket-based live alert feed
- [ ] "Breaking" alert banner on homepage
- [ ] Auto-refresh article pages for developing situations

### 4.3 Content at Scale
- Target: 100 automated articles/day across all sources
- 75,000-100,000 total indexed pages
- Mix: 30% real-time alerts, 50% location pages, 20% brand/product safety

### 4.4 Revenue
- [ ] Display ads (Mediavine/Ezoic at 50K+ sessions)
- [ ] Sponsored safety product reviews (emergency kits, detectors)
- [ ] Premium API access for businesses
- [ ] White-label safety feeds for local news sites

---

## Data Source Priority Matrix

| Source | API | Auth | Content/Day | Search Volume | Priority |
|--------|-----|------|-------------|---------------|----------|
| CPSC Recalls | ✅ Working | None | 2-5 | High | ✅ Active |
| FDA Recalls | ✅ Working | None | 5-15 | High | ✅ Active |
| NOAA Weather | ✅ Working | None | 20-100 | Very High | ✅ Active |
| USGS Earthquakes | ✅ Working | None | 5-20 | High | ✅ Active |
| NHTSA Vehicle | ❌ Auth blocked | Needs key | 2-5 | Very High | 🔴 Fix ASAP |
| EPA AirNow | Not started | Free key | 50-200 | High | 🟡 Phase 1 |
| FEMA Disasters | Not started | None | 1-5 | Medium | 🟡 Phase 1 |
| FBI Crime | Not started | Free key | N/A (static) | High | 🟡 Phase 2 |
| SEC EDGAR | Not started | None | 5-20 | Medium | 🟢 Phase 2 |
| CDC Health | Not started | None | 1-5 | Medium | 🟢 Phase 2 |

## Content Volume Projections

| Month | Articles/Day | Total Pages | Est. Daily Visits |
|-------|-------------|-------------|-------------------|
| Feb 2026 | 20-40 | 100 | 10-50 |
| Mar 2026 | 40-60 | 1,500 | 100-500 |
| Apr 2026 | 60-80 | 3,000 | 500-1,000 |
| Jul 2026 | 80-100 | 10,000+ city pages | 5,000-10,000 |
| Oct 2026 | 100+ | 25,000+ | 20,000-50,000 |
| Jan 2027 | 100+ | 50,000+ | 50,000-100,000 |
| Jun 2027 | 100+ | 75,000+ | 200,000-500,000 |
| Dec 2027 | 100+ | 100,000+ | 500,000-1,000,000 |

## Key Success Factors

1. **Utility drives loyalty** — Weather.com's 68% direct traffic proves people return when they NEED the info
2. **Google News inclusion** — Single biggest traffic lever for news sites
3. **Programmatic scale** — 22,000 county pages × 10 visits/day each = 220,000 visits/day
4. **Real-time freshness** — Search engines favor sites that update frequently
5. **Multi-channel distribution** — Don't depend solely on Google

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google algo change | Traffic drop | Diversify: email, push, direct, social |
| Thin content penalty | Pages deindexed | Quality thresholds, only publish with 5+ data points |
| API rate limits | Content gaps | Cache aggressively, multiple endpoints |
| LLM cost escalation | Budget overrun | Monitor Gemini usage, batch processing |
| Competition | Market share loss | Move fast, establish authority early |
