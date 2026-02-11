/**
 * FDA Drug Shortages Data Source
 * API: https://api.fda.gov/drug/shortages.json
 *
 * Tracks drug availability issues across the US. Updated daily.
 * Uses api.data.gov key for higher rate limits (1000/hr vs 40/min).
 *
 * Groups shortage records by generic drug name to produce one article
 * per drug (multiple manufacturers/presentations may be in shortage).
 */

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Parse FDA's MM/DD/YYYY date format to a Date object.
 */
function parseFDADate(str) {
  if (!str) return null;
  const [m, d, y] = str.split('/');
  return new Date(`${y}-${m}-${d}`);
}

/**
 * Fetch FDA drug shortages updated in the last N days.
 * @param {string|null} lastFetchDate - ISO date string of last fetch, or null
 * @returns {Promise<Array>} Array of normalized records (one per drug)
 */
export async function fetch(lastFetchDate) {
  try {
    const cutoffDate = lastFetchDate ? new Date(lastFetchDate) : daysAgo(14);

    console.log(`[fda-shortages] Fetching current drug shortages updated since ${cutoffDate.toISOString().split('T')[0]}...`);

    // Fetch current shortages (no API key needed for public openFDA).
    // The update_date field is MM/DD/YYYY text — not searchable as a date range.
    // So we fetch all current shortages (paginated) and filter client-side.
    const allResults = [];
    let skip = 0;
    const limit = 100;

    while (true) {
      const url = `https://api.fda.gov/drug/shortages.json?search=status:"Current"&limit=${limit}&skip=${skip}`;
      const response = await globalThis.fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
        },
      });

      if (!response.ok) {
        console.warn(`[fda-shortages] API returned status ${response.status} at skip=${skip}`);
        break;
      }

      const data = await response.json();
      const results = data.results || [];
      if (results.length === 0) break;

      allResults.push(...results);
      skip += limit;

      // Stop after 2000 records or when we've fetched them all
      if (results.length < limit || skip >= 2000) break;

      // Polite delay
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[fda-shortages] Fetched ${allResults.length} total current shortage records`);

    // Filter to recently updated
    const results = allResults.filter(item => {
      const updateDate = parseFDADate(item.update_date);
      return updateDate && updateDate >= cutoffDate;
    });

    if (results.length === 0) {
      console.log(`[fda-shortages] No shortages updated since cutoff`);
      return [];
    }

    console.log(`[fda-shortages] ${results.length} shortages updated since cutoff`);

    // Group by generic drug name to produce one record per drug
    const grouped = new Map();
    for (const item of results) {
      const key = (item.generic_name || 'Unknown').toLowerCase().trim();
      if (!grouped.has(key)) {
        grouped.set(key, {
          generic_name: item.generic_name,
          status: item.status,
          shortage_reason: item.shortage_reason,
          dosage_form: item.dosage_form,
          therapeutic_category: item.therapeutic_category,
          initial_posting_date: item.initial_posting_date,
          update_date: item.update_date,
          manufacturers: [],
          brand_names: new Set(),
        });
      }

      const group = grouped.get(key);

      // Collect manufacturer info
      group.manufacturers.push({
        company_name: item.company_name,
        availability: item.availability,
        related_info: item.related_info,
        presentation: item.presentation,
        contact_info: item.contact_info,
      });

      // Collect brand names from openfda
      if (item.openfda?.brand_name) {
        for (const bn of item.openfda.brand_name) {
          group.brand_names.add(bn);
        }
      }
    }

    console.log(`[fda-shortages] Grouped into ${grouped.size} unique drugs`);

    // Normalize to records
    const normalized = [];
    for (const [key, group] of grouped) {
      const slug = key.replace(/[^a-z0-9]+/g, '-').slice(0, 60);

      normalized.push({
        id: `fda-shortage:${slug}`,
        source: 'fda-shortages',
        category: 'drug-shortages',
        raw_json: JSON.stringify({
          ...group,
          brand_names: [...group.brand_names],
        }),
      });
    }

    return normalized;

  } catch (error) {
    console.warn(`[fda-shortages] Error fetching shortages:`, error.message);
    return [];
  }
}
