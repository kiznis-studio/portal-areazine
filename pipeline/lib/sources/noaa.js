/**
 * NOAA (National Oceanic and Atmospheric Administration) Weather Alerts Data Source
 * API: https://www.weather.gov/documentation/services-web-api
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
 * Fetch active NOAA weather alerts (Extreme and Severe only)
 * @param {string|null} lastFetchDate - ISO date string of last fetch, or null (unused for active alerts)
 * @returns {Promise<Array>} Array of normalized records
 */
export async function fetch(lastFetchDate) {
  try {
    console.log(`[noaa] Fetching active weather alerts (Extreme/Severe)...`);

    const url = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert&urgency=Immediate,Expected';

    const response = await globalThis.fetch(url, {
      headers: {
        'Accept': 'application/geo+json',
        'User-Agent': '(areazine.com, hello@areazine.com)',
      },
    });

    if (!response.ok) {
      console.warn(`[noaa] API returned status ${response.status}`);
      return [];
    }

    const data = await response.json();

    // The API returns GeoJSON with features array
    const alerts = data.features || [];

    if (alerts.length === 0) {
      console.log(`[noaa] No active alerts found`);
      return [];
    }

    console.log(`[noaa] Found ${alerts.length} active alerts, filtering by severity...`);

    // Filter for Extreme and Severe severity only
    const severityFilter = ['Extreme', 'Severe'];
    const filtered = alerts.filter(alert => {
      const severity = alert.properties?.severity;
      return severityFilter.includes(severity);
    });

    console.log(`[noaa] ${filtered.length} alerts match Extreme/Severe severity criteria`);

    if (filtered.length === 0) {
      return [];
    }

    // Normalize records
    const normalized = filtered.map(alert => ({
      id: `noaa:${alert.properties.id}`,
      source: 'noaa',
      category: 'weather',
      raw_json: JSON.stringify(alert),
    }));

    return normalized;

  } catch (error) {
    console.warn(`[noaa] Error fetching weather alerts:`, error.message);
    return [];
  }
}
