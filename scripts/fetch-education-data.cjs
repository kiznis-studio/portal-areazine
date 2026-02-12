#!/usr/bin/env node

/**
 * Add education data to city profiles from NCES Common Core of Data 2024-25
 *
 * Uses two files from https://nces.ed.gov/ccd/files.asp:
 * - School Directory (ccd_sch_029): school names, charter status, grade levels, location
 * - School Characteristics (ccd_sch_129): NSLP (lunch program) status, virtual status
 *
 * Schools are matched to city profiles by ZIP code → county FIPS mapping.
 * County FIPS is derived from the LEAID (first 2 digits = state FIPS) + school ZIP → county lookup.
 *
 * Usage:
 *   node scripts/fetch-education-data.cjs [--dry-run] [--limit=N]
 */

const fs = require('fs');
const path = require('path');
const { createReadStream } = require('fs');
const readline = require('readline');

const CITIES_FILE = path.join(__dirname, '../src/data/us-cities.json');
const PROFILES_DIR = path.join(__dirname, '../src/data/city-profiles');
const CACHE_DIR = path.join(__dirname, '.cache');

// The downloaded and unzipped NCES school directory CSV
const DIR_CSV = path.join(CACHE_DIR, 'ccd_sch_029_2425_w_1a_073025.csv');
// School characteristics (has NSLP/lunch program data)
const CHARS_CSV = path.join(CACHE_DIR, 'ccd_sch_129_2425_w_1a_073025.csv');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

/**
 * Parse CSV row handling quoted commas
 */
function parseCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Build a ZIP → county FIPS + stateCode mapping from city profiles
 */
function buildZipToCountyMap(cities) {
  // Map city name+state → county info for fuzzy matching
  const cityStateToCounty = new Map();

  for (const city of cities) {
    const key = `${city.name.toLowerCase()}|${city.stateCode}`;
    cityStateToCounty.set(key, {
      countyFIPS: city.countyFIPS,
      stateFIPS: city.stateFIPS,
      stateCode: city.stateCode,
      countyName: city.countyName
    });
  }

  return cityStateToCounty;
}

/**
 * Read school characteristics (NSLP data) into a map keyed by NCESSCH
 */
async function readCharacteristics() {
  if (!fs.existsSync(CHARS_CSV)) {
    console.log('⚠ No school characteristics file found, skipping NSLP data');
    return new Map();
  }

  const nslpMap = new Map();
  const fileStream = createReadStream(CHARS_CSV);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  let count = 0;

  for await (const line of rl) {
    if (!headers) {
      headers = parseCSVRow(line).map(h => h.replace(/^"|"$/g, ''));
      continue;
    }

    const values = parseCSVRow(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || '').replace(/^"|"$/g, ''); });

    const ncessch = row.NCESSCH;
    if (!ncessch) continue;

    nslpMap.set(ncessch, {
      nslp: row.NSLP_STATUS_TEXT || '',
      virtual: row.VIRTUAL_TEXT || ''
    });
    count++;
  }

  console.log(`Loaded ${count.toLocaleString()} school characteristics records`);
  return nslpMap;
}

/**
 * Read the directory CSV and aggregate schools by county
 */
async function processDirectoryCSV(cityStateToCounty, nslpMap) {
  if (!fs.existsSync(DIR_CSV)) {
    console.error(`\n❌ Directory CSV not found: ${DIR_CSV}`);
    console.error('\nDownload from https://nces.ed.gov/ccd/files.asp');
    console.error('Select: Nonfiscal → School → 2024-2025 → Directory\n');
    process.exit(1);
  }

  const countyData = new Map(); // key: "stateFIPS-countyFIPS" → schools array
  const fileStream = createReadStream(DIR_CSV);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  let lineCount = 0;
  let matched = 0;
  let unmatched = 0;

  console.log('📖 Reading school directory CSV...\n');

  for await (const line of rl) {
    lineCount++;

    if (lineCount === 1) {
      headers = parseCSVRow(line).map(h => h.replace(/^"|"$/g, ''));
      continue;
    }

    if (lineCount % 10000 === 0) {
      process.stdout.write(`\r  Processed ${lineCount.toLocaleString()} rows (${matched.toLocaleString()} matched)...`);
    }

    try {
      const values = parseCSVRow(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = (values[i] || '').replace(/^"|"$/g, ''); });

      // Skip non-open schools
      const status = row.SY_STATUS || row.SCH_STATUS_CODE || '';
      if (status !== '1') continue;

      // Try to match to a county via city name + state
      const city = (row.LCITY || '').toLowerCase().trim();
      const state = (row.ST || row.LSTATE || '').toUpperCase().trim();
      if (!city || !state) continue;

      const key = `${city}|${state}`;
      const county = cityStateToCounty.get(key);

      if (!county) {
        unmatched++;
        continue;
      }

      const countyKey = `${county.stateFIPS}-${county.countyFIPS}`;

      if (!countyData.has(countyKey)) {
        countyData.set(countyKey, { schools: [], stateCode: county.stateCode });
      }

      // School level from LEVEL column
      const levelStr = (row.LEVEL || '').toLowerCase();
      let schoolLevel = 0;
      if (levelStr.includes('elementary') || levelStr.includes('primary')) schoolLevel = 1;
      else if (levelStr.includes('middle')) schoolLevel = 2;
      else if (levelStr.includes('high') || levelStr.includes('secondary')) schoolLevel = 3;

      // Charter status
      const charter = (row.CHARTER_TEXT || '').toLowerCase() === 'yes' ? 1 : 0;

      // NSLP from characteristics
      const chars = nslpMap.get(row.NCESSCH || '');
      const nslpEligible = chars && chars.nslp && chars.nslp.toLowerCase().includes('yes') ? 1 : 0;
      const isVirtual = chars && chars.virtual && chars.virtual.toLowerCase() === 'yes' ? 1 : 0;

      // Grade range
      const loGrade = row.GSLO || '';
      const hiGrade = row.GSHI || '';

      countyData.get(countyKey).schools.push({
        schoolLevel,
        charter,
        nslpEligible,
        isVirtual,
        loGrade,
        hiGrade
      });

      matched++;
    } catch {
      continue;
    }
  }

  console.log(`\n✅ Matched ${matched.toLocaleString()} schools to ${countyData.size.toLocaleString()} counties`);
  console.log(`⚠ ${unmatched.toLocaleString()} schools could not be matched (city not in our profiles)\n`);

  return countyData;
}

