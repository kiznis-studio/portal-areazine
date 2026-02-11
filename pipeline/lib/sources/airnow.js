/**
 * EPA AirNow Air Quality Data Source
 * API: https://www.airnowapi.org/
 *
 * Monitors air quality across major US metro areas. Generates articles
 * only when AQI exceeds "Unhealthy for Sensitive Groups" (>100).
 *
 * Rate limit: 500 requests/hour. We query ~50 metros = 50 calls/cycle.
 * Key is separate from api.data.gov — stored in keys/airnow-api-key.txt.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadApiKey() {
  try {
    const keyPath = resolve(__dirname, '../../../keys/airnow-api-key.txt');
    return readFileSync(keyPath, 'utf-8').trim();
  } catch {
    return process.env.AIRNOW_API_KEY || '';
  }
}

const DELAY_MS = 300; // Polite delay between API calls

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Top 50 US metro areas by population (zip codes for city centers)
const METRO_ZIPS = [
  { zip: '10001', name: 'New York City', state: 'NY' },
  { zip: '90001', name: 'Los Angeles', state: 'CA' },
  { zip: '60601', name: 'Chicago', state: 'IL' },
  { zip: '77001', name: 'Houston', state: 'TX' },
  { zip: '85001', name: 'Phoenix', state: 'AZ' },
  { zip: '19101', name: 'Philadelphia', state: 'PA' },
  { zip: '78201', name: 'San Antonio', state: 'TX' },
  { zip: '92101', name: 'San Diego', state: 'CA' },
  { zip: '75201', name: 'Dallas', state: 'TX' },
  { zip: '95101', name: 'San Jose', state: 'CA' },
  { zip: '78701', name: 'Austin', state: 'TX' },
  { zip: '32099', name: 'Jacksonville', state: 'FL' },
  { zip: '76101', name: 'Fort Worth', state: 'TX' },
  { zip: '43085', name: 'Columbus', state: 'OH' },
  { zip: '46201', name: 'Indianapolis', state: 'IN' },
  { zip: '28201', name: 'Charlotte', state: 'NC' },
  { zip: '94102', name: 'San Francisco', state: 'CA' },
  { zip: '98101', name: 'Seattle', state: 'WA' },
  { zip: '80201', name: 'Denver', state: 'CO' },
  { zip: '20001', name: 'Washington DC', state: 'DC' },
  { zip: '37201', name: 'Nashville', state: 'TN' },
  { zip: '73101', name: 'Oklahoma City', state: 'OK' },
  { zip: '79901', name: 'El Paso', state: 'TX' },
  { zip: '02101', name: 'Boston', state: 'MA' },
  { zip: '97201', name: 'Portland', state: 'OR' },
  { zip: '89101', name: 'Las Vegas', state: 'NV' },
  { zip: '38101', name: 'Memphis', state: 'TN' },
  { zip: '40201', name: 'Louisville', state: 'KY' },
  { zip: '21201', name: 'Baltimore', state: 'MD' },
  { zip: '53201', name: 'Milwaukee', state: 'WI' },
  { zip: '87101', name: 'Albuquerque', state: 'NM' },
  { zip: '85701', name: 'Tucson', state: 'AZ' },
  { zip: '93701', name: 'Fresno', state: 'CA' },
  { zip: '95811', name: 'Sacramento', state: 'CA' },
  { zip: '64101', name: 'Kansas City', state: 'MO' },
  { zip: '33101', name: 'Miami', state: 'FL' },
  { zip: '68101', name: 'Omaha', state: 'NE' },
  { zip: '27601', name: 'Raleigh', state: 'NC' },
  { zip: '55401', name: 'Minneapolis', state: 'MN' },
  { zip: '30301', name: 'Atlanta', state: 'GA' },
  { zip: '48201', name: 'Detroit', state: 'MI' },
  { zip: '84101', name: 'Salt Lake City', state: 'UT' },
  { zip: '63101', name: 'St. Louis', state: 'MO' },
  { zip: '15201', name: 'Pittsburgh', state: 'PA' },
  { zip: '96801', name: 'Honolulu', state: 'HI' },
  { zip: '99501', name: 'Anchorage', state: 'AK' },
  { zip: '33601', name: 'Tampa', state: 'FL' },
  { zip: '45201', name: 'Cincinnati', state: 'OH' },
  { zip: '70112', name: 'New Orleans', state: 'LA' },
  { zip: '23219', name: 'Richmond', state: 'VA' },
];

// AQI threshold: only generate articles above this level
const AQI_THRESHOLD = 100; // "Unhealthy for Sensitive Groups"

/**
 * Fetch current air quality for a single zip code.
 * @param {string} zip - US zip code
 * @param {string} apiKey - AirNow API key
 * @returns {Promise<object[]>} Array of observation objects
 */
async function fetchZip(zip, apiKey) {
  const url = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${zip}&distance=25&API_KEY=${apiKey}`;

  const response = await globalThis.fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
    },
  });

  if (!response.ok) return [];
  return response.json();
}

/**
 * Fetch air quality data for major US metros.
 * Only returns records where AQI exceeds the unhealthy threshold.
 * @param {string|null} lastFetchDate - ISO date string of last fetch, or null
 * @returns {Promise<Array>} Array of normalized records
 */
export async function fetch(lastFetchDate) {
  try {
    const apiKey = loadApiKey();
    if (!apiKey) {
      console.warn('[airnow] No API key found. Register at docs.airnowapi.org');
      return [];
    }

    console.log(`[airnow] Scanning ${METRO_ZIPS.length} metro areas for air quality alerts...`);

    const alerts = [];
    let queriedCount = 0;

    for (const metro of METRO_ZIPS) {
      const observations = await fetchZip(metro.zip, apiKey);
      queriedCount++;

      // Find the worst reading for this location
      const worst = observations.reduce((max, obs) => {
        return (obs.AQI || 0) > (max?.AQI || 0) ? obs : max;
      }, null);

      if (worst && worst.AQI > AQI_THRESHOLD) {
        const reportingArea = worst.ReportingArea || metro.name;
        const stateCode = worst.StateCode || metro.state;
        const dateStr = worst.DateObserved?.trim() || new Date().toISOString().split('T')[0];
        const slug = `${reportingArea}-${stateCode}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        alerts.push({
          id: `airnow:${slug}-${dateStr}`,
          source: 'airnow',
          category: 'air-quality',
          raw_json: JSON.stringify({
            reportingArea,
            stateCode,
            observations: observations.map(o => ({
              parameter: o.ParameterName,
              aqi: o.AQI,
              category: o.Category?.Name,
              categoryNumber: o.Category?.Number,
            })),
            worstAQI: worst.AQI,
            worstParameter: worst.ParameterName,
            worstCategory: worst.Category?.Name,
            dateObserved: dateStr,
            metroName: metro.name,
            metroState: metro.state,
          }),
        });
      }

      await sleep(DELAY_MS);
    }

    console.log(`[airnow] Queried ${queriedCount} areas, found ${alerts.length} unhealthy readings (AQI>${AQI_THRESHOLD})`);
    return alerts;

  } catch (error) {
    console.warn(`[airnow] Error fetching air quality:`, error.message);
    return [];
  }
}
