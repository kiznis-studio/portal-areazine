/**
 * FDA (Food and Drug Administration) Recalls Data Source
 * API: https://open.fda.gov/apis/
 * Fetches drug, food, and device enforcement reports
 */

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

function fmtDateFDA(d) {
  // FDA API uses YYYYMMDD format (no dashes)
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * Fetch FDA enforcement reports (drugs and food) from the last 7 days
 * @param {string|null} lastFetchDate - ISO date string of last fetch, or null
 * @returns {Promise<Array>} Array of normalized records
 */
export async function fetch(lastFetchDate) {
  try {
    // Determine date range
    const endDate = new Date();
    const startDate = lastFetchDate ? new Date(lastFetchDate) : daysAgo(7);

    const startStr = fmtDateFDA(startDate);
    const endStr = fmtDateFDA(endDate);

    console.log(`[fda] Fetching recalls from ${fmtDate(startDate)} to ${fmtDate(endDate)}...`);

    const results = [];

    // Fetch drug enforcement reports
    try {
      const drugUrl = `https://api.fda.gov/drug/enforcement.json?search=report_date:[${startStr}+TO+${endStr}]&limit=100`;
      console.log(`[fda] Fetching drug enforcement reports...`);

      const drugResponse = await globalThis.fetch(drugUrl, {
        headers: {
          'Accept': 'application/json',
        'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
        },
      });

      if (drugResponse.ok) {
        const drugData = await drugResponse.json();
        const drugRecalls = drugData.results || [];
        console.log(`[fda] Found ${drugRecalls.length} drug enforcement reports`);
        results.push(...drugRecalls);
      } else {
        console.warn(`[fda] Drug API returned status ${drugResponse.status}`);
      }
    } catch (error) {
      console.warn(`[fda] Error fetching drug recalls:`, error.message);
    }

    // Fetch food enforcement reports
    try {
      const foodUrl = `https://api.fda.gov/food/enforcement.json?search=report_date:[${startStr}+TO+${endStr}]&limit=100`;
      console.log(`[fda] Fetching food enforcement reports...`);

      const foodResponse = await globalThis.fetch(foodUrl, {
        headers: {
          'Accept': 'application/json',
        'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
        },
      });

      if (foodResponse.ok) {
        const foodData = await foodResponse.json();
        const foodRecalls = foodData.results || [];
        console.log(`[fda] Found ${foodRecalls.length} food enforcement reports`);
        results.push(...foodRecalls);
      } else {
        console.warn(`[fda] Food API returned status ${foodResponse.status}`);
      }
    } catch (error) {
      console.warn(`[fda] Error fetching food recalls:`, error.message);
    }

    // Fetch device enforcement reports (medical devices)
    try {
      const deviceUrl = `https://api.fda.gov/device/enforcement.json?search=report_date:[${startStr}+TO+${endStr}]&limit=100`;
      console.log(`[fda] Fetching device enforcement reports...`);

      const deviceResponse = await globalThis.fetch(deviceUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
        },
      });

      if (deviceResponse.ok) {
        const deviceData = await deviceResponse.json();
        const deviceRecalls = deviceData.results || [];
        console.log(`[fda] Found ${deviceRecalls.length} device enforcement reports`);
        results.push(...deviceRecalls);
      } else {
        console.warn(`[fda] Device API returned status ${deviceResponse.status}`);
      }
    } catch (error) {
      console.warn(`[fda] Error fetching device recalls:`, error.message);
    }

    if (results.length === 0) {
      console.log(`[fda] No recalls found in date range`);
      return [];
    }

    console.log(`[fda] Total recalls found: ${results.length}`);

    // Normalize records
    const normalized = results.map(recall => ({
      id: `fda:${recall.recall_number}`,
      source: 'fda',
      category: 'recalls-fda',
      raw_json: JSON.stringify(recall),
    }));

    return normalized;

  } catch (error) {
    console.warn(`[fda] Error fetching recalls:`, error.message);
    return [];
  }
}
