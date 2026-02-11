#!/usr/bin/env node
/**
 * Build master US city list from GeoNames + Census Bureau data.
 *
 * GeoNames provides: city name, state, county FIPS, lat/lng, population
 * Census ACS provides: authoritative population numbers
 *
 * Output: src/data/us-cities.json (~4,000+ cities with pop >= 10,000)
 *
 * Usage:
 *   node scripts/build-city-list.cjs
 *   node scripts/build-city-list.cjs --min-pop=25000   # higher threshold
 *   node scripts/build-city-list.cjs --skip-census      # GeoNames only (faster)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CENSUS_API_KEY = process.env.CENSUS_API_KEY || 'fefca46c57a4995cb42293c6d43811e0f7085bbf';
const MIN_POP = parseInt(process.argv.find(a => a.startsWith('--min-pop='))?.split('=')[1] || '10000');
const SKIP_CENSUS = process.argv.includes('--skip-census');

const GEONAMES_URL = 'https://download.geonames.org/export/dump/cities500.zip';
const GEONAMES_CACHE = '/tmp/geonames/cities500.txt';

const STATE_FIPS = {
  AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',
  FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',
  LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',
  NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',
  OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',
  VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56',PR:'72',
};

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
  LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',
  MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
  NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',
  OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',
  WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',PR:'Puerto Rico',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function slugify(name) {
  return name.toLowerCase()
    .replace(/['']/g, '')
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---- Step 1: Load GeoNames data ----

async function loadGeoNames() {
  if (!fs.existsSync(GEONAMES_CACHE)) {
    console.log('[geonames] Downloading cities500.zip...');
    fs.mkdirSync('/tmp/geonames', { recursive: true });
    execFileSync('curl', ['-sL', GEONAMES_URL, '-o', '/tmp/cities500.zip']);
    execFileSync('unzip', ['-o', '/tmp/cities500.zip', '-d', '/tmp/geonames/']);
  }

  console.log('[geonames] Parsing US cities...');
  const lines = fs.readFileSync(GEONAMES_CACHE, 'utf-8').split('\n');
  const cities = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const country = cols[8];
    if (country !== 'US') continue;

    const pop = parseInt(cols[14]) || 0;
    if (pop < MIN_POP) continue;

    const stateCode = cols[10];
    if (!STATE_FIPS[stateCode]) continue;

    const featureCode = cols[7];
    if (!featureCode.startsWith('PPL')) continue;

    cities.push({
      geonameid: cols[0],
      name: cols[2], // ASCII name
      stateCode,
      countyFIPS: cols[11] || '',
      lat: parseFloat(cols[4]),
      lng: parseFloat(cols[5]),
      population: pop,
    });
  }

  console.log(`[geonames] Found ${cities.length} US cities with pop >= ${MIN_POP}`);
  return cities;
}

// ---- Step 2: Fetch Census ACS populations ----

async function fetchCensusPopulations() {
  if (SKIP_CENSUS) {
    console.log('[census] Skipped (--skip-census flag)');
    return new Map();
  }

  console.log('[census] Fetching place-level populations from ACS...');
  const popMap = new Map();

  const stateCodes = Object.entries(STATE_FIPS)
    .filter(([code]) => code !== 'PR')
    .sort((a, b) => a[1].localeCompare(b[1]));

  for (const [stateCode, stateFIPS] of stateCodes) {
    try {
      const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,B01001_001E&for=place:*&in=state:${stateFIPS}&key=${CENSUS_API_KEY}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`[census] Failed for ${stateCode}: ${resp.status}`);
        continue;
      }
      const data = await resp.json();

      for (let i = 1; i < data.length; i++) {
        const [name, popStr] = data[i];
        const pop = parseInt(popStr) || 0;
        if (pop < MIN_POP) continue;

        const cityName = name
          .replace(/ (city|town|village|borough|CDP|municipality|unified government.*|metro government.*|consolidated government.*|city and borough),.*$/i, '')
          .trim();
        const key = `${stateCode}:${cityName.toLowerCase()}`;
        popMap.set(key, pop);
      }

      process.stdout.write(`\r[census] ${stateCode} (${popMap.size} cities so far)   `);
      await sleep(100);
    } catch (err) {
      console.warn(`\n[census] Error for ${stateCode}: ${err.message}`);
    }
  }

  console.log(`\n[census] Total: ${popMap.size} places with pop >= ${MIN_POP}`);
  return popMap;
}

// ---- Step 3: Fetch county names ----

async function fetchCountyNames() {
  console.log('[census] Fetching county names...');
  const countyMap = new Map();

  const stateFIPSList = [...new Set(Object.values(STATE_FIPS))].filter(f => f !== '72').sort();

  for (const stateFIPS of stateFIPSList) {
    try {
      const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME&for=county:*&in=state:${stateFIPS}&key=${CENSUS_API_KEY}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();

      for (let i = 1; i < data.length; i++) {
        const [name, st, co] = data[i];
        countyMap.set(`${st}:${co}`, name.replace(/, .*$/, ''));
      }
      await sleep(50);
    } catch { /* continue */ }
  }

  console.log(`[census] Loaded ${countyMap.size} county names`);
  return countyMap;
}

