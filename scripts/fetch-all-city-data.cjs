#!/usr/bin/env node
/**
 * Bulk-fetch city profile data for all 4,000+ cities.
 *
 * Strategy: Fetch ALL data from each source in bulk, then assemble per-city profiles.
 * ~60 API calls total instead of ~12,000 individual calls.
 *
 * Sources:
 *   - Census ACS 5-Year: County-level demographics & economics (50 state calls)
 *   - CDC PLACES: County-level health measures (1-2 bulk calls)
 *   - CMS Hospital Compare: Individual hospitals (1-2 bulk calls)
 *
 * Output:
 *   - src/data/city-profiles/{stateCode}/{slug}.json (per city)
 *   - src/data/state-profiles/{stateCode}.json (per state)
 *   - src/data/national-stats.json (national averages)
 *
 * Usage:
 *   node scripts/fetch-all-city-data.cjs
 *   node scripts/fetch-all-city-data.cjs --tier=1          # Top 500 only
 *   node scripts/fetch-all-city-data.cjs --state=TX         # Single state
 *   node scripts/fetch-all-city-data.cjs --skip-cdc         # Skip CDC
 *   node scripts/fetch-all-city-data.cjs --skip-cms         # Skip CMS
 */

const fs = require('fs');
const path = require('path');

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || '';
const TIER_FILTER = parseInt(process.argv.find(a => a.startsWith('--tier='))?.split('=')[1] || '2');
const STATE_FILTER = process.argv.find(a => a.startsWith('--state='))?.split('=')[1]?.toUpperCase() || null;
const SKIP_CDC = process.argv.includes('--skip-cdc');
const SKIP_CMS = process.argv.includes('--skip-cms');

const PROFILE_DIR = path.join(__dirname, '..', 'src', 'data', 'city-profiles');
const STATE_DIR = path.join(__dirname, '..', 'src', 'data', 'state-profiles');
const NATIONAL_PATH = path.join(__dirname, '..', 'src', 'data', 'national-stats.json');

// Census ACS 5-year variables
const CENSUS_VARS = [
  'B01001_001E',  // Total Population
  'B01002_001E',  // Median Age
  'B19013_001E',  // Median Household Income
  'B17001_001E',  // Total (poverty universe)
  'B17001_002E',  // Below poverty level
  'B25077_001E',  // Median Home Value
  'B25064_001E',  // Median Gross Rent
  'B23025_002E',  // In Labor Force
  'B23025_005E',  // Unemployed
  'B15003_001E',  // Education total (25+)
  'B15003_022E',  // Bachelor's degree
  'B15003_023E',  // Master's degree
  'B15003_024E',  // Professional degree
  'B15003_025E',  // Doctorate
  'B02001_001E',  // Race total
  'B02001_002E',  // White alone
  'B02001_003E',  // Black alone
  'B02001_005E',  // Asian alone
  'B03001_003E',  // Hispanic/Latino
  'B08301_001E',  // Total commuters
  'B08301_010E',  // Public transit commuters
  'B08006_017E',  // Work from home
];

// CDC PLACES measures
const CDC_MEASURES = [
  'DIABETES', 'OBESITY', 'BPHIGH', 'STROKE', 'CASTHMA', 'CHD',
  'MHLTH', 'PHLTH', 'CSMOKING', 'BINGE', 'SLEEP', 'ACCESS2',
  'CHECKUP', 'LPA', 'DENTAL',
];

