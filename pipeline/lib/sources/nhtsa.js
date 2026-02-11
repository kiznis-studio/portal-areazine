/**
 * NHTSA (National Highway Traffic Safety Administration) Vehicle Recalls Data Source
 * API: https://api.nhtsa.gov/
 */

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Fetch NHTSA vehicle recalls from the last 7 days
 * @param {string|null} lastFetchDate - ISO date string of last fetch, or null
 * @returns {Promise<Array>} Array of normalized records
 */
export async function fetch(lastFetchDate) {
  try {
    // Determine date range
    const endDate = new Date();
    const startDate = lastFetchDate ? new Date(lastFetchDate) : daysAgo(7);

    const startStr = fmtDate(startDate);
    const endStr = fmtDate(endDate);

    console.log(`[nhtsa] Fetching vehicle recalls from ${startStr} to ${endStr}...`);

    const url = `https://api.nhtsa.gov/recalls/recallsByDate?startDate=${startStr}&endDate=${endStr}&type=vehicle`;

    const response = await globalThis.fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
      },
    });

    if (!response.ok) {
      console.warn(`[nhtsa] API returned status ${response.status}`);
      return [];
    }

    const data = await response.json();

    // The API returns results in a 'results' property
    const recalls = data.results || [];

    if (recalls.length === 0) {
      console.log(`[nhtsa] No recalls found in date range`);
      return [];
    }

    console.log(`[nhtsa] Found ${recalls.length} vehicle recalls`);

    // Normalize records
    const normalized = recalls.map(recall => ({
      id: `nhtsa:${recall.NHTSACampaignNumber}`,
      source: 'nhtsa',
      category: 'recalls-vehicles',
      raw_json: JSON.stringify(recall),
    }));

    return normalized;

  } catch (error) {
    console.warn(`[nhtsa] Error fetching recalls:`, error.message);
    return [];
  }
}