// ---- Step 4: Merge, deduplicate, output ----

// GeoNames entries to exclude (NYC boroughs are separate entries, DC neighborhoods, etc.)
const EXCLUDE_GEONAMES = new Set([
  // NYC boroughs — already covered by "New York City" entry
  'Brooklyn:NY', 'Queens:NY', 'Manhattan:NY', 'Staten Island:NY',
  'East New York:NY',
  // DC neighborhoods
  'Downtown:DC', 'Central 14th Street / Spring Road:DC', 'Northwest One:DC',
]);

function buildCityList(geoNamesCities, censusPopMap, countyNameMap) {
  console.log('[build] Merging data sources...');

  // Deduplicate: pick largest-pop entry per (name, stateCode)
  const deduped = new Map();
  for (const city of geoNamesCities) {
    // Skip known bad entries
    if (EXCLUDE_GEONAMES.has(`${city.name}:${city.stateCode}`)) continue;

    const key = `${city.name.toLowerCase()}:${city.stateCode}`;
    const existing = deduped.get(key);
    if (!existing || city.population > existing.population) {
      deduped.set(key, city);
    }
  }

  const cities = [];
  const slugCounts = new Map();

  for (const city of deduped.values()) {
    const stateFIPS = STATE_FIPS[city.stateCode];
    if (!stateFIPS) continue;

    // Prefer Census population (more authoritative)
    const censusKey = `${city.stateCode}:${city.name.toLowerCase()}`;
    const population = censusPopMap.get(censusKey) || city.population;

    // Skip if Census says pop is below threshold (GeoNames may be outdated)
    if (population < MIN_POP) continue;

    // Skip entries without county FIPS (can't fetch data for them)
    if (!city.countyFIPS) continue;

    const countyKey = `${stateFIPS}:${city.countyFIPS}`;
    const countyName = countyNameMap.get(countyKey) || '';

    const baseSlug = slugify(city.name);
    slugCounts.set(baseSlug, (slugCounts.get(baseSlug) || 0) + 1);

    cities.push({
      name: city.name,
      stateCode: city.stateCode,
      state: STATE_NAMES[city.stateCode] || city.stateCode,
      stateFIPS,
      countyFIPS: city.countyFIPS,
      countyName,
      population,
      lat: Math.round(city.lat * 10000) / 10000,
      lng: Math.round(city.lng * 10000) / 10000,
      _baseSlug: baseSlug,
    });
  }

  // Handle slug collisions: add state code for duplicates
  const duplicateSlugs = new Set(
    [...slugCounts.entries()].filter(([, count]) => count > 1).map(([slug]) => slug)
  );

  for (const city of cities) {
    city.slug = duplicateSlugs.has(city._baseSlug)
      ? `${city._baseSlug}-${city.stateCode.toLowerCase()}`
      : city._baseSlug;
    delete city._baseSlug;
  }

  // Verify no remaining collisions
  const slugSet = new Set();
  for (const city of cities) {
    if (slugSet.has(city.slug)) {
      // Extremely rare: two cities same name in same state. Append county.
      city.slug = `${city.slug}-${slugify(city.countyName || city.countyFIPS)}`;
    }
    slugSet.add(city.slug);
  }

  // Sort by population descending
  cities.sort((a, b) => b.population - a.population);

  // Add tier (top 500 = tier 1)
  cities.forEach((city, i) => {
    city.tier = i < 500 ? 1 : 2;
  });

  return cities;
}

// ---- Main ----

async function main() {
  console.log(`\n=== Building US City List (min pop: ${MIN_POP.toLocaleString()}) ===\n`);

  const geoNamesCities = await loadGeoNames();
  const [censusPopMap, countyNameMap] = await Promise.all([
    fetchCensusPopulations(),
    fetchCountyNames(),
  ]);

  const cities = buildCityList(geoNamesCities, censusPopMap, countyNameMap);

  const states = new Set(cities.map(c => c.stateCode));
  const withCounty = cities.filter(c => c.countyFIPS).length;
  const tier1 = cities.filter(c => c.tier === 1).length;
  const stateSlugCities = cities.filter(c => c.slug.match(/-[a-z]{2}$/)).length;

  console.log(`\n--- Results ---`);
  console.log(`Total cities: ${cities.length}`);
  console.log(`States: ${states.size}`);
  console.log(`With county FIPS: ${withCounty}`);
  console.log(`Tier 1 (top 500): ${tier1}`);
  console.log(`Slugs with state suffix: ${stateSlugCities}`);
  console.log(`Top 5: ${cities.slice(0, 5).map(c => `${c.name}, ${c.stateCode} (${c.population.toLocaleString()})`).join('; ')}`);
  console.log(`Bottom 5: ${cities.slice(-5).map(c => `${c.name}, ${c.stateCode} (${c.population.toLocaleString()})`).join('; ')}`);

  const outPath = path.join(__dirname, '..', 'src', 'data', 'us-cities.json');
  fs.writeFileSync(outPath, JSON.stringify(cities, null, 2));
  console.log(`\nWritten to: ${outPath}`);
  console.log(`File size: ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