const CDC_MEASURE_LABELS = {
  DIABETES: 'Diabetes', OBESITY: 'Obesity', BPHIGH: 'High Blood Pressure',
  STROKE: 'Stroke', CASTHMA: 'Current Asthma', CHD: 'Coronary Heart Disease',
  MHLTH: 'Frequent Mental Distress', PHLTH: 'Frequent Physical Distress',
  CSMOKING: 'Current Smoking', BINGE: 'Binge Drinking',
  SLEEP: 'Short Sleep Duration', ACCESS2: 'Lack of Health Insurance',
  CHECKUP: 'Annual Checkup', LPA: 'Physical Inactivity', DENTAL: 'Dental Visit',
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

function pct(numerator, denominator, digits = 1) {
  if (!denominator || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(digits));
}

// ────────────────────────────────────────────
// Census ACS — one call per state, all counties
// ────────────────────────────────────────────

async function fetchAllCensus(stateFIPSList) {
  console.log(`\n[census] Fetching ACS data for ${stateFIPSList.length} states...`);
  const censusMap = new Map(); // key: "48201" (stateFIPS+countyFIPS) → parsed data
  const vars = CENSUS_VARS.join(',');

  for (const stateFIPS of stateFIPSList) {
    const keyParam = CENSUS_API_KEY ? `&key=${CENSUS_API_KEY}` : '';
    const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,${vars}&for=county:*&in=state:${stateFIPS}${keyParam}`;

    try {
      const data = await fetchJSON(url);
      const headers = data[0];

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const countyFIPS = row[headers.indexOf('county')];
        const fipsKey = `${stateFIPS}${countyFIPS}`;

        const raw = {};
        for (const v of CENSUS_VARS) {
          raw[v] = Number(row[headers.indexOf(v)]) || 0;
        }

        const population = raw.B01001_001E;
        const raceTotal = raw.B02001_001E || 1;
        const whitePct = pct(raw.B02001_002E, raceTotal);
        const blackPct = pct(raw.B02001_003E, raceTotal);
        const asianPct = pct(raw.B02001_005E, raceTotal);
        const hispanicPct = pct(raw.B03001_003E, raceTotal);
        const otherPct = Number((100 - (whitePct || 0) - (blackPct || 0) - (asianPct || 0) - (hispanicPct || 0)).toFixed(1));

        censusMap.set(fipsKey, {
          population,
          medianAge: raw.B01002_001E,
          medianHouseholdIncome: raw.B19013_001E,
          medianHomeValue: raw.B25077_001E,
          medianRent: raw.B25064_001E,
          povertyRate: pct(raw.B17001_002E, raw.B17001_001E),
          unemploymentRate: pct(raw.B23025_005E, raw.B23025_002E),
          bachelorDegreeOrHigher: pct(
            raw.B15003_022E + raw.B15003_023E + raw.B15003_024E + raw.B15003_025E,
            raw.B15003_001E
          ),
          publicTransitPct: pct(raw.B08301_010E, raw.B08301_001E),
          workFromHomePct: pct(raw.B08006_017E, raw.B08301_001E),
          demographics: {
            white: whitePct,
            black: blackPct,
            asian: asianPct,
            hispanic: hispanicPct,
            other: otherPct,
          },
          source: 'Census Bureau ACS 5-Year Estimates (2022)',
        });
      }

      process.stdout.write(`\r[census] ${stateFIPS} done (${censusMap.size} counties total)   `);
    } catch (err) {
      console.warn(`\n[census] Error for state ${stateFIPS}: ${err.message}`);
    }

    await sleep(150);
  }

  console.log(`\n[census] Total: ${censusMap.size} counties loaded`);
  return censusMap;
}

// ────────────────────────────────────────────
// CDC PLACES — bulk fetch all county-level data
// ────────────────────────────────────────────

async function fetchAllCDC() {
  if (SKIP_CDC) {
    console.log('\n[cdc] Skipped (--skip-cdc)');
    return new Map();
  }

  console.log('\n[cdc] Bulk-fetching PLACES county health data...');
  const cdcMap = new Map(); // key: "48201" → { measures, totalPopulation }

  const measureFilter = CDC_MEASURES.map(m => `'${m}'`).join(',');
  let offset = 0;
  let totalRows = 0;

  while (true) {
    const url = `https://data.cdc.gov/resource/swc5-untb.json?$limit=50000&$offset=${offset}&datavaluetypeid=CrdPrv&$where=measureid in(${measureFilter})`;

    const data = await fetchJSON(url);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!row.locationid || !row.measureid || !row.data_value) continue;

      const fipsKey = row.locationid; // 5-digit county FIPS: "48201"

      if (!cdcMap.has(fipsKey)) {
        cdcMap.set(fipsKey, {
          measures: {},
          totalPopulation: row.totalpopulation ? Number(row.totalpopulation) : null,
        });
      }

      const entry = cdcMap.get(fipsKey);
      entry.measures[row.measureid] = {
        label: CDC_MEASURE_LABELS[row.measureid] || row.short_question_text,
        value: Number(row.data_value),
        unit: row.data_value_unit || '%',
        year: row.year,
      };
    }

    totalRows += data.length;
    process.stdout.write(`\r[cdc] ${totalRows} rows fetched, ${cdcMap.size} counties...   `);
    offset += 50000;

    if (data.length < 50000) break;
    await sleep(1000);
  }

  console.log(`\n[cdc] Total: ${cdcMap.size} counties with health data`);
  return cdcMap;
}

