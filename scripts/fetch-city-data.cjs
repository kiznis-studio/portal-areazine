#!/usr/bin/env node
/**
 * Fetch city profile data from US government APIs.
 * Sources: Census ACS, CDC PLACES, CMS Hospital Compare
 * Output: src/data/city-profiles/[slug].json
 *
 * Usage: node scripts/fetch-city-data.cjs [--city slug]
 */

const { writeFileSync, mkdirSync } = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'data', 'city-profiles');

// City definitions (mirrored from src/data/cities.ts)
const CITIES = [
  { name: 'Charlotte', slug: 'charlotte', state: 'North Carolina', stateCode: 'NC', stateFIPS: '37', countyFIPS: '119', countyName: 'Mecklenburg County', lat: 35.2271, lng: -80.8431 },
  { name: 'Akron', slug: 'akron', state: 'Ohio', stateCode: 'OH', stateFIPS: '39', countyFIPS: '153', countyName: 'Summit County', lat: 41.0814, lng: -81.5190 },
  { name: 'Dallas', slug: 'dallas', state: 'Texas', stateCode: 'TX', stateFIPS: '48', countyFIPS: '113', countyName: 'Dallas County', lat: 32.7767, lng: -96.7970 },
  { name: 'Houston', slug: 'houston', state: 'Texas', stateCode: 'TX', stateFIPS: '48', countyFIPS: '201', countyName: 'Harris County', lat: 29.7604, lng: -95.3698 },
  { name: 'Atlanta', slug: 'atlanta', state: 'Georgia', stateCode: 'GA', stateFIPS: '13', countyFIPS: '121', countyName: 'Fulton County', lat: 33.7490, lng: -84.3880 },
  { name: 'Austin', slug: 'austin', state: 'Texas', stateCode: 'TX', stateFIPS: '48', countyFIPS: '453', countyName: 'Travis County', lat: 30.2672, lng: -97.7431 },
  { name: 'Boston', slug: 'boston', state: 'Massachusetts', stateCode: 'MA', stateFIPS: '25', countyFIPS: '025', countyName: 'Suffolk County', lat: 42.3601, lng: -71.0589 },
  { name: 'Chicago', slug: 'chicago', state: 'Illinois', stateCode: 'IL', stateFIPS: '17', countyFIPS: '031', countyName: 'Cook County', lat: 41.8781, lng: -87.6298 },
  { name: 'Denver', slug: 'denver', state: 'Colorado', stateCode: 'CO', stateFIPS: '08', countyFIPS: '031', countyName: 'Denver County', lat: 39.7392, lng: -104.9903 },
  { name: 'Detroit', slug: 'detroit', state: 'Michigan', stateCode: 'MI', stateFIPS: '26', countyFIPS: '163', countyName: 'Wayne County', lat: 42.3314, lng: -83.0458 },
  { name: 'Miami', slug: 'miami', state: 'Florida', stateCode: 'FL', stateFIPS: '12', countyFIPS: '086', countyName: 'Miami-Dade County', lat: 25.7617, lng: -80.1918 },
  { name: 'Phoenix', slug: 'phoenix', state: 'Arizona', stateCode: 'AZ', stateFIPS: '04', countyFIPS: '013', countyName: 'Maricopa County', lat: 33.4484, lng: -112.0740 },
  { name: 'Seattle', slug: 'seattle', state: 'Washington', stateCode: 'WA', stateFIPS: '53', countyFIPS: '033', countyName: 'King County', lat: 47.6062, lng: -122.3321 },
  { name: 'Los Angeles', slug: 'los-angeles', state: 'California', stateCode: 'CA', stateFIPS: '06', countyFIPS: '037', countyName: 'Los Angeles County', lat: 34.0522, lng: -118.2437 },
  { name: 'San Francisco', slug: 'san-francisco', state: 'California', stateCode: 'CA', stateFIPS: '06', countyFIPS: '075', countyName: 'San Francisco County', lat: 37.7749, lng: -122.4194 },
];

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
  'B02001_006E',  // Some other race alone
  'B02001_007E',  // Two or more races
  'B03001_003E',  // Hispanic/Latino
  'B08301_001E',  // Total commuters
  'B08301_010E',  // Public transit commuters
  'B08006_017E',  // Work from home
];

// CDC PLACES measures to fetch
const CDC_MEASURES = [
  'DIABETES',
  'OBESITY',
  'BPHIGH',
  'STROKE',
  'CASTHMA',
  'CHD',
  'MHLTH',
  'PHLTH',
  'CSMOKING',
  'BINGE',
  'SLEEP',
  'ACCESS2',
  'CHECKUP',
  'LPA',
  'DENTAL',
];

