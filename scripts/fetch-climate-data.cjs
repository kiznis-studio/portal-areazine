#!/usr/bin/env node
/**
 * Fetch NOAA Climate Normals and integrate into city profiles
 *
 * Uses NOAA Climate Normals 1991-2020 Monthly data
 *
 * Strategy:
 * 1. Download station inventory from NOAA
 * 2. Find nearest station for each city using haversine distance
 * 3. Fetch monthly climate normals via NOAA Data Service API
 * 4. Cache station data to avoid duplicate API calls
 * 5. Save to each city's profile JSON
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;

// Constants
const STATION_INVENTORY_URL = 'https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/doc/inventory_30yr.txt';
const NOAA_API_BASE = 'https://www.ncei.noaa.gov/access/services/data/v1';
const API_DELAY_MS = 200; // Be respectful - 5 requests per second max
const BATCH_SIZE = 50; // Save progress every N cities

const CITIES_FILE = path.join(__dirname, '../src/data/us-cities.json');
const PROFILES_DIR = path.join(__dirname, '../src/data/city-profiles');
const STATIONS_CACHE_FILE = path.join(__dirname, '../src/data/noaa-stations-cache.json');

// Month name mapping
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Haversine distance calculation (miles)
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959; // miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * HTTP GET helper with promise
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Download and parse NOAA station inventory
 * Returns array of { id, name, lat, lng }
 */
async function fetchStationInventory() {
  console.log('Downloading NOAA station inventory...');
  const data = await httpGet(STATION_INVENTORY_URL);

  const lines = data.split('\n');
  const stations = [];

  // Skip header lines (first 3 lines are header)
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Format: STATION_ID  LAT    LON    ELEVATION  STATE  NAME
    // Example: USC00010008  30.6  -87.9    50.0     AL     ATMORE
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;

    const id = parts[0];
    const lat = parseFloat(parts[1]);
    const lng = parseFloat(parts[2]);
    const stateName = parts[4];
    const name = parts.slice(5).join(' ');

    if (!isNaN(lat) && !isNaN(lng)) {
      stations.push({ id, name, lat, lng, state: stateName });
    }
  }

  console.log(`Loaded ${stations.length} weather stations`);
  return stations;
}

/**
 * Find nearest station to a city
 */
function findNearestStation(cityLat, cityLng, stations) {
  let nearest = null;
  let minDistance = Infinity;

  for (const station of stations) {
    const distance = haversine(cityLat, cityLng, station.lat, station.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = station;
    }
  }

  return { station: nearest, distance: minDistance };
}

/**
 * Fetch climate normals for a station from NOAA API
 */
async function fetchStationClimateData(stationId) {
  const dataTypes = [
    'MLY-TAVG-NORMAL',  // Average temperature
    'MLY-TMAX-NORMAL',  // Max temperature
    'MLY-TMIN-NORMAL',  // Min temperature
    'MLY-PRCP-NORMAL'   // Precipitation
  ].join(',');

  const url = `${NOAA_API_BASE}?dataset=normals-monthly-1991-2020&stations=${stationId}&dataTypes=${dataTypes}&format=json&units=standard`;

  console.log(`  Fetching climate data for ${stationId}...`);

  try {
    const data = await httpGet(url);
    const records = JSON.parse(data);

    if (!records || records.length === 0) {
      console.log(`  ⚠ No climate data available for ${stationId}`);
      return null;
    }

    // Parse monthly data - each record is a month with all datatypes
    const monthlyData = {};

    for (const record of records) {
      // DATE field is just the month number: "01", "02", etc.
      const monthNum = parseInt(record.DATE);
      if (monthNum < 1 || monthNum > 12) continue;

      const monthKey = MONTH_NAMES[monthNum - 1];

      monthlyData[monthKey] = {
        avgTemp: parseFloat(record['MLY-TAVG-NORMAL']) || null,
        highTemp: parseFloat(record['MLY-TMAX-NORMAL']) || null,
        lowTemp: parseFloat(record['MLY-TMIN-NORMAL']) || null,
        precip: parseFloat(record['MLY-PRCP-NORMAL']) || null
      };

      // Filter out null values
      Object.keys(monthlyData[monthKey]).forEach(key => {
        if (monthlyData[monthKey][key] === null) {
          delete monthlyData[monthKey][key];
        } else {
          // Round to 1 decimal place
          monthlyData[monthKey][key] = Math.round(monthlyData[monthKey][key] * 10) / 10;
        }
      });
    }

    // Calculate annual averages
    const months = Object.keys(monthlyData);
    if (months.length === 0) {
      return null;
    }

    let totalAvgTemp = 0;
    let totalHighTemp = 0;
    let totalLowTemp = 0;
    let totalPrecip = 0;
    let hotMonths = 0;  // Months with avg temp > 70°F
    let coldMonths = 0; // Months with avg temp < 40°F
    let avgTempCount = 0;
    let highTempCount = 0;
    let lowTempCount = 0;
    let precipCount = 0;

    for (const month of months) {
      const data = monthlyData[month];
      if (data.avgTemp !== undefined) {
        totalAvgTemp += data.avgTemp;
        avgTempCount++;
        if (data.avgTemp > 70) hotMonths++;
        if (data.avgTemp < 40) coldMonths++;
      }
      if (data.highTemp !== undefined) {
        totalHighTemp += data.highTemp;
        highTempCount++;
      }
      if (data.lowTemp !== undefined) {
        totalLowTemp += data.lowTemp;
        lowTempCount++;
      }
      if (data.precip !== undefined) {
        totalPrecip += data.precip;
        precipCount++;
      }
    }

    const annual = {
      avgTemp: avgTempCount > 0 ? Math.round(totalAvgTemp / avgTempCount * 10) / 10 : null,
      highTemp: highTempCount > 0 ? Math.round(totalHighTemp / highTempCount * 10) / 10 : null,
      lowTemp: lowTempCount > 0 ? Math.round(totalLowTemp / lowTempCount * 10) / 10 : null,
      totalPrecip: precipCount > 0 ? Math.round(totalPrecip * 100) / 100 : null,
      hotMonths,
      coldMonths
    };

    // Remove null values from annual
    Object.keys(annual).forEach(key => {
      if (annual[key] === null) {
        delete annual[key];
      }
    });

    return { monthly: monthlyData, annual };

  } catch (err) {
    console.log(`  ⚠ Error fetching data for ${stationId}: ${err.message}`);
    return null;
  }
}

