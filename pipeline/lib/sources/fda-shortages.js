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

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadApiKey() {
  try {
    // Try portal-level key first, then env var
    const keyPath = resolve(__dirname, '../../../keys/data-gov-api-key.txt');
    return readFileSync(keyPath, 'utf-8').trim();
  } catch {
    return process.env.DATA_GOV_API_KEY || '';
  }
}

function fmtDateFDA(d) {
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Fetch FDA drug shortages updated in the last N days.
 * @param {string|null} lastFetchDate - ISO date string of last fetch, or null
 * @returns {Promise<Array>} Array of normalized records (one per drug)
 */
export async function fetch(lastFetchDate) {
  try {
    const apiKey = loadApiKey();
    const startDate = lastFetchDate ? new Date(lastFetchDate) : daysAgo(14);
    const startStr = fmtDateFDA(startDate);
    const endStr = fmtDateFDA(new Date());

    console.log(`[fda-shortages] Fetching drug shortages updated since ${startDate.toISOString().split('T')[0]}...`);

    const keyParam = apiKey ? `&api_key=${apiKey}` : '';
    const url = `https://api.fda.gov/drug/shortages.json?search=update_date:[${startStr}+TO+${endStr}]+AND+status:"Current"&limit=100${keyParam}`;

    const response = await globalThis.fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
      },
    });

    if (!response.ok) {
      console.warn(`[fda-shortages] API returned status ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results = data.results || [];

    if (results.length === 0) {
      console.log(`[fda-shortages] No updated shortages found`);
      return [];
    }

    console.log(`[fda-shortages] Found ${results.length} shortage records`);

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