const CDC_MEASURE_LABELS = {
  DIABETES: 'Diabetes',
  OBESITY: 'Obesity',
  BPHIGH: 'High Blood Pressure',
  STROKE: 'Stroke',
  CASTHMA: 'Current Asthma',
  CHD: 'Coronary Heart Disease',
  MHLTH: 'Frequent Mental Distress',
  PHLTH: 'Frequent Physical Distress',
  CSMOKING: 'Current Smoking',
  BINGE: 'Binge Drinking',
  SLEEP: 'Short Sleep Duration',
  ACCESS2: 'Lack of Health Insurance',
  CHECKUP: 'Annual Checkup',
  LPA: 'Physical Inactivity',
  DENTAL: 'Dental Visit',
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

/**
 * Fetch Census ACS data for all cities in one batch per state.
 */
async function fetchCensusData() {
  console.log('[census] Fetching ACS 5-year estimates...');

  // Group cities by state to minimize API calls
  const byState = {};
  for (const city of CITIES) {
    if (!byState[city.stateFIPS]) byState[city.stateFIPS] = [];
    byState[city.stateFIPS].push(city);
  }

  const results = {};

  for (const [stateFIPS, cities] of Object.entries(byState)) {
    const countyList = cities.map(c => c.countyFIPS).join(',');
    const vars = CENSUS_VARS.join(',');
    const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,${vars}&for=county:${countyList}&in=state:${stateFIPS}`;

    try {
      const data = await fetchJSON(url);
      const headers = data[0];

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const countyFIPS = row[headers.indexOf('county')];
        const city = cities.find(c => c.countyFIPS === countyFIPS);
        if (!city) continue;

        const raw = {};
        for (const v of CENSUS_VARS) {
          raw[v] = Number(row[headers.indexOf(v)]) || 0;
        }

        const population = raw.B01001_001E;
        const povertyRate = raw.B17001_001E > 0
          ? ((raw.B17001_002E / raw.B17001_001E) * 100).toFixed(1)
          : null;
        const unemploymentRate = raw.B23025_002E > 0
          ? ((raw.B23025_005E / raw.B23025_002E) * 100).toFixed(1)
          : null;
        const bachelorPlus = raw.B15003_001E > 0
          ? (((raw.B15003_022E + raw.B15003_023E + raw.B15003_024E + raw.B15003_025E) / raw.B15003_001E) * 100).toFixed(1)
          : null;
        const transitPct = raw.B08301_001E > 0
          ? ((raw.B08301_010E / raw.B08301_001E) * 100).toFixed(1)
          : null;
        const wfhPct = raw.B08301_001E > 0
          ? ((raw.B08006_017E / raw.B08301_001E) * 100).toFixed(1)
          : null;

        // Race percentages (from B02001 race table — mutually exclusive, sums to 100%)
        const raceTotal = raw.B02001_001E || 1;
        const whitePct = ((raw.B02001_002E / raceTotal) * 100).toFixed(1);
        const blackPct = ((raw.B02001_003E / raceTotal) * 100).toFixed(1);
        const asianPct = ((raw.B02001_005E / raceTotal) * 100).toFixed(1);
        // "Other" = AI/AN + NHPI + Some other race + Two or more (remainder of race table)
        const otherPct = (100 - Number(whitePct) - Number(blackPct) - Number(asianPct)).toFixed(1);
        // Hispanic/Latino is an ethnicity (not a race) — shown separately, not in race breakdown
        const hispanicPct = raw.B03001_003E > 0
          ? ((raw.B03001_003E / (raw.B01001_001E || 1)) * 100).toFixed(1)
          : null;

        results[city.slug] = {
          population,
          medianAge: raw.B01002_001E,
          medianHouseholdIncome: raw.B19013_001E,
          medianHomeValue: raw.B25077_001E,
          medianRent: raw.B25064_001E,
          povertyRate: Number(povertyRate),
          unemploymentRate: Number(unemploymentRate),
          bachelorDegreeOrHigher: Number(bachelorPlus),
          publicTransitPct: Number(transitPct),
          workFromHomePct: Number(wfhPct),
          demographics: {
            white: Number(whitePct),
            black: Number(blackPct),
            asian: Number(asianPct),
            other: Number(otherPct),
          },
          hispanicPct: hispanicPct ? Number(hispanicPct) : null,
          source: 'Census Bureau ACS 5-Year Estimates (2022)',
        };

        console.log(`  [census] ${city.name}: pop ${population.toLocaleString()}, income $${raw.B19013_001E.toLocaleString()}`);
      }
    } catch (err) {
      console.error(`  [census] Error for state ${stateFIPS}: ${err.message}`);
    }

    // Small delay between state requests
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

/**
 * Fetch CDC PLACES health metrics for each county.
 */
async function fetchCDCData() {
  console.log('[cdc] Fetching PLACES health data...');
  const results = {};

  for (const city of CITIES) {
    const measureFilter = CDC_MEASURES.map(m => `'${m}'`).join(',');
    const url = `https://data.cdc.gov/resource/swc5-untb.json?$limit=50&stateabbr=${city.stateCode}&locationname=${encodeURIComponent(city.countyName.replace(' County', ''))}&datavaluetypeid=CrdPrv&$where=measureid in(${measureFilter})`;

    try {
      const data = await fetchJSON(url);
      const measures = {};

      for (const row of data) {
        if (row.measureid && row.data_value) {
          measures[row.measureid] = {
            label: CDC_MEASURE_LABELS[row.measureid] || row.short_question_text,
            value: Number(row.data_value),
            unit: row.data_value_unit || '%',
            year: row.year,
          };
        }
      }

      results[city.slug] = {
        measures,
        totalPopulation: data[0]?.totalpopulation ? Number(data[0].totalpopulation) : null,
        source: 'CDC PLACES (2023)',
      };

      console.log(`  [cdc] ${city.name}: ${Object.keys(measures).length} health measures`);
    } catch (err) {
      console.error(`  [cdc] Error for ${city.name}: ${err.message}`);
      results[city.slug] = { measures: {}, source: 'CDC PLACES (2023)' };
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}

/**
 * Fetch CMS Hospital Compare data for each county.
 */
async function fetchHospitalData() {
  console.log('[cms] Fetching Hospital Compare data...');
  const results = {};

  for (const city of CITIES) {
    // CMS API uses uppercase county name without "County"
    const countySearch = city.countyName.replace(' County', '').toUpperCase();

    const params = new URLSearchParams();
    params.set('limit', '20');
    params.set('offset', '0');
    params.set('conditions[0][property]', 'state');
    params.set('conditions[0][value]', city.stateCode);
    params.set('conditions[0][operator]', '=');
    params.set('conditions[1][property]', 'countyparish');
    params.set('conditions[1][value]', countySearch);
    params.set('conditions[1][operator]', '=');

    const url = `https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0?${params}`;

    try {
      const data = await fetchJSON(url);
      const hospitals = (data.results || [])
        .filter(h => h.hospital_overall_rating && h.hospital_overall_rating !== 'Not Available')
        .map(h => ({
          name: h.facility_name,
          city: h.citytown,
          rating: Number(h.hospital_overall_rating),
          type: h.hospital_type,
          emergency: h.emergency_services === 'Yes',
          ownership: h.hospital_ownership,
        }))
        .sort((a, b) => b.rating - a.rating);

      const totalHospitals = (data.results || []).length;
      const ratedHospitals = hospitals.length;
      const avgRating = ratedHospitals > 0
        ? (hospitals.reduce((s, h) => s + h.rating, 0) / ratedHospitals).toFixed(1)
        : null;

      results[city.slug] = {
        hospitals: hospitals.slice(0, 10), // Top 10
        totalHospitals,
        ratedHospitals,
        averageRating: avgRating ? Number(avgRating) : null,
        source: 'CMS Hospital Compare (2024)',
      };

      console.log(`  [cms] ${city.name}: ${totalHospitals} hospitals, avg rating ${avgRating || 'N/A'}`);
    } catch (err) {
      console.error(`  [cms] Error for ${city.name}: ${err.message}`);
      results[city.slug] = { hospitals: [], totalHospitals: 0, ratedHospitals: 0, averageRating: null, source: 'CMS Hospital Compare (2024)' };
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const targetSlug = args.includes('--city') ? args[args.indexOf('--city') + 1] : null;

  const citiesToProcess = targetSlug
    ? CITIES.filter(c => c.slug === targetSlug)
    : CITIES;

  if (citiesToProcess.length === 0) {
    console.error(`City not found: ${targetSlug}`);
    process.exit(1);
  }

  console.log(`Fetching data for ${citiesToProcess.length} cities...\n`);

  const [census, cdc, hospitals] = await Promise.all([
    fetchCensusData(),
    fetchCDCData(),
    fetchHospitalData(),
  ]);

  // Combine and write per-city profiles
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const city of citiesToProcess) {
    const profile = {
      city: city.name,
      slug: city.slug,
      state: city.state,
      stateCode: city.stateCode,
      county: city.countyName,
      lat: city.lat,
      lng: city.lng,
      fetchedAt: new Date().toISOString(),
      census: census[city.slug] || null,
      health: cdc[city.slug] || null,
      hospitals: hospitals[city.slug] || null,
    };

    const outPath = path.join(OUTPUT_DIR, `${city.slug}.json`);
    writeFileSync(outPath, JSON.stringify(profile, null, 2));
    console.log(`\nWrote ${outPath}`);
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
