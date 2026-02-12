#!/usr/bin/env node

/**
 * Add education data to city profiles from NCES Common Core of Data
 *
 * SETUP REQUIRED:
 * 1. Download school directory data from: https://nces.ed.gov/ccd/pubschuniv.asp
 * 2. Look for "School Data Files" for the latest year (2022-23 or 2023-24)
 * 3. Download the CSV file to: scripts/.cache/nces-schools.csv
 *
 * The file should have columns like:
 * - LEAID (Local Education Agency ID - first 2 digits are state FIPS)
 * - COUNTY_CODE (3-digit county FIPS)
 * - SCH_STATUS_CODE (1 = Open)
 * - TOTAL_STUDENTS (enrollment)
 * - FTE_CLASSROOM_TEACHER (full-time equivalent teachers)
 * - SCHOOL_LEVEL (Elementary, Middle, High)
 * - CHARTER_TEXT (Yes/No)
 * - TITLE_I_STATUS_CODE (1-5 = eligible/participating)
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
const CSV_FILE = path.join(CACHE_DIR, 'nces-schools.csv');

// Parse command line args
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
 * Process CSV and aggregate by county
 */
async function processCSV() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`\n❌ CSV file not found: ${CSV_FILE}`);
    console.error('\nPlease download the NCES school directory CSV:');
    console.error('1. Visit https://nces.ed.gov/ccd/pubschuniv.asp');
    console.error('2. Download the latest "School Data Files" CSV');
    console.error(`3. Save it to: ${CSV_FILE}\n`);
    process.exit(1);
  }

  const countyData = new Map();

  const fileStream = createReadStream(CSV_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let headers = null;
  let lineCount = 0;
  let schoolCount = 0;

  console.log('📖 Reading CSV file...\n');

  for await (const line of rl) {
    lineCount++;

    if (lineCount === 1) {
      // Parse headers
      headers = parseCSVRow(line).map(h => h.replace(/^"|"$/g, ''));
      continue;
    }

    if (lineCount % 10000 === 0) {
      process.stdout.write(`\r  Processed ${lineCount.toLocaleString()} rows, ${schoolCount.toLocaleString()} schools...`);
    }

    try {
      const values = parseCSVRow(line);
      const row = {};

      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });

      // Skip if not an active school
      if (row.SCH_STATUS_CODE !== '1' && row.SCH_STATUS_CODE !== '"1"') continue;

      // Get FIPS codes
      const leaState = row.LEAID ? row.LEAID.replace(/"/g, '').substring(0, 2) : '';
      let countyCode = row.COUNTY_CODE || row.COUNTY || '';
      countyCode = countyCode.replace(/"/g, '');

      if (!leaState || !countyCode) continue;

      // Pad county code to 3 digits
      countyCode = countyCode.padStart(3, '0');

      const countyFIPS = `${leaState}-${countyCode}`;

      if (!countyData.has(countyFIPS)) {
        countyData.set(countyFIPS, []);
      }

      // Parse numeric values
      const enrollmentStr = row.TOTAL_STUDENTS || row.ENROLLMENT || '0';
      const teachersStr = row.FTE_CLASSROOM_TEACHER || row.TEACHERS || '0';
      const enrollment = parseInt(enrollmentStr.replace(/"/g, '')) || 0;
      const teachers = parseFloat(teachersStr.replace(/"/g, '')) || 0;

      const charterStr = (row.CHARTER_TEXT || row.CHARTER || '').replace(/"/g, '');
      const charter = charterStr.toLowerCase() === 'yes' || charterStr === '1' ? 1 : 0;

      const titleIStr = (row.TITLE_I_STATUS_CODE || row.TITLE_I_STATUS || '0').replace(/"/g, '');
      const titleI = parseInt(titleIStr) || 0;

      // School level mapping
      let schoolLevel = 0;
      const level = (row.SCHOOL_LEVEL || '').replace(/"/g, '');
      if (level.includes('Elementary') || level.includes('Primary')) schoolLevel = 1;
      else if (level.includes('Middle')) schoolLevel = 2;
      else if (level.includes('High') || level.includes('Secondary')) schoolLevel = 3;

      countyData.get(countyFIPS).push({
        enrollment,
        teachers,
        charter,
        titleI,
        schoolLevel
      });

      schoolCount++;

    } catch (err) {
      // Skip malformed rows
      continue;
    }
  }

  console.log(`\n✅ Processed ${schoolCount.toLocaleString()} schools across ${countyData.size.toLocaleString()} counties\n`);

  return countyData;
}

/**
 * Aggregate education data from schools
 */
function aggregateEducationData(schools) {
  if (!schools || schools.length === 0) {
    return null;
  }

  let totalEnrollment = 0;
  let totalTeachers = 0;
  let elementarySchools = 0;
  let middleSchools = 0;
  let highSchools = 0;
  let charterSchools = 0;
  let titleISchools = 0;

  for (const school of schools) {
    totalEnrollment += school.enrollment;
    totalTeachers += school.teachers;

    if (school.schoolLevel === 1) elementarySchools++;
    else if (school.schoolLevel === 2) middleSchools++;
    else if (school.schoolLevel === 3) highSchools++;

    if (school.charter === 1) charterSchools++;
    if (school.titleI >= 1 && school.titleI <= 5) titleISchools++;
  }

  const studentTeacherRatio = totalTeachers > 0
    ? Math.round((totalEnrollment / totalTeachers) * 10) / 10
    : null;

  const charterPct = schools.length > 0
    ? Math.round((charterSchools / schools.length) * 1000) / 10
    : 0;

  const titleIPct = schools.length > 0
    ? Math.round((titleISchools / schools.length) * 1000) / 10
    : 0;

  return {
    source: "NCES Common Core of Data",
    totalSchools: schools.length,
    enrollment: totalEnrollment,
    studentTeacherRatio,
    elementarySchools,
    middleSchools,
    highSchools,
    charterSchools,
    charterPct,
    titleISchools,
    titleIPct
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('📚 Processing education data from NCES Common Core of Data...\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  // Process CSV
  const countyData = await processCSV();

  // Load cities
  const cities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
  console.log(`Loaded ${cities.length.toLocaleString()} cities`);

  // Get unique counties
  const countyMap = new Map();
  for (const city of cities) {
    const key = `${city.stateFIPS}-${city.countyFIPS}`;
    if (!countyMap.has(key)) {
      countyMap.set(key, {
        stateFIPS: city.stateFIPS,
        countyFIPS: city.countyFIPS,
        countyName: city.countyName,
        stateCode: city.stateCode,
        cities: []
      });
    }
    countyMap.get(key).cities.push(city);
  }

  const counties = Array.from(countyMap.values());
  const totalCounties = limit ? Math.min(limit, counties.length) : counties.length;

  console.log(`Found ${counties.length.toLocaleString()} unique counties`);
  if (limit) {
    console.log(`Limited to first ${limit} counties for testing`);
  }
  console.log();

  // Aggregate data
  const aggregatedData = new Map();
  let hasData = 0;
  let noData = 0;

  for (let i = 0; i < totalCounties; i++) {
    const county = counties[i];
    const { stateFIPS, countyFIPS, countyName, stateCode } = county;
    const key = `${stateFIPS}-${countyFIPS}`;

    const schools = countyData.get(key);

    if (!schools || schools.length === 0) {
      if (limit) { // Only log when testing
        console.log(`[${i + 1}/${totalCounties}] ${countyName}, ${stateCode} - No data`);
      }
      noData++;
    } else {
      const eduData = aggregateEducationData(schools);
      aggregatedData.set(key, eduData);
      if (limit) { // Only log when testing
        console.log(`[${i + 1}/${totalCounties}] ${countyName}, ${stateCode} - ${schools.length} schools, ${eduData.enrollment} students`);
      }
      hasData++;
    }

    // Progress indicator for full run
    if (!limit && (i + 1) % 100 === 0) {
      process.stdout.write(`\r  Processed ${i + 1}/${totalCounties} counties (${hasData} with data)...`);
    }
  }

  if (!limit) console.log(); // New line after progress

  console.log(`\n✅ ${hasData.toLocaleString()} counties with data, ${noData.toLocaleString()} without`);

  if (dryRun) {
    console.log('\n🔍 DRY RUN - Would update profiles but skipping writes\n');

    // Show sample data
    const firstCountyWithData = Array.from(aggregatedData.entries())[0];
    if (firstCountyWithData) {
      console.log('Sample education data:');
      console.log(JSON.stringify(firstCountyWithData[1], null, 2));
    }

    return;
  }

  console.log('\n📝 Updating city profiles...\n');

  // Group cities by state for batch writes
  const stateGroups = new Map();
  for (const county of counties.slice(0, totalCounties)) {
    for (const city of county.cities) {
      const key = `${county.stateFIPS}-${county.countyFIPS}`;
      const eduData = aggregatedData.get(key);

      if (!stateGroups.has(city.stateCode)) {
        stateGroups.set(city.stateCode, []);
      }

      stateGroups.get(city.stateCode).push({
        city,
        eduData
      });
    }
  }

  // Update profiles state by state
  let updated = 0;
  let skipped = 0;

  for (const [stateCode, items] of stateGroups) {
    console.log(`Updating ${items.length.toLocaleString()} cities in ${stateCode}...`);

    for (const { city, eduData } of items) {
      const profilePath = path.join(PROFILES_DIR, stateCode, `${city.slug}.json`);

      if (!fs.existsSync(profilePath)) {
        skipped++;
        continue;
      }

      try {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

        if (eduData) {
          profile.education = eduData;
        } else {
          // Mark as no data available
          profile.education = {
            source: "NCES Common Core of Data",
            note: "No school data available for this county"
          };
        }

        fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n', 'utf8');
        updated++;

      } catch (err) {
        console.error(`  ❌ Error updating ${city.slug}: ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`\n✅ Updated ${updated.toLocaleString()} city profiles`);
  if (skipped > 0) {
    console.log(`⚠️  Skipped ${skipped.toLocaleString()} cities`);
  }

  console.log('\n🎉 Education data import complete!');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
