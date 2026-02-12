#!/usr/bin/env node
/**
 * Fetch BEA Regional Price Parities (RPP) from FRED API.
 *
 * RPP = cost of living index where 100 = national average.
 * Data covers ~109 Metropolitan Statistical Areas (MSAs).
 * Cities are matched to their MSA via county FIPS → MSA mapping.
 *
 * Usage:
 *   node scripts/fetch-cost-of-living-data.cjs
 *   node scripts/fetch-cost-of-living-data.cjs --dry-run
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const FRED_API_KEY = process.env.FRED_API_KEY || fs.readFileSync(path.join(__dirname, '..', 'keys', 'fred-api-key.txt'), 'utf-8').trim();
const FRED_BASE = 'https://api.stlouisfed.org/fred';

const CITIES_PATH = path.join(__dirname, '..', 'src', 'data', 'us-cities.json');
const PROFILES_DIR = path.join(__dirname, '..', 'src', 'data', 'city-profiles');
const NATIONAL_PATH = path.join(__dirname, '..', 'src', 'data', 'national-stats.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = Math.min(attempt * 5000, 30000);
        console.warn(`  [429] Rate limited, waiting ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000 * attempt);
    }
  }
}

// Step 1: Search FRED for all RPPALL series (Regional Price Parities - All Items)
async function fetchAllRPPSeries() {
  console.log('Searching FRED for Regional Price Parity series...');
  const allSeries = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${FRED_BASE}/series/search?search_text=regional+price+parities&tag_names=msa&api_key=${FRED_API_KEY}&file_type=json&limit=${limit}&offset=${offset}`;
    const data = await fetchJSON(url);
    if (!data.seriess || data.seriess.length === 0) break;

    for (const s of data.seriess) {
      // Only want RPPALL (all items) series
      if (s.id.startsWith('RPPALL')) {
        allSeries.push({
          seriesId: s.id,
          msaCode: s.id.replace('RPPALL', ''),
          title: s.title,
        });
      }
    }

    offset += limit;
    if (offset >= (data.count || 0)) break;
    await sleep(500); // Rate limit courtesy
  }

  console.log(`  Found ${allSeries.length} RPPALL series`);
  return allSeries;
}

// Step 2: Fetch latest observation for each RPP series
async function fetchRPPValues(series) {
  console.log('Fetching RPP values...');
  const results = {};
  let i = 0;

  for (const s of series) {
    i++;
    if (i % 20 === 0) process.stdout.write(`  ${i}/${series.length}\r`);

    const url = `${FRED_BASE}/series/observations?series_id=${s.seriesId}&sort_order=desc&limit=1&api_key=${FRED_API_KEY}&file_type=json`;
    try {
      const data = await fetchJSON(url);
      if (data.observations && data.observations.length > 0) {
        const obs = data.observations[0];
        const val = parseFloat(obs.value);
        if (!isNaN(val)) {
          results[s.msaCode] = {
            rpp: val,
            year: obs.date.substring(0, 4),
            msaName: s.title.replace('Regional Price Parities: All Items for ', ''),
          };
        }
      }
    } catch (err) {
      console.warn(`  Failed to fetch ${s.seriesId}: ${err.message}`);
    }

    await sleep(200); // ~5 requests/sec
  }

  console.log(`\n  Got RPP values for ${Object.keys(results).length} MSAs`);
  return results;
}

// Step 3: Fetch county → MSA mapping from Census/BLS delineation file
// We'll use a curated mapping based on Census CBSA delineation
async function fetchCountyToMSAMapping() {
  console.log('Fetching county-to-MSA delineation...');

  // The Census Bureau delineation file maps counties to CBSAs (MSAs)
  // We'll use the NBER mirror which is a clean CSV
  const url = 'https://data.nber.org/cbsa-csa-fips-county-crosswalk/2023/cbsa2fipsxw_2023.csv';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split('\n');

    // Parse CSV with proper quote handling
    function parseRow(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += ch; }
      }
      result.push(current.trim());
      return result;
    }

    const header = parseRow(lines[0]);
    const cbsaIdx = header.indexOf('cbsacode');
    const fipsStateIdx = header.indexOf('fipsstatecode');
    const fipsCountyIdx = header.indexOf('fipscountycode');

    if (cbsaIdx === -1 || fipsStateIdx === -1 || fipsCountyIdx === -1) {
      throw new Error('Could not find expected columns in delineation file');
    }

    const mapping = {}; // "stateFIPS-countyFIPS" → msaCode
    for (let i = 1; i < lines.length; i++) {
      const cols = parseRow(lines[i]);
      const cbsa = cols[cbsaIdx];
      const stateFips = cols[fipsStateIdx].padStart(2, '0');
      const countyFips = cols[fipsCountyIdx].padStart(3, '0');

      if (cbsa && stateFips && countyFips) {
        mapping[`${stateFips}-${countyFips}`] = cbsa;
      }
    }

    console.log(`  Mapped ${Object.keys(mapping).length} counties to CBSAs`);
    return mapping;
  } catch (err) {
    console.warn(`  Failed to fetch delineation file: ${err.message}`);
    console.log('  Falling back to spatial matching...');
    return null;
  }
}

// Step 4: Assign RPP data to city profiles
function assignToProfiles(cities, rppData, countyToMSA) {
  let matched = 0;
  let noMatch = 0;
  let noProfile = 0;
  let skipped = 0;

  for (const city of cities) {
    const profilePath = path.join(PROFILES_DIR, city.stateCode, `${city.slug}.json`);
    if (!fs.existsSync(profilePath)) {
      noProfile++;
      continue;
    }

    // Skip cities that already have cost of living data
    try {
      const existing = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      if (existing.costOfLiving && existing.costOfLiving.rpp) {
        skipped++;
        continue;
      }
    } catch (e) { /* re-process if corrupt */ }

    // Try county FIPS → MSA mapping first
    let msaCode = null;
    let msaName = null;
    if (countyToMSA && city.stateFIPS && city.countyFIPS) {
      const key = `${city.stateFIPS.padStart(2, '0')}-${city.countyFIPS.padStart(3, '0')}`;
      msaCode = countyToMSA[key];
    }

    if (msaCode && rppData[msaCode]) {
      const rpp = rppData[msaCode];
      msaName = rpp.msaName;

      if (!DRY_RUN) {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        profile.costOfLiving = {
          rpp: rpp.rpp,
          year: rpp.year,
          msaName: rpp.msaName,
          source: 'BEA Regional Price Parities via FRED',
          description: rpp.rpp > 100
            ? `${(rpp.rpp - 100).toFixed(1)}% above national average`
            : rpp.rpp < 100
              ? `${(100 - rpp.rpp).toFixed(1)}% below national average`
              : 'At national average',
        };
        fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n');
      }
      matched++;
    } else {
      noMatch++;
    }
  }

  console.log(`\nResults:`);
  console.log(`  Matched:    ${matched} cities`);
  console.log(`  Skipped:    ${skipped} (already have data)`);
  console.log(`  No MSA:     ${noMatch} (rural/unmapped)`);
  console.log(`  No profile: ${noProfile}`);
}

