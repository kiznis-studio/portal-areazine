/**
 * USGS Earthquake Hazards Program Data Source
 * API: https://earthquake.usgs.gov/fdsnws/event/1/
 * Fetches significant earthquakes (M3.0+ in US, M5.0+ globally)
 */

function hoursAgo(n) {
  const d = new Date();
  d.setTime(d.getTime() - n * 3600000);
  return d;
}

function fmtISO(d) {
  return d.toISOString();
}

/**
 * Fetch recent significant earthquakes from USGS.
 * @param {string|null} lastFetchDate - ISO date string of last fetch, or null
 * @returns {Promise<Array>} Array of normalized records
 */
export async function fetch(lastFetchDate) {
  try {
    const endTime = new Date();
    const startTime = lastFetchDate ? new Date(lastFetchDate) : hoursAgo(6);

    console.log(`[usgs] Fetching earthquakes from ${fmtISO(startTime)} to ${fmtISO(endTime)}...`);

    // M2.5+ for broader coverage; editorial filter in processor will narrow down
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${fmtISO(startTime)}&endtime=${fmtISO(endTime)}&minmagnitude=2.5&orderby=time`;

    const response = await globalThis.fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
      },
    });

    if (!response.ok) {
      console.warn(`[usgs] API returned status ${response.status}`);
      return [];
    }

    const data = await response.json();
    const features = data.features || [];

    if (features.length === 0) {
      console.log(`[usgs] No earthquakes found in time range`);
      return [];
    }

    console.log(`[usgs] Found ${features.length} earthquakes (M2.5+)`);

    // Store properties (flat) + add coordinates from geometry
    const normalized = features.map(feature => {
      const props = { ...feature.properties };
      if (feature.geometry?.coordinates) {
        props.longitude = feature.geometry.coordinates[0];
        props.latitude = feature.geometry.coordinates[1];
        props.depth = feature.geometry.coordinates[2];
      }
      return {
        id: `usgs:${feature.id}`,
        source: 'usgs',
        category: 'earthquakes',
        raw_json: JSON.stringify(props),
      };
    });

    return normalized;
  } catch (error) {
    console.warn(`[usgs] Error fetching earthquakes:`, error.message);
    return [];
  }
}