// ────────────────────────────────────────────
// CMS Hospital Compare — bulk fetch all hospitals
// ────────────────────────────────────────────

async function fetchAllCMS() {
  if (SKIP_CMS) {
    console.log('\n[cms] Skipped (--skip-cms)');
    return new Map();
  }

  console.log('\n[cms] Bulk-fetching Hospital Compare data...');
  const hospitalMap = new Map(); // key: "TX:HARRIS" → [hospital, ...]
  let offset = 0;
  let totalRows = 0;

  while (true) {
    const url = `https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0?limit=1500&offset=${offset}`;

    const data = await fetchJSON(url);
    const results = data?.results || [];
    if (results.length === 0) break;

    for (const h of results) {
      if (!h.state || !h.countyparish) continue;

      const key = `${h.state}:${h.countyparish.toUpperCase()}`;

      if (!hospitalMap.has(key)) {
        hospitalMap.set(key, []);
      }

      hospitalMap.get(key).push({
        name: h.facility_name,
        city: h.citytown,
        rating: h.hospital_overall_rating && h.hospital_overall_rating !== 'Not Available'
          ? Number(h.hospital_overall_rating) : null,
        type: h.hospital_type,
        emergency: h.emergency_services === 'Yes',
        ownership: h.hospital_ownership,
      });
    }

    totalRows += results.length;
    process.stdout.write(`\r[cms] ${totalRows} hospitals fetched, ${hospitalMap.size} counties...   `);
    offset += 1500;

    if (results.length < 1500) break;
    await sleep(500);
  }

  console.log(`\n[cms] Total: ${totalRows} hospitals across ${hospitalMap.size} counties`);
  return hospitalMap;
}

// ────────────────────────────────────────────
// Assemble profiles
// ────────────────────────────────────────────

function buildHospitalProfile(hospitals) {
  if (!hospitals || hospitals.length === 0) return null;

  const rated = hospitals.filter(h => h.rating != null);
  rated.sort((a, b) => b.rating - a.rating);

  const avgRating = rated.length > 0
    ? Number((rated.reduce((s, h) => s + h.rating, 0) / rated.length).toFixed(1))
    : null;

  return {
    hospitals: rated.slice(0, 10), // Top 10 by rating
    totalHospitals: hospitals.length,
    ratedHospitals: rated.length,
    averageRating: avgRating,
    source: 'CMS Hospital Compare (2024)',
  };
}

function buildCityProfile(city, census, cdc, hospitals) {
  return {
    city: city.name,
    slug: city.slug,
    state: city.state,
    stateCode: city.stateCode,
    county: city.countyName,
    lat: city.lat,
    lng: city.lng,
    fetchedAt: new Date().toISOString(),
    census: census || null,
    health: cdc ? { ...cdc, source: 'CDC PLACES (2023)' } : null,
    hospitals: hospitals || null,
  };
}