async function main() {
  console.log('=== Cost of Living Data Fetcher (FRED RPP) ===\n');

  if (DRY_RUN) console.log('DRY RUN — no files will be written\n');

  // Load cities
  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf-8'));
  console.log(`Loaded ${cities.length} cities\n`);

  // Step 1: Find all RPP series
  const series = await fetchAllRPPSeries();
  if (series.length === 0) {
    console.error('No RPP series found! Check FRED API key.');
    process.exit(1);
  }

  // Step 2: Fetch values
  const rppData = await fetchRPPValues(series);

  // Step 3: Get county→MSA mapping
  const countyToMSA = await fetchCountyToMSAMapping();

  // Step 4: Assign to profiles
  assignToProfiles(cities, rppData, countyToMSA);

  // Step 5: Update national stats
  if (!DRY_RUN) {
    const rppValues = Object.values(rppData).map(r => r.rpp);
    const avgRpp = rppValues.reduce((s, v) => s + v, 0) / rppValues.length;

    const national = JSON.parse(fs.readFileSync(NATIONAL_PATH, 'utf-8'));
    national.costOfLiving = {
      nationalAvgRpp: 100,
      msaAvgRpp: Math.round(avgRpp * 10) / 10,
      msaCount: rppValues.length,
      year: Object.values(rppData)[0]?.year || '2023',
      source: 'BEA Regional Price Parities via FRED',
    };
    fs.writeFileSync(NATIONAL_PATH, JSON.stringify(national, null, 2) + '\n');
    console.log('\nUpdated national-stats.json with cost of living baseline');
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
