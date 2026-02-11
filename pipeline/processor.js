/**
 * Areazine Processor Daemon
 * Reads unprocessed raw data, generates articles via Gemini Flash,
 * validates quality, and stores in the articles table.
 */

import { readFileSync } from 'fs';
import { stmts } from './lib/db.js';
import { callGeminiJSON } from './lib/gemini.js';
import { validate } from './lib/quality.js';

// Load templates
const TEMPLATES = {
  recall: readFileSync(new URL('./templates/recall.md', import.meta.url), 'utf-8'),
  weather: readFileSync(new URL('./templates/weather.md', import.meta.url), 'utf-8'),
  earthquake: readFileSync(new URL('./templates/earthquake.md', import.meta.url), 'utf-8'),
};

// Map source to template type and metadata
const SOURCE_CONFIG = {
  cpsc: { template: 'recall', agency: 'CPSC', type: 'Consumer Product', category: 'recalls-cpsc' },
  fda: { template: 'recall', agency: 'FDA', type: 'Drug/Food', category: 'recalls-fda' },
  nhtsa: { template: 'recall', agency: 'NHTSA', type: 'Vehicle', category: 'recalls-vehicles' },
  noaa: { template: 'weather', agency: 'NOAA', type: 'Weather Alert', category: 'weather' },
  usgs: { template: 'earthquake', agency: 'USGS', type: 'Earthquake', category: 'earthquakes' },
};

const BATCH_SIZE = 10;
const SLEEP_EMPTY_MS = 30_000; // 30s when no pending records
const SLEEP_BETWEEN_MS = 2_000; // 2s between Gemini calls (rate limiting)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a URL-safe slug from a title.
 */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Decide if a raw record is worth turning into an article.
 * Returns false to skip (mark processed=3).
 */
function shouldProcess(rawRecord) {
  const data = JSON.parse(rawRecord.raw_json);

  // NOAA: Skip routine advisories, only keep significant alerts
  if (rawRecord.source === 'noaa') {
    const props = data.properties || data;
    const severity = props.severity;
    if (!severity || !['Extreme', 'Severe'].includes(severity)) {
      return false;
    }
    if (props.status === 'Test') return false;
  }

  // USGS: Skip minor earthquakes (M < 3.0)
  if (rawRecord.source === 'usgs') {
    const mag = data.mag ?? data.properties?.mag;
    if (mag == null || mag < 3.0) return false;
  }

  return true;
}

/**
 * Build the prompt for Gemini from template + raw data.
 */
function buildPrompt(rawRecord, config) {
  const template = TEMPLATES[config.template];
  if (!template) {
    throw new Error(`Unknown template: ${config.template}`);
  }

  return template
    .replace(/\{\{SOURCE_DATA\}\}/g, rawRecord.raw_json)
    .replace(/\{\{SOURCE_AGENCY\}\}/g, config.agency)
    .replace(/\{\{SOURCE_TYPE\}\}/g, config.type);
}

/**
 * Extract source URL from raw data based on source type.
 */
function extractSourceUrl(source, rawData) {
  switch (source) {
    case 'cpsc':
      return rawData.URL || 'https://www.cpsc.gov/Recalls';
    case 'fda':
      return `https://api.fda.gov/drug/enforcement.json?search=recall_number:${rawData.recall_number || ''}`;
    case 'nhtsa':
      return `https://www.nhtsa.gov/recalls?nhtsaId=${rawData.NHTSACampaignNumber || ''}`;
    case 'noaa':
      return rawData['@id'] || rawData.properties?.['@id'] || 'https://alerts.weather.gov';
    case 'usgs':
      return rawData.url || `https://earthquake.usgs.gov/earthquakes/eventpage/${rawData.ids || ''}`;
    default:
      return '';
  }
}

/**
 * Process a single raw record into an article.
 */
async function processRecord(rawRecord) {
  const config = SOURCE_CONFIG[rawRecord.source];
  if (!config) {
    console.warn(`[processor] Unknown source: ${rawRecord.source}, skipping`);
    stmts.markProcessed.run({ id: rawRecord.id, status: 3 });
    return;
  }

  // Editorial filter
  if (!shouldProcess(rawRecord)) {
    console.log(`[processor] Skipping ${rawRecord.id} (editorial filter)`);
    stmts.markProcessed.run({ id: rawRecord.id, status: 3 });
    return;
  }

  console.log(`[processor] Processing ${rawRecord.id}...`);

  try {
    const prompt = buildPrompt(rawRecord, config);
    const { data: article, tokens } = await callGeminiJSON(prompt, { maxTokens: 4096 });

    // Ensure category matches source
    article.category = config.category;

    // Validate
    const rawData = JSON.parse(rawRecord.raw_json);
    const { valid, issues } = validate(article, rawData, { sourceType: rawRecord.source });

    if (!valid) {
      console.warn(`[processor] Quality check failed for ${rawRecord.id}: ${issues.join('; ')}`);
      stmts.markProcessed.run({ id: rawRecord.id, status: 2 }); // 2 = failed
      return;
    }

    // Generate slug and store
    const slug = `${rawRecord.source}-${slugify(article.title)}`;
    const sourceUrl = extractSourceUrl(rawRecord.source, rawData);

    stmts.insertArticle.run({
      id: slug,
      source_id: rawRecord.id,
      title: article.title,
      summary: article.summary,
      body_md: article.body_md,
      category: article.category,
      tags: JSON.stringify(article.tags || []),
      location: article.location || 'National',
      severity: article.severity || null,
      source_url: sourceUrl,
      source_agency: config.agency,
      tokens_used: tokens,
    });

    stmts.markProcessed.run({ id: rawRecord.id, status: 1 }); // 1 = processed
    console.log(`[processor] Generated: "${article.title}" (${tokens} tokens)`);
  } catch (err) {
    console.error(`[processor] Failed ${rawRecord.id}: ${err.message}`);
    stmts.markProcessed.run({ id: rawRecord.id, status: 2 }); // 2 = failed
  }
}

/**
 * Main loop — processes pending records continuously.
 */
async function main() {
  console.log('[processor] Starting areazine article processor');

  while (true) {
    const pending = stmts.getUnprocessed.all(BATCH_SIZE);

    if (pending.length === 0) {
      await sleep(SLEEP_EMPTY_MS);
      continue;
    }

    console.log(`[processor] Found ${pending.length} pending records`);

    for (const record of pending) {
      await processRecord(record);
      await sleep(SLEEP_BETWEEN_MS); // Rate limit Gemini calls
    }

    const stats = stmts.stats.get();
    console.log(`[processor] DB: ${stats.total_articles} articles, ${stats.pending_articles} pending publish`);
  }
}

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('[processor] Received SIGTERM, shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[processor] Received SIGINT, shutting down');
  process.exit(0);
});

main().catch(err => {
  console.error('[processor] Fatal error:', err);
  process.exit(1);
});