/**
 * Aggregate education metrics for a county
 */
function aggregateEducation(schools) {
  if (!schools || schools.length === 0) return null;

  let elementary = 0, middle = 0, high = 0, other = 0;
  let charter = 0, nslp = 0, virtual = 0;

  for (const s of schools) {
    if (s.schoolLevel === 1) elementary++;
    else if (s.schoolLevel === 2) middle++;
    else if (s.schoolLevel === 3) high++;
    else other++;

    if (s.charter) charter++;
    if (s.nslpEligible) nslp++;
    if (s.isVirtual) virtual++;
  }

  const total = schools.length;

  return {
    source: 'NCES Common Core of Data 2024-25',
    totalSchools: total,
    elementarySchools: elementary,
    middleSchools: middle,
    highSchools: high,
    otherSchools: other,
    charterSchools: charter,
    charterPct: Math.round((charter / total) * 1000) / 10,
    nslpSchools: nslp,
    nslpPct: Math.round((nslp / total) * 1000) / 10,
    virtualSchools: virtual
  };
}

async function main() {
  console.log('📚 NCES Education Data Importer\n');
  if (dryRun) console.log('🔍 DRY RUN MODE\n');

  // Load cities
  const cities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
  console.log(`Loaded ${cities.length.toLocaleString()} cities`);

  // Build lookup map
  const cityStateToCounty = buildZipToCountyMap(cities);
  console.log(`City-state lookup: ${cityStateToCounty.size.toLocaleString()} entries\n`);

  // Read school characteristics
  const nslpMap = await readCharacteristics();

  // Process directory CSV
  const countyData = await processDirectoryCSV(cityStateToCounty, nslpMap);

  if (dryRun) {
    const sample = Array.from(countyData.entries())[0];
    if (sample) {
      console.log('Sample aggregated data:');
      console.log(JSON.stringify(aggregateEducation(sample[1].schools), null, 2));
    }
    return;
  }

  // Update city profiles
  console.log('📝 Updating city profiles...\n');
  let updated = 0, skipped = 0;

  // Build county → cities mapping
  const countyToCities = new Map();
  for (const city of cities) {
    const key = `${city.stateFIPS}-${city.countyFIPS}`;
    if (!countyToCities.has(key)) countyToCities.set(key, []);
    countyToCities.get(key).push(city);
  }

  const totalCounties = limit ? Math.min(limit, countyData.size) : countyData.size;
  let processed = 0;

  for (const [countyKey, { schools }] of countyData) {
    if (limit && processed >= limit) break;
    processed++;

    const eduData = aggregateEducation(schools);
    const citiesInCounty = countyToCities.get(countyKey) || [];

    for (const city of citiesInCounty) {
      const profilePath = path.join(PROFILES_DIR, city.stateCode, `${city.slug}.json`);
      if (!fs.existsSync(profilePath)) { skipped++; continue; }

      try {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        profile.education = eduData;
        fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n');
        updated++;
      } catch {
        skipped++;
      }
    }

    if (processed % 100 === 0) {
      process.stdout.write(`\r  ${processed}/${totalCounties} counties, ${updated} profiles updated...`);
    }
  }

  console.log(`\n\n✅ Updated ${updated.toLocaleString()} city profiles with education data`);
  if (skipped > 0) console.log(`⚠ Skipped ${skipped.toLocaleString()} profiles`);
  console.log('\n🎉 Education data import complete!');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