function buildStateProfile(stateCode, stateName, stateCities, censusMap) {
  // Use unique counties for state-level averages (avoid double-counting)
  const seenCounties = new Set();
  let incomeSum = 0, incomeCount = 0, homeSum = 0, homeCount = 0;

  for (const city of stateCities) {
    const fipsKey = `${city.stateFIPS}${city.countyFIPS}`;
    if (seenCounties.has(fipsKey)) continue;
    seenCounties.add(fipsKey);
    const census = censusMap.get(fipsKey);
    if (!census) continue;
    if (census.medianHouseholdIncome > 0) { incomeSum += census.medianHouseholdIncome; incomeCount++; }
    if (census.medianHomeValue > 0) { homeSum += census.medianHomeValue; homeCount++; }
  }

  // Rankings: use city-level population (from us-cities.json), county-level for income/home
  const topByPop = [...stateCities]
    .sort((a, b) => b.population - a.population)
    .slice(0, 10);

  const withCensus = stateCities
    .map(c => ({ ...c, census: censusMap.get(`${c.stateFIPS}${c.countyFIPS}`) }))
    .filter(c => c.census);

  // For income/home value, show one city per county (the largest) to avoid duplicates
  const seenForIncome = new Set();
  const uniqueByIncome = withCensus
    .filter(c => c.census.medianHouseholdIncome > 0)
    .sort((a, b) => b.population - a.population) // largest city per county wins
    .filter(c => {
      const key = `${c.stateFIPS}${c.countyFIPS}`;
      if (seenForIncome.has(key)) return false;
      seenForIncome.add(key);
      return true;
    })
    .sort((a, b) => b.census.medianHouseholdIncome - a.census.medianHouseholdIncome)
    .slice(0, 10);

  const seenForHome = new Set();
  const uniqueByHome = withCensus
    .filter(c => c.census.medianHomeValue > 0)
    .sort((a, b) => b.population - a.population)
    .filter(c => {
      const key = `${c.stateFIPS}${c.countyFIPS}`;
      if (seenForHome.has(key)) return false;
      seenForHome.add(key);
      return true;
    })
    .sort((a, b) => b.census.medianHomeValue - a.census.medianHomeValue)
    .slice(0, 10);

  // Total population from city-level data
  const totalPop = stateCities.reduce((s, c) => s + c.population, 0);

  return {
    stateCode,
    stateName,
    cityCount: stateCities.length,
    totalPopulation: totalPop,
    avgMedianIncome: incomeCount > 0 ? Math.round(incomeSum / incomeCount) : null,
    avgMedianHomeValue: homeCount > 0 ? Math.round(homeSum / homeCount) : null,
    rankings: {
      byPopulation: topByPop.map(c => ({ slug: c.slug, name: c.name, value: c.population })),
      byIncome: uniqueByIncome.map(c => ({ slug: c.slug, name: c.name, value: c.census.medianHouseholdIncome })),
      byHomeValue: uniqueByHome.map(c => ({ slug: c.slug, name: c.name, value: c.census.medianHomeValue })),
    },
    cities: stateCities.map(c => c.slug).sort(),
    generatedAt: new Date().toISOString(),
  };
}

