#!/usr/bin/env node
/**
 * Fetch state-level crime data from FBI Crime Data Explorer (CDE).
 *
 * Uses the CDE internal API to get crime rates per 100k for each state,
 * then assigns state-level rates to all cities in that state.
 *
 * Offense codes: ASS (assault), HOM (homicide), ROB (robbery),
 *   BUR (burglary), LAR (larceny), MVT (motor vehicle theft)
 *
 * Usage:
 *   node scripts/fetch-crime-data.cjs
 *   node scripts/fetch-crime-data.cjs --state=TX
 *   node scripts/fetch-crime-data.cjs --dry-run
 */

const fs = require('fs');
const path = require('path');

const STATE_FILTER = process.argv.find(a => a.startsWith('--state='))?.split('=')[1]?.toUpperCase() || null;
const DRY_RUN = process.argv.includes('--dry-run');

const PROFILE_DIR = path.join(__dirname, '..', 'src', 'data', 'city-profiles');
const NATIONAL_PATH = path.join(__dirname, '..', 'src', 'data', 'national-stats.json');

const CDE_BASE = 'https://cde.ucr.cjis.gov/LATEST';
const YEAR = 2022; // Most complete year available
const YEAR_FROM = `01-${YEAR}`;
const YEAR_TO = `12-${YEAR}`;

// Offense codes we want
const OFFENSES = {
  ASS: 'Aggravated Assault',
  HOM: 'Homicide',
  ROB: 'Robbery',
  BUR: 'Burglary',
  LAR: 'Larceny-Theft',
  MVT: 'Motor Vehicle Theft',
};

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
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000 * attempt);
    }
  }
}

async function fetchStateList() {
  const data = await fetchJSON(`${CDE_BASE}/lookup/states`);
  return data.get_states.cde_states_query.states; // [{abbr, name}, ...]
}

/** Sum monthly rates to get annual rate per 100k */
function sumMonthlyRates(rateObj) {
  if (!rateObj) return null;
  let total = 0;
  for (const [month, val] of Object.entries(rateObj)) {
    if (typeof val === 'number') total += val;
  }
  return Number(total.toFixed(1));
}

async function fetchOffenseForState(stateAbbr, offenseCode) {
  const url = `${CDE_BASE}/summarized/state/${stateAbbr}/${offenseCode}?from=${YEAR_FROM}&to=${YEAR_TO}&type=counts`;
  const data = await fetchJSON(url);

  if (!data?.offenses?.rates) return null;

  const rates = data.offenses.rates;
  // Find the state rate key like "California Offenses"
  const stateRateKey = Object.keys(rates).find(k => k.endsWith(' Offenses') && !k.startsWith('United States'));
  const nationalRateKey = 'United States Offenses';

  const stateRate = stateRateKey ? sumMonthlyRates(rates[stateRateKey]) : null;
  const nationalRate = sumMonthlyRates(rates[nationalRateKey]);

  return { stateRate, nationalRate };
}

async function fetchNationalRates() {
  console.log('[national] Fetching national crime rates...');
  const national = {};

  for (const [code, label] of Object.entries(OFFENSES)) {
    const url = `${CDE_BASE}/summarized/national/${code}?from=${YEAR_FROM}&to=${YEAR_TO}&type=counts`;
    const data = await fetchJSON(url);

    if (data?.offenses?.rates) {
      const rateKey = 'United States Offenses';
      national[code] = {
        label,
        rate: sumMonthlyRates(data.offenses.rates[rateKey]),
      };
    }

    await sleep(200);
  }

  return national;
}

