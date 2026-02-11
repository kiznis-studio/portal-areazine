/**
 * NHTSA (National Highway Traffic Safety Administration) Vehicle Recalls Data Source
 * API: https://api.nhtsa.gov/
 *
 * The recallsByDate endpoint requires auth (403). Workaround: iterate through
 * sequential campaign numbers which work without auth.
 *
 * Campaign number format: {YY}{type}{seq}000
 *   V = vehicle, E = equipment, T = tire, C = child restraint
 */

const RECALL_TYPES = ['V', 'E', 'T', 'C'];
const MAX_CONSECUTIVE_MISSES = 10; // Stop after this many empty results
const DELAY_MS = 200; // Delay between API calls to be polite

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a single campaign number from NHTSA.
 * @param {string} campaignNumber - e.g. "26V068000"
 * @returns {Promise<object[]>} Array of recall records (one per make/model)
 */
async function fetchCampaign(campaignNumber) {
  const url = `https://api.nhtsa.gov/recalls/campaignNumber?campaignNumber=${campaignNumber}`;

  const response = await globalThis.fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
    },
  });

  if (!response.ok) return [];

  const data = await response.json();
  return data.results || [];
}

/**
 * Build a campaign number string from components.
 * @param {string} yearPrefix - "26" for 2026
 * @param {string} type - "V", "E", "T", or "C"
 * @param {number} seq - Sequence number (1-999)
 * @returns {string} Campaign number like "26V068000"
 */
function buildCampaignNumber(yearPrefix, type, seq) {
  return `${yearPrefix}${type}${String(seq).padStart(3, '0')}000`;
}

/**
 * Fetch NHTSA vehicle recalls by iterating sequential campaign numbers.
 * @param {string|null} lastFetchDate - Not used directly; we iterate from seq 1
 * @returns {Promise<Array>} Array of normalized records
 */
export async function fetch(lastFetchDate) {
  try {
    const year = new Date().getFullYear();
    const yearPrefix = String(year).slice(-2);

    console.log(`[nhtsa] Scanning ${year} recall campaigns (prefix: ${yearPrefix})...`);

    const allRecords = [];

    for (const type of RECALL_TYPES) {
      let consecutiveMisses = 0;
      let seq = 1;
      let found = 0;

      while (consecutiveMisses < MAX_CONSECUTIVE_MISSES) {
        const campaignNumber = buildCampaignNumber(yearPrefix, type, seq);

        const results = await fetchCampaign(campaignNumber);

        if (results.length > 0) {
          consecutiveMisses = 0;
          found++;

          // Group all make/model variants into a single record per campaign
          // (a campaign like 26V068 may affect multiple models)
          const combined = {
            ...results[0],
            allModels: results.map(r => ({
              Make: r.Make,
              Model: r.Model,
              ModelYear: r.ModelYear,
            })),
            totalAffected: results.reduce(
              (sum, r) => sum + (parseInt(r.PotentialNumberofUnitsAffected) || 0), 0
            ),
          };

          allRecords.push({
            id: `nhtsa:${campaignNumber}`,
            source: 'nhtsa',
            category: 'recalls-vehicles',
            raw_json: JSON.stringify(combined),
          });
        } else {
          consecutiveMisses++;
        }

        seq++;
        await sleep(DELAY_MS);
      }

      if (found > 0) {
        console.log(`[nhtsa] Type ${yearPrefix}${type}: found ${found} campaigns (checked ${seq - 1})`);
      }
    }

    console.log(`[nhtsa] Total: ${allRecords.length} recall campaigns found`);
    return allRecords;

  } catch (error) {
    console.warn(`[nhtsa] Error fetching recalls:`, error.message);
    return [];
  }
}
