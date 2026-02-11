#!/usr/bin/env node
/**
 * Fetch historical Census ACS 5-Year data for all cities (2013-2023).
 *
 * Adds a "history" section to each city profile JSON with yearly snapshots
 * of key metrics: population, income, poverty, home value, unemployment.
 *
 * Usage:
 *   node scripts/fetch-historical-data.cjs
 *   node scripts/fetch-historical-data.cjs --state=TX
 *   node scripts/fetch-historical-data.cjs --year=2023     # Single year only
 *   node scripts/fetch-historical-data.cjs --dry-run       # Don't write files
 */

const fs = require('fs');
const path = require('path');

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const STATE_FILTER = process.argv.find(a => a.startsWith('--state='))?.split('=')[1]?.toUpperCase() || null;
const YEAR_FILTER = process.argv.find(a => a.startsWith('--year='))?.split('=')[1] || null;
const DRY_RUN = process.argv.includes('--dry-run');

const PROFILE_DIR = path.join(__dirname, '..', 'src', 'data', 'city-profiles');

// Years with ACS 5-year data available (2013-2023)
const ALL_YEARS = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
const YEARS = YEAR_FILTER ? [parseInt(YEAR_FILTER)] : ALL_YEARS;

// Census variables for historical tracking
const HIST_VARS = [
  'B01001_001E',  // Total Population
  'B19013_001E',  // Median Household Income
  'B17001_001E',  // Total (poverty universe)
  'B17001_002E',  // Below poverty level
  'B25077_001E',  // Median Home Value
  'B23025_002E',  // In Labor Force
  'B23025_005E',  // Unemployed
];

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
      if (res.status === 404) return null; // Year/variable not available
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000 * attempt);
    }
  }
}

function pct(numerator, denominator, digits = 1) {
  if (!denominator || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(digits));
}

async function fetchYearForState(year, stateFIPS) {
  const keyParam = CENSUS_API_KEY ? `&key=${CENSUS_API_KEY}` : '';
  const vars = HIST_VARS.join(',');
  const url = `https://api.census.gov/data/${year}/acs/acs5?get=NAME,${vars}&for=county:*&in=state:${stateFIPS}${keyParam}`;

  const data = await fetchJSON(url);
  if (!data) return null;

  const headers = data[0];
  const result = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const countyFIPS = row[headers.indexOf('county')];
    const fipsKey = `${stateFIPS}${countyFIPS}`;

    const raw = {};
    for (const v of HIST_VARS) {
      const idx = headers.indexOf(v);
      raw[v] = idx >= 0 ? (Number(row[idx]) || 0) : 0;
    }

    result.set(fipsKey, {
      population: raw.B01001_001E,
      medianIncome: raw.B19013_001E > 0 ? raw.B19013_001E : null,
      povertyRate: pct(raw.B17001_002E, raw.B17001_001E),
      medianHomeValue: raw.B25077_001E > 0 ? raw.B25077_001E : null,
      unemploymentRate: pct(raw.B23025_005E, raw.B23025_002E),
    });
  }

  return result;
}

async function main() {
  console.log('=== Historical Census Data Fetcher ===\n');
  console.log(`Years: ${YEARS.join(', ')}`);

  // Load city list
  const allCities = require('../src/data/us-cities.json');
  const maxTier = 2;
  let cities = allCities.filter(c => c.tier <= maxTier);
  if (STATE_FILTER) cities = cities.filter(c => c.stateCode === STATE_FILTER);

  console.log(`Cities: ${cities.length}`);

  // Unique state FIPS
  const stateFIPSList = [...new Set(cities.map(c => c.stateFIPS))].sort();
  console.log(`States: ${stateFIPSList.length}`);

  // Build county→city mapping
  const countyToCities = new Map();
  for (const city of cities) {
    const fipsKey = `${city.stateFIPS}${city.countyFIPS}`;
    if (!countyToCities.has(fipsKey)) countyToCities.set(fipsKey, []);
    countyToCities.get(fipsKey).push(city);
  }

  // Fetch all years × all states
  // Structure: yearData[year] = Map<fipsKey, metrics>
  const yearData = {};
  let callCount = 0;
  let failCount = 0;

  for (const year of YEARS) {
    yearData[year] = new Map();
    process.stdout.write(`\n[${year}] Fetching...`);

    for (const stateFIPS of stateFIPSList) {
      try {
        const stateData = await fetchYearForState(year, stateFIPS);
        callCount++;

        if (stateData) {
          for (const [fips, metrics] of stateData) {
            yearData[year].set(fips, metrics);
          }
        }

        process.stdout.write(`.`);
      } catch (err) {
        failCount++;
        console.warn(`\n  [warn] ${year}/${stateFIPS}: ${err.message}`);
      }

      await sleep(200); // Respectful rate limiting
    }

    console.log(` ${yearData[year].size} counties`);
  }

  console.log(`\nAPI calls: ${callCount}, failures: ${failCount}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] Skipping file writes');
    return;
  }

  // Merge historical data into existing city profile JSONs
  console.log('\n[merge] Updating city profiles...');
  let updated = 0, skipped = 0;

  for (const city of cities) {
    const fipsKey = `${city.stateFIPS}${city.countyFIPS}`;
    const profilePath = path.join(PROFILE_DIR, city.stateCode, `${city.slug}.json`);

    if (!fs.existsSync(profilePath)) {
      skipped++;
      continue;
    }

    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    // Build history arrays
    const history = {
      years: [],
      population: [],
      medianIncome: [],
      povertyRate: [],
      medianHomeValue: [],
      unemploymentRate: [],
    };

    for (const year of ALL_YEARS) {
      const metrics = yearData[year]?.get(fipsKey);
      if (!metrics) continue;

      history.years.push(year);
      history.population.push(metrics.population);
      history.medianIncome.push(metrics.medianIncome);
      history.povertyRate.push(metrics.povertyRate);
      history.medianHomeValue.push(metrics.medianHomeValue);
      history.unemploymentRate.push(metrics.unemploymentRate);
    }

    // Only add if we have at least 3 years of data
    if (history.years.length >= 3) {
      profile.history = history;
      fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated} cities`);
  console.log(`Skipped: ${skipped} cities (no profile or insufficient data)`);
  console.log(`API calls: ${callCount}`);
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