async function main() {
  console.log('=== FBI Crime Data Fetcher (via CDE) ===\n');

  // Load city list
  const allCities = require('../src/data/us-cities.json');
  const maxTier = 2;
  let cities = allCities.filter(c => c.tier <= maxTier);
  if (STATE_FILTER) cities = cities.filter(c => c.stateCode === STATE_FILTER);

  console.log(`Cities: ${cities.length}`);

  // Get state list from CDE
  const cdeStates = await fetchStateList();
  const stateAbbrs = cdeStates.map(s => s.abbr);
  console.log(`CDE states: ${stateAbbrs.length}`);

  // Unique states we need
  const neededStates = [...new Set(cities.map(c => c.stateCode))].sort();
  if (STATE_FILTER) {
    console.log(`Filtering to: ${STATE_FILTER}`);
  }
  console.log(`States to fetch: ${neededStates.length}`);

  // Fetch national rates first
  const nationalRates = await fetchNationalRates();
  console.log('\nNational rates (per 100k):');
  for (const [code, data] of Object.entries(nationalRates)) {
    console.log(`  ${data.label}: ${data.rate}`);
  }

  // Compute aggregate national rates
  const violentNational = (nationalRates.ASS?.rate || 0) + (nationalRates.HOM?.rate || 0) +
    (nationalRates.ROB?.rate || 0);
  const propertyNational = (nationalRates.BUR?.rate || 0) + (nationalRates.LAR?.rate || 0) +
    (nationalRates.MVT?.rate || 0);
  console.log(`  Violent total: ${violentNational.toFixed(1)}`);
  console.log(`  Property total: ${propertyNational.toFixed(1)}`);

  // Fetch per-state crime rates
  const stateCrime = {}; // stateAbbr → { offenses }
  let callCount = 0;

  for (const stateAbbr of neededStates) {
    if (!stateAbbrs.includes(stateAbbr)) {
      console.warn(`  [skip] ${stateAbbr} not in CDE`);
      continue;
    }

    stateCrime[stateAbbr] = {};
    process.stdout.write(`\n[${stateAbbr}] `);

    for (const [code, label] of Object.entries(OFFENSES)) {
      try {
        const result = await fetchOffenseForState(stateAbbr, code);
        callCount++;
        stateCrime[stateAbbr][code] = result?.stateRate ?? null;
        process.stdout.write('.');
      } catch (err) {
        console.warn(`[err] ${stateAbbr}/${code}: ${err.message}`);
        stateCrime[stateAbbr][code] = null;
      }

      await sleep(150);
    }

    // Compute aggregate rates
    const s = stateCrime[stateAbbr];
    s.violentCrimeRate = Number(((s.ASS || 0) + (s.HOM || 0) + (s.ROB || 0)).toFixed(1));
    s.propertyCrimeRate = Number(((s.BUR || 0) + (s.LAR || 0) + (s.MVT || 0)).toFixed(1));
  }

  console.log(`\n\nAPI calls: ${callCount}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] Skipping file writes');
    console.log('\nSample data:');
    for (const [state, data] of Object.entries(stateCrime).slice(0, 3)) {
      console.log(`  ${state}:`, JSON.stringify(data));
    }
    return;
  }

  // Update national stats with crime baselines
  console.log('\n[national] Updating national-stats.json...');
  const natStats = JSON.parse(fs.readFileSync(NATIONAL_PATH, 'utf8'));
  natStats.avgViolentCrimeRate = Number(violentNational.toFixed(1));
  natStats.avgPropertyCrimeRate = Number(propertyNational.toFixed(1));
  natStats.avgAssaultRate = nationalRates.ASS?.rate || null;
  natStats.avgHomicideRate = nationalRates.HOM?.rate || null;
  natStats.avgRobberyRate = nationalRates.ROB?.rate || null;
  natStats.avgBurglaryRate = nationalRates.BUR?.rate || null;
  natStats.avgLarcenyRate = nationalRates.LAR?.rate || null;
  natStats.avgMotorVehicleTheftRate = nationalRates.MVT?.rate || null;
  fs.writeFileSync(NATIONAL_PATH, JSON.stringify(natStats, null, 2));

  // Merge crime data into city profiles
  console.log('[merge] Updating city profiles...');
  let updated = 0, skipped = 0;

  for (const city of cities) {
    const profilePath = path.join(PROFILE_DIR, city.stateCode, `${city.slug}.json`);

    if (!fs.existsSync(profilePath)) {
      skipped++;
      continue;
    }

    const crimeData = stateCrime[city.stateCode];
    if (!crimeData || !crimeData.violentCrimeRate) {
      skipped++;
      continue;
    }

    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    profile.crime = {
      year: YEAR,
      source: 'state',
      sourceLabel: 'FBI Crime Data Explorer (UCR Summary)',
      violentCrimeRate: crimeData.violentCrimeRate,
      propertyCrimeRate: crimeData.propertyCrimeRate,
      assaultRate: crimeData.ASS,
      homicideRate: crimeData.HOM,
      robberyRate: crimeData.ROB,
      burglaryRate: crimeData.BUR,
      larcenyRate: crimeData.LAR,
      motorVehicleTheftRate: crimeData.MVT,
    };

    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    updated++;
  }

  // Also update state profiles
  console.log('[states] Updating state profiles...');
  const STATE_DIR = path.join(__dirname, '..', 'src', 'data', 'state-profiles');
  let statesUpdated = 0;

  for (const [stateAbbr, crimeData] of Object.entries(stateCrime)) {
    const statePath = path.join(STATE_DIR, `${stateAbbr}.json`);
    if (!fs.existsSync(statePath)) continue;

    const stateProfile = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    stateProfile.crime = {
      year: YEAR,
      violentCrimeRate: crimeData.violentCrimeRate,
      propertyCrimeRate: crimeData.propertyCrimeRate,
      assaultRate: crimeData.ASS,
      homicideRate: crimeData.HOM,
      robberyRate: crimeData.ROB,
      burglaryRate: crimeData.BUR,
      larcenyRate: crimeData.LAR,
      motorVehicleTheftRate: crimeData.MVT,
    };

    fs.writeFileSync(statePath, JSON.stringify(stateProfile, null, 2));
    statesUpdated++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Cities updated: ${updated}`);
  console.log(`Cities skipped: ${skipped}`);
  console.log(`States updated: ${statesUpdated}`);
  console.log(`API calls: ${callCount}`);
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
