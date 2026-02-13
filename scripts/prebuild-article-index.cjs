#!/usr/bin/env node
/**
 * Pre-compute article-to-city mapping so city pages don't need
 * to call getCollection('articles') at build time.
 *
 * This decouples city page generation from article content,
 * allowing article-only builds to skip city page regeneration.
 *
 * Run before astro build: node scripts/prebuild-article-index.cjs
 */

const fs = require('fs');
const path = require('path');

const ARTICLES_DIR = path.join(__dirname, '..', 'src', 'content', 'articles');
const CITIES_FILE = path.join(__dirname, '..', 'src', 'data', 'us-cities.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'data', 'article-location-index.json');

function walkDir(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else if (entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Parse YAML frontmatter from markdown without external dependencies.
 * Handles quoted and unquoted string values.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const data = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[kv[1]] = val;
  }
  return data;
}

function main() {
  const start = Date.now();

  // Load cities
  const cities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf-8'));

  // Build city search terms: slug → [lowercased terms]
  const cityTerms = {};
  for (const city of cities) {
    cityTerms[city.slug] = [
      city.name.toLowerCase(),
      city.state.toLowerCase(),
      city.stateCode.toLowerCase(),
      city.countyName.toLowerCase().replace(' county', ''),
    ];
  }

  // Parse all articles
  const mdFiles = walkDir(ARTICLES_DIR);
  const articles = [];
  for (const file of mdFiles) {
    const raw = fs.readFileSync(file, 'utf-8');
    const data = parseFrontmatter(raw);
    // Article ID must match Astro 5 content collection IDs (filename only, no path)
    const id = path.basename(file, '.md');

    articles.push({
      id,
      title: data.title || '',
      summary: data.summary || '',
      category: data.category || '',
      sourceAgency: data.sourceAgency || '',
      publishedAt: data.publishedAt || '',
      severity: data.severity || '',
      location: data.location || '',
    });
  }

  // Sort articles by publishedAt descending (newest first)
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Match articles to cities
  const index = {}; // citySlug → article[]

  for (const city of cities) {
    const terms = cityTerms[city.slug];
    const matched = articles.filter(a => {
      const loc = (a.location || '').toLowerCase();
      return terms.some(term => loc.includes(term));
    });

    if (matched.length > 0) {
      // Keep top 6 per city (same as the page limit)
      index[city.slug] = matched.slice(0, 6);
    }
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index) + '\n');

  const matchedCities = Object.keys(index).length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[prebuild] ${articles.length} articles -> ${matchedCities} cities matched (${elapsed}s)`);
}

main();