function buildNationalStats(censusMap) {
  let popTotal = 0, incomeSum = 0, incomeCount = 0, homeSum = 0, homeCount = 0;
  let rentSum = 0, rentCount = 0, povertySum = 0, povertyCount = 0;

  for (const census of censusMap.values()) {
    popTotal += census.population || 0;
    if (census.medianHouseholdIncome > 0) { incomeSum += census.medianHouseholdIncome; incomeCount++; }
    if (census.medianHomeValue > 0) { homeSum += census.medianHomeValue; homeCount++; }
    if (census.medianRent > 0) { rentSum += census.medianRent; rentCount++; }
    if (census.povertyRate != null) { povertySum += census.povertyRate; povertyCount++; }
  }

  return {
    totalCounties: censusMap.size,
    avgMedianIncome: incomeCount > 0 ? Math.round(incomeSum / incomeCount) : null,
    avgMedianHomeValue: homeCount > 0 ? Math.round(homeSum / homeCount) : null,
    avgMedianRent: rentCount > 0 ? Math.round(rentSum / rentCount) : null,
    avgPovertyRate: povertyCount > 0 ? Number((povertySum / povertyCount).toFixed(1)) : null,
    generatedAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main() {
  console.log('=== Bulk City Data Fetcher ===\n');

  // Load city list
  const allCities = require('../src/data/us-cities.json');
  let cities = allCities.filter(c => c.tier <= TIER_FILTER);
  if (STATE_FILTER) cities = cities.filter(c => c.stateCode === STATE_FILTER);

  console.log(`Cities to process: ${cities.length} (tier <= ${TIER_FILTER}${STATE_FILTER ? `, state=${STATE_FILTER}` : ''})`);

  // Unique state FIPS codes
  const stateFIPSList = [...new Set(cities.map(c => c.stateFIPS))].sort();
  console.log(`Unique states: ${stateFIPSList.length}`);

  // Unique county keys (for reporting)
  const uniqueCounties = new Set(cities.map(c => `${c.stateFIPS}${c.countyFIPS}`));
  console.log(`Unique counties: ${uniqueCounties.size}`);

  // Fetch all data sources in parallel
  const [censusMap, cdcMap, hospitalMap] = await Promise.all([
    fetchAllCensus(stateFIPSList),
    fetchAllCDC(),
    fetchAllCMS(),
  ]);

  // Clean up old flat profiles (migrate to state subdirs)
  if (fs.existsSync(PROFILE_DIR)) {
    const oldFiles = fs.readdirSync(PROFILE_DIR).filter(f => f.endsWith('.json'));
    if (oldFiles.length > 0) {
      console.log(`\n[cleanup] Removing ${oldFiles.length} old flat profile files...`);
      for (const f of oldFiles) {
        fs.unlinkSync(path.join(PROFILE_DIR, f));
      }
    }
  }

  // Assemble and write per-city profiles
  console.log(`\n[build] Assembling ${cities.length} city profiles...`);
  let withCensus = 0, withCDC = 0, withCMS = 0;

  for (const city of cities) {
    const fipsKey = `${city.stateFIPS}${city.countyFIPS}`;
    const census = censusMap.get(fipsKey) || null;
    const cdc = cdcMap.get(fipsKey) || null;
    // County name format: "Mecklenburg County, North Carolina" → "MECKLENBURG"
    const countySearch = city.countyName
      .replace(/,.*$/, '')                    // Remove ", State Name"
      .replace(/ County$/, '')                // Remove " County"
      .replace(/ Parish$/, '')                // Remove " Parish" (Louisiana)
      .replace(/ Municipality$/, '')          // Remove " Municipality" (Alaska)
      .replace(/ Borough$/, '')               // Remove " Borough" (Alaska)
      .replace(/ Census Area$/, '')           // Remove " Census Area" (Alaska)
      .toUpperCase();
    const hospitalKey = `${city.stateCode}:${countySearch}`;
    const hospitalData = buildHospitalProfile(hospitalMap.get(hospitalKey) || []);

    if (census) withCensus++;
    if (cdc) withCDC++;
    if (hospitalData) withCMS++;

    const profile = buildCityProfile(city, census, cdc, hospitalData);

    // Write to state subdir
    const stateDir = path.join(PROFILE_DIR, city.stateCode);
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, `${city.slug}.json`), JSON.stringify(profile, null, 2));
  }

  console.log(`[build] Census data: ${withCensus}/${cities.length} cities (${(withCensus / cities.length * 100).toFixed(0)}%)`);
  console.log(`[build] CDC data: ${withCDC}/${cities.length} cities (${(withCDC / cities.length * 100).toFixed(0)}%)`);
  console.log(`[build] CMS data: ${withCMS}/${cities.length} cities (${(withCMS / cities.length * 100).toFixed(0)}%)`);

  // Build state profiles
  console.log('\n[states] Building state profiles...');
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const stateGroups = new Map();
  for (const city of cities) {
    if (!stateGroups.has(city.stateCode)) stateGroups.set(city.stateCode, []);
    stateGroups.get(city.stateCode).push(city);
  }

  for (const [stateCode, stateCities] of stateGroups) {
    const stateName = stateCities[0].state;
    const stateProfile = buildStateProfile(stateCode, stateName, stateCities, censusMap);
    fs.writeFileSync(path.join(STATE_DIR, `${stateCode}.json`), JSON.stringify(stateProfile, null, 2));
  }
  console.log(`[states] ${stateGroups.size} state profiles written`);

  // Build national stats
  console.log('\n[national] Building national averages...');
  const nationalStats = buildNationalStats(censusMap);
  fs.writeFileSync(NATIONAL_PATH, JSON.stringify(nationalStats, null, 2));
  console.log(`[national] Written to ${NATIONAL_PATH}`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Cities: ${cities.length}`);
  console.log(`State profiles: ${stateGroups.size}`);
  console.log(`Census coverage: ${(withCensus / cities.length * 100).toFixed(0)}%`);
  console.log(`CDC coverage: ${(withCDC / cities.length * 100).toFixed(0)}%`);
  console.log(`CMS coverage: ${(withCMS / cities.length * 100).toFixed(0)}%`);

  const totalSize = cities.length * 3; // rough estimate KB per file
  console.log(`Estimated disk: ~${Math.round(totalSize / 1024)}MB`);
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
