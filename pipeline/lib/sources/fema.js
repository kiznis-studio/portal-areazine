/**
 * FEMA OpenFEMA Disaster Declarations Data Source
 * API: https://www.fema.gov/about/openfema/api
 * No auth required. Fetches recent disaster declarations.
 * Note: FEMA API may block non-US IPs (works from Aurora/US server).
 */

/**
 * Fetch recent disaster declarations from FEMA.
 * @param {string|null} lastFetchDate - ISO date string of last fetch, or null
 * @returns {Promise<Array>} Array of normalized records
 */
export async function fetch(lastFetchDate) {
  try {
    // Look back 30 days for new declarations (they're infrequent)
    const lookback = lastFetchDate || new Date(Date.now() - 30 * 86400000).toISOString();
    const filterDate = lookback.split('T')[0];

    console.log(`[fema] Fetching disaster declarations since ${filterDate}...`);

    const url = `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationDate gt '${filterDate}'&$orderby=declarationDate desc&$top=100`;

    const response = await globalThis.fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Areazine/1.0 (areazine.com; hello@areazine.com)',
      },
    });

    if (!response.ok) {
      console.warn(`[fema] API returned status ${response.status}`);
      return [];
    }

    const data = await response.json();
    const declarations = data.DisasterDeclarationsSummaries || [];

    if (declarations.length === 0) {
      console.log(`[fema] No new disaster declarations found`);
      return [];
    }

    // Group by disaster number to avoid duplicate articles per county
    // FEMA creates one record per county per disaster — we want one article per disaster
    const disasterMap = new Map();
    for (const decl of declarations) {
      const key = `${decl.disasterNumber}-${decl.declarationType}`;
      if (!disasterMap.has(key)) {
        disasterMap.set(key, {
          ...decl,
          designatedAreas: [decl.designatedArea],
        });
      } else {
        disasterMap.get(key).designatedAreas.push(decl.designatedArea);
      }
    }

    const unique = Array.from(disasterMap.values());
    console.log(`[fema] Found ${unique.length} unique disasters from ${declarations.length} records`);

    const normalized = unique.map(decl => ({
      id: `fema:${decl.femaDeclarationString}`,
      source: 'fema',
      category: 'disasters',
      raw_json: JSON.stringify({
        femaDeclarationString: decl.femaDeclarationString,
        disasterNumber: decl.disasterNumber,
        state: decl.state,
        declarationType: decl.declarationType,
        declarationDate: decl.declarationDate,
        incidentType: decl.incidentType,
        declarationTitle: decl.declarationTitle,
        incidentBeginDate: decl.incidentBeginDate,
        incidentEndDate: decl.incidentEndDate,
        designatedAreas: decl.designatedAreas,
        ihProgramDeclared: decl.ihProgramDeclared,
        iaProgramDeclared: decl.iaProgramDeclared,
        paProgramDeclared: decl.paProgramDeclared,
        hmProgramDeclared: decl.hmProgramDeclared,
        region: decl.region,
      }),
    }));

    return normalized;
  } catch (error) {
    console.warn(`[fema] Error fetching disaster declarations:`, error.message);
    return [];
  }
}
