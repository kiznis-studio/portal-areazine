#!/usr/bin/env node

/**
 * Fetch Census ACS 5-Year data for all US ZIP Code Tabulation Areas (ZCTAs)
 *
 * Data source: Census ACS 5-Year 2022
 * Output: src/data/zcta-data.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Census API endpoint
const API_URL = 'https://api.census.gov/data/2022/acs/acs5';

// Variables to fetch
const VARIABLES = [
  'B01003_001E', // Total population
  'B19013_001E', // Median household income
  'B25077_001E', // Median home value
  'B25064_001E', // Median gross rent
  'B01002_001E', // Median age
  'B17001_002E', // Poverty (below poverty level)
  'B17001_001E', // Poverty (total universe)
  'B23025_005E', // Unemployed
  'B23025_003E', // Labor force (civilian)
  'B15003_022E', // Bachelor's degree
  'B15003_023E', // Master's degree
  'B15003_024E', // Professional degree
  'B15003_025E', // Doctorate degree
  'B15003_001E', // Education total universe
  'NAME'         // ZCTA name
];

const QUERY_PARAMS = `get=${VARIABLES.join(',')}&for=zip%20code%20tabulation%20area:*`;

/**
 * Helper to make HTTPS GET request
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse value from Census API (handle null/-666666666)
 */
function parseValue(value) {
  if (value === null || value === '-666666666' || value === '-666666666.0') {
    return null;
  }
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Calculate percentage safely
 */
function percentage(numerator, denominator) {
  if (!numerator || !denominator || denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // Round to 1 decimal
}

/**
 * Main function
 */
async function fetchZCTAData() {
  console.log('Fetching Census ACS 5-Year data for all ZCTAs...');
  console.log(`API: ${API_URL}?${QUERY_PARAMS}\n`);

  try {
    // Fetch data
    const response = await httpsGet(`${API_URL}?${QUERY_PARAMS}`);
    const rawData = JSON.parse(response);

    // First row is headers
    const headers = rawData[0];
    const rows = rawData.slice(1);

    console.log(`Total ZCTAs returned: ${rows.length}`);

    // Parse into structured format
    const zctaData = {};
    let validCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      // Map to object using headers
      const data = {};
      headers.forEach((header, i) => {
        data[header] = row[i];
      });

      const zip = data['zip code tabulation area'];
      const population = parseValue(data['B01003_001E']);

      // Skip if no population data
      if (!population || population === 0) {
        skippedCount++;
        continue;
      }

      // Parse all fields
      const medianAge = parseValue(data['B01002_001E']);
      const medianIncome = parseValue(data['B19013_001E']);
      const medianHomeValue = parseValue(data['B25077_001E']);
      const medianRent = parseValue(data['B25064_001E']);

      const povertyBelow = parseValue(data['B17001_002E']);
      const povertyTotal = parseValue(data['B17001_001E']);
      const povertyRate = percentage(povertyBelow, povertyTotal);

      const unemployed = parseValue(data['B23025_005E']);
      const laborForce = parseValue(data['B23025_003E']);
      const unemploymentRate = percentage(unemployed, laborForce);

      const bachelor = parseValue(data['B15003_022E']);
      const master = parseValue(data['B15003_023E']);
      const professional = parseValue(data['B15003_024E']);
      const doctorate = parseValue(data['B15003_025E']);
      const educationTotal = parseValue(data['B15003_001E']);

      const bachelorOrHigherCount = [bachelor, master, professional, doctorate]
        .filter(v => v !== null)
        .reduce((sum, v) => sum + v, 0);
      const bachelorOrHigher = percentage(bachelorOrHigherCount, educationTotal);

      zctaData[zip] = {
        zip,
        name: data['NAME'],
        population,
        medianAge,
        medianIncome,
        medianHomeValue,
        medianRent,
        povertyRate,
        unemploymentRate,
        bachelorOrHigher
      };

      validCount++;
    }

    console.log(`Valid ZCTAs with data: ${validCount}`);
    console.log(`Skipped (no population): ${skippedCount}`);

    // Ensure data directory exists
    const dataDir = path.join(__dirname, '..', 'src', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Write to file
    const outputPath = path.join(dataDir, 'zcta-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(zctaData, null, 2));

    console.log(`\n✓ Data written to: ${outputPath}`);
    console.log(`  File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);

    // Show sample
    const sampleZip = Object.keys(zctaData)[0];
    console.log(`\nSample entry (${sampleZip}):`);
    console.log(JSON.stringify(zctaData[sampleZip], null, 2));

  } catch (error) {
    console.error('Error fetching ZCTA data:', error.message);
    process.exit(1);
  }
}

// Run
fetchZCTAData();
