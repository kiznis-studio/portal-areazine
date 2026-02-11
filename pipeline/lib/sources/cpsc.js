/**
 * CPSC (Consumer Product Safety Commission) Recalls Data Source
 * API: https://www.saferproducts.gov/RestWebServices/
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
 * Fetch CPSC recalls from the last 7 days (or since lastFetchDate)
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

    console.log(`[cpsc] Fetching recalls from ${startStr} to ${endStr}...`);

    const url = `https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=${startStr}&RecallDateEnd=${endStr}`;

    const response = await globalThis.fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[cpsc] API returned status ${response.status}`);
      return [];
    }

    const data = await response.json();

    // The API returns an array directly or wrapped in a property
    const recalls = Array.isArray(data) ? data : (data.recalls || data.Recalls || []);

    if (!recalls || recalls.length === 0) {
      console.log(`[cpsc] No recalls found in date range`);
      return [];
    }

    console.log(`[cpsc] Found ${recalls.length} recalls`);

    // Normalize records
    const normalized = recalls.map(recall => ({
      id: `cpsc:${recall.RecallID || recall.recallID || recall.id}`,
      source: 'cpsc',
      category: 'recalls-cpsc',
      raw_json: JSON.stringify(recall),
    }));

    return normalized;

  } catch (error) {
    console.warn(`[cpsc] Error fetching recalls:`, error.message);
    return [];
  }
}
