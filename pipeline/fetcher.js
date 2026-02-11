/**
 * Areazine Fetcher Daemon
 * Polls government data APIs on configurable intervals.
 * Stores raw records in SQLite for processing.
 */

import { stmts, insertRawBatch } from './lib/db.js';

// Dynamic source imports
const sources = {
  cpsc: (await import('./lib/sources/cpsc.js')).fetch,
  fda: (await import('./lib/sources/fda.js')).fetch,
  nhtsa: (await import('./lib/sources/nhtsa.js')).fetch,
  noaa: (await import('./lib/sources/noaa.js')).fetch,
  usgs: (await import('./lib/sources/usgs.js')).fetch,
};

// Intervals in minutes (from env or defaults)
const intervals = {
  cpsc: parseInt(process.env.FETCH_INTERVAL_CPSC || '240'),
  fda: parseInt(process.env.FETCH_INTERVAL_FDA || '240'),
  nhtsa: parseInt(process.env.FETCH_INTERVAL_NHTSA || '240'),
  noaa: parseInt(process.env.FETCH_INTERVAL_NOAA || '60'),
  usgs: parseInt(process.env.FETCH_INTERVAL_USGS || '30'),
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if enough time has elapsed since last fetch for this source.
 */
function shouldFetch(source) {
  const row = stmts.lastFetch.get(source);
  if (!row) return true; // Never fetched

  const lastFetch = new Date(row.fetched_at + 'Z');
  const intervalMs = intervals[source] * 60 * 1000;
  return Date.now() - lastFetch.getTime() >= intervalMs;
}

/**
 * Fetch a single source and store results.
 */
async function fetchSource(name) {
  const fetchFn = sources[name];
  if (!fetchFn) {
    console.error(`[fetcher] Unknown source: ${name}`);
    return;
  }

  if (!shouldFetch(name)) {
    return; // Not time yet
  }

  console.log(`[fetcher] Fetching ${name}...`);

  try {
    const lastRow = stmts.lastFetch.get(name);
    const lastDate = lastRow ? lastRow.fetched_at : null;

    const records = await fetchFn(lastDate);
    const total = records.length;
    let inserted = 0;

    if (records.length > 0) {
      inserted = insertRawBatch(records);
    }

    stmts.insertFetchLog.run({
      source: name,
      new_records: inserted,
      total_records: total,
      error: null,
    });

    console.log(`[fetcher] ${name}: ${inserted} new / ${total} total records`);
  } catch (err) {
    console.error(`[fetcher] ${name} failed: ${err.message}`);
    stmts.insertFetchLog.run({
      source: name,
      new_records: 0,
      total_records: 0,
      error: err.message,
    });
  }
}

/**
 * Main loop — runs continuously, checking each source on its interval.
 */
async function main() {
  console.log('[fetcher] Starting areazine data fetcher');
  console.log(`[fetcher] Sources: ${Object.keys(sources).join(', ')}`);
  console.log(`[fetcher] Intervals: ${JSON.stringify(intervals)} (minutes)`);

  // Run forever
  while (true) {
    for (const name of Object.keys(sources)) {
      await fetchSource(name);
    }

    // Check stats
    const stats = stmts.stats.get();
    console.log(`[fetcher] DB: ${stats.total_raw} raw records, ${stats.pending_raw} pending processing`);

    // Sleep 60 seconds between cycles
    await sleep(60_000);
  }
}

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('[fetcher] Received SIGTERM, shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[fetcher] Received SIGINT, shutting down');
  process.exit(0);
});

main().catch(err => {
  console.error('[fetcher] Fatal error:', err);
  process.exit(1);
});