/**
 * Load or initialize station data cache
 */
function loadStationCache() {
  if (fs.existsSync(STATIONS_CACHE_FILE)) {
    return JSON.parse(fs.readFileSync(STATIONS_CACHE_FILE, 'utf8'));
  }
  return {};
}

/**
 * Save station data cache
 */
function saveStationCache(cache) {
  fs.writeFileSync(STATIONS_CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Load city profile JSON
 */
function loadCityProfile(stateCode, slug) {
  const profilePath = path.join(PROFILES_DIR, stateCode, `${slug}.json`);
  if (!fs.existsSync(profilePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
}

/**
 * Save city profile JSON
 */
function saveCityProfile(stateCode, slug, profile) {
  const profilePath = path.join(PROFILES_DIR, stateCode, `${slug}.json`);
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n');
}

/**
 * Sleep helper for API rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main execution
 */
async function main() {
  console.log('🌡️  NOAA Climate Data Fetcher\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (limit) console.log(`Limit: ${limit} cities`);
  console.log('');

  // Load cities
  console.log('Loading cities...');
  const cities = JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
  console.log(`Loaded ${cities.length} cities\n`);

  // Load station inventory
  const stations = await fetchStationInventory();
  console.log('');

  // Load station data cache
  let stationCache = loadStationCache();
  console.log(`Station cache: ${Object.keys(stationCache).length} stations cached\n`);

  // Process cities
  const citiesToProcess = limit ? cities.slice(0, limit) : cities;
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let cached = 0;

  for (let i = 0; i < citiesToProcess.length; i++) {
    const city = citiesToProcess[i];

    // Skip cities that already have climate data (resume support)
    const profilePath = path.join(PROFILES_DIR, city.stateCode, `${city.slug}.json`);
    if (fs.existsSync(profilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        if (existing.climate && existing.climate.annual) {
          skipped++;
          continue;
        }
      } catch (e) { /* re-process if JSON is corrupt */ }
    }

    // Find nearest station
    const { station, distance } = findNearestStation(city.lat, city.lng, stations);

    if (!station) {
      console.log(`⚠ No station found for ${city.name}, ${city.stateCode}`);
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${citiesToProcess.length}] ${city.name}, ${city.stateCode}`);
    console.log(`  Nearest station: ${station.name} (${station.id}) - ${distance.toFixed(1)} mi`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would fetch climate data and update profile\n`);
      processed++;
      continue;
    }

    // Check cache first
    let climateData = stationCache[station.id];

    if (!climateData) {
      // Fetch from API
      climateData = await fetchStationClimateData(station.id);
      await sleep(API_DELAY_MS);

      if (!climateData) {
        console.log(`  ⚠ Skipping - no data available\n`);
        errors++;
        continue;
      }

      // Cache it
      stationCache[station.id] = climateData;
      saveStationCache(stationCache);
      console.log(`  ✓ Fetched and cached climate data`);
    } else {
      console.log(`  ✓ Using cached climate data`);
      cached++;
    }

    // Load city profile
    const profile = loadCityProfile(city.stateCode, city.slug);
    if (!profile) {
      console.log(`  ⚠ Profile not found: ${city.stateCode}/${city.slug}.json\n`);
      errors++;
      continue;
    }

    // Add climate data to profile
    profile.climate = {
      station: station.id,
      stationName: station.name,
      distanceMi: Math.round(distance * 10) / 10,
      source: 'NOAA Climate Normals 1991-2020',
      ...climateData
    };

    // Save updated profile
    saveCityProfile(city.stateCode, city.slug, profile);
    console.log(`  ✓ Updated profile with climate data\n`);

    processed++;

    // Save progress every BATCH_SIZE cities
    if (processed % BATCH_SIZE === 0) {
      console.log(`📊 Progress: ${processed} cities processed, ${cached} from cache, ${errors} errors\n`);
    }
  }

  // Final summary
  console.log('');
  console.log('═'.repeat(60));
  console.log('Summary:');
  console.log(`  Total cities: ${citiesToProcess.length}`);
  console.log(`  Processed: ${processed}`);
  console.log(`  From cache: ${cached}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Unique stations cached: ${Object.keys(stationCache).length}`);
  console.log('═'.repeat(60));
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
