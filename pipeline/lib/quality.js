/**
 * Article quality validation module for areazine pipeline.
 *
 * Validates generated articles for structural completeness, anti-hallucination,
 * and factual grounding in source data before storage.
 */

const VALID_CATEGORIES = [
  'recalls-cpsc',
  'recalls-fda',
  'recalls-vehicles',
  'weather',
  'earthquakes',
  'disasters',
  'drug-shortages',
  'air-quality',
  'economy',
  'finance',
  'technology',
];

const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low'];

const PLACEHOLDER_PATTERNS = [
  /\{\{.*?\}\}/g,           // Template variables still present
  /\[INSERT[\s\S]*?\]/gi,   // [INSERT ...] markers
  /\[TODO[\s\S]*?\]/gi,     // [TODO ...] markers
  /\[EXAMPLE[\s\S]*?\]/gi,  // [EXAMPLE ...] markers
  /\bEXAMPLE\b/gi,          // EXAMPLE as standalone word
  /(TBD|TK|N\/A)/g,         // Placeholder abbreviations
];

/**
 * Extract key identifiers from raw data that should appear in the article.
 * These are anti-hallucination anchors.
 *
 * @param {object} rawData - Parsed source data
 * @param {string} sourceType - Source type (cpsc, fda, nhtsa, noaa, etc.)
 * @returns {string[]} Array of expected identifiers
 */
function extractKeyIdentifiers(rawData, sourceType) {
  const identifiers = [];
  const dataStr = JSON.stringify(rawData);

  // CPSC Recalls — actual API fields: Title, Products[], Manufacturers[], Hazards[]
  if (sourceType === 'cpsc' || sourceType === 'recalls-cpsc') {
    // Extract brand name from title (text before "Recalls" or "Recall")
    if (rawData.Title) {
      const brandMatch = rawData.Title.match(/^(.+?)\s+Recalls?\b/i);
      if (brandMatch) identifiers.push(brandMatch[1].trim());
    }
    if (Array.isArray(rawData.Manufacturers)) {
      for (const m of rawData.Manufacturers) {
        if (m.Name) identifiers.push(m.Name);
      }
    }
    if (Array.isArray(rawData.Products)) {
      for (const p of rawData.Products) {
        if (p.Name) identifiers.push(p.Name);
      }
    }
    // Product type from title (text between "Recalls" and "Due to")
    if (rawData.Title) {
      const productMatch = rawData.Title.match(/Recalls?\s+(.+?)\s+Due\s+to/i);
      if (productMatch) identifiers.push(productMatch[1].trim());
    }
  }

  // FDA Recalls
  if (sourceType === 'fda' || sourceType === 'recalls-fda') {
    // Manufacturer/recalling firm name — most likely to appear in article
    if (rawData.recalling_firm) {
      identifiers.push(rawData.recalling_firm);
    } else if (rawData.manufacturer_name) {
      identifiers.push(rawData.manufacturer_name);
    }

    // Product description (first 80 chars — enough for matching)
    if (rawData.product_description) {
      const desc = rawData.product_description.slice(0, 80);
      identifiers.push(desc);
    }

    // Reason for recall (core issue)
    if (rawData.reason_for_recall) {
      const reason = rawData.reason_for_recall.slice(0, 80);
      identifiers.push(reason);
    }
  }

  // NHTSA Vehicle Recalls (campaignNumber API format)
  if (sourceType === 'nhtsa' || sourceType === 'recalls-nhtsa' || sourceType === 'recalls-vehicles') {
    if (rawData.NHTSACampaignNumber) identifiers.push(rawData.NHTSACampaignNumber);
    if (rawData.Manufacturer) identifiers.push(rawData.Manufacturer);
    if (rawData.Make) identifiers.push(rawData.Make);
    if (rawData.Model) identifiers.push(rawData.Model);
    if (rawData.Component) {
      const comp = rawData.Component.split(/[,;]/)[0].trim();
      if (comp.length > 3) identifiers.push(comp);
    }
    // Legacy field names (recallsByDate API)
    if (rawData.CAMPNO) identifiers.push(rawData.CAMPNO);
    if (rawData.MFR_NAME) identifiers.push(rawData.MFR_NAME);
  }

  // NOAA Weather Alerts — handle both flat (new) and nested (legacy GeoJSON) formats
  if (sourceType === 'noaa' || sourceType === 'alerts-noaa' || sourceType === 'alerts-weather') {
    // Resolve props: flat format has fields at root, legacy has them under .properties
    const props = rawData.properties || rawData;

    // Event type (e.g., "Tornado Warning")
    if (props.event) identifiers.push(props.event);

    // Geographic identifiers (areas/counties) — use first county/area only
    if (props.areaDesc) {
      const firstArea = props.areaDesc.split(';')[0].trim();
      if (firstArea.length > 3) identifiers.push(firstArea);
    }
    if (props.headline) {
      const geoMatch = props.headline.match(/(?:for|in|across)\s+([A-Z][^.;]+)/);
      if (geoMatch) identifiers.push(geoMatch[1].trim());
    }
  }

  // FEMA Disaster Declarations
  if (sourceType === 'fema' || sourceType === 'disasters') {
    // Declaration string (e.g., "DR-4899-MS") — appears in every article
    if (rawData.femaDeclarationString) {
      identifiers.push(rawData.femaDeclarationString);
    }

    // State name
    if (rawData.state) identifiers.push(rawData.state);

    // Incident type (e.g., "Hurricane", "Tornado", "Winter Storm")
    if (rawData.incidentType) identifiers.push(rawData.incidentType);

    // Declaration title (e.g., "HURRICANE HELENE")
    if (rawData.declarationTitle) {
      identifiers.push(rawData.declarationTitle);
    }
  }

  // EPA AirNow Air Quality
  if (sourceType === 'airnow' || sourceType === 'air-quality') {
    if (rawData.reportingArea) identifiers.push(rawData.reportingArea);
    if (rawData.stateCode) identifiers.push(rawData.stateCode);
    if (rawData.worstParameter) identifiers.push(rawData.worstParameter);
    if (rawData.worstAQI != null) identifiers.push(String(rawData.worstAQI));
    if (rawData.worstCategory) identifiers.push(rawData.worstCategory);
  }

  // FDA Drug Shortages
  if (sourceType === 'fda-shortages' || sourceType === 'drug-shortages') {
    if (rawData.generic_name) identifiers.push(rawData.generic_name);
    if (rawData.dosage_form) identifiers.push(rawData.dosage_form);
    if (Array.isArray(rawData.brand_names)) {
      for (const bn of rawData.brand_names.slice(0, 3)) {
        identifiers.push(bn);
      }
    }
    if (rawData.status) identifiers.push(rawData.status);
  }

  // USGS Earthquakes
  if (sourceType === 'usgs' || sourceType === 'earthquakes') {
    const props = rawData.properties || rawData;

    // Magnitude — round to 1 decimal (Gemini writes "M 3.5", not "3.53468871787197")
    if (props.mag != null) {
      identifiers.push(String(Number(props.mag).toFixed(1)));
    }

    // Place — extract the named location, not the full "7 km WNW of Delta, B.C., MX"
    // Gemini rephrases distance/direction but keeps the place name
    if (props.place) {
      // Extract location name: strip "N km DIR of " prefix
      const nameMatch = props.place.match(/\d+\s*km\s+\w+\s+of\s+(.+)/i);
      const placeName = nameMatch ? nameMatch[1].trim() : props.place;
      identifiers.push(placeName);
    }
  }

  // General identifiers (all sources) — skip hostnames for weather/earthquake APIs (too generic)
  if (rawData.source_url && sourceType !== 'noaa' && sourceType !== 'usgs') {
    identifiers.push(new URL(rawData.source_url).hostname);
  }
  if (rawData.id || rawData.ID) identifiers.push(String(rawData.id || rawData.ID));

  // Clean and deduplicate
  return [...new Set(
    identifiers
      .filter(Boolean)
      .map(s => s.trim())
      .filter(s => s.length > 2)  // Too short to be meaningful
      .map(s => s.toLowerCase())
  )];
}

/**
 * Check if an article contains key identifiers from the source data.
 *
 * @param {string} articleText - Article body to search in
 * @param {string[]} identifiers - Identifiers to look for
 * @returns {object} { found: string[], missing: string[] }
 */
function findIdentifiers(articleText, identifiers) {
  const articleLower = articleText.toLowerCase();
  const found = [];
  const missing = [];

  for (const id of identifiers) {
    if (articleLower.includes(id)) {
      found.push(id);
    } else {
      missing.push(id);
    }
  }

  return { found, missing };
}

/**
 * Validate a generated article structure and content.
 *
 * @param {object} article - Generated article object
 * @param {object} rawData - Original source data
 * @param {object} [options] - Validation options
 * @param {string} [options.sourceType] - Source type for anti-hallucination checks
 * @returns {object} { valid: boolean, issues: string[] }
 */
export function validate(article, rawData, options = {}) {
  const { sourceType = 'unknown' } = options;
  const issues = [];

  // === Structure Checks ===

  if (!article.title || typeof article.title !== 'string') {
    issues.push('Missing or non-string title');
  } else {
    const titleLen = article.title.length;
    if (titleLen < 10) {
      issues.push(`Title too short (${titleLen} chars, minimum 10)`);
    } else if (titleLen > 120) {
      issues.push(`Title too long (${titleLen} chars, maximum 120)`);
    }
  }

  if (!article.summary || typeof article.summary !== 'string') {
    issues.push('Missing or non-string summary');
  } else {
    const summaryLen = article.summary.length;
    if (summaryLen < 20) {
      issues.push(`Summary too short (${summaryLen} chars, minimum 20)`);
    } else if (summaryLen > 250) {
      issues.push(`Summary too long (${summaryLen} chars, maximum 250)`);
    }
  }

  if (!article.body_md || typeof article.body_md !== 'string') {
    issues.push('Missing or non-string body_md');
  } else {
    const bodyLen = article.body_md.length;
    if (bodyLen < 200) {
      issues.push(`Article body too short (${bodyLen} chars, minimum 200)`);
    }
  }

  if (!article.category || typeof article.category !== 'string') {
    issues.push('Missing or non-string category');
  } else if (!VALID_CATEGORIES.includes(article.category)) {
    issues.push(`Invalid category: ${article.category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (!Array.isArray(article.tags) || article.tags.length === 0) {
    issues.push('Tags must be a non-empty array');
  } else if (article.tags.some(t => typeof t !== 'string')) {
    issues.push('All tags must be strings');
  }

  if (article.severity && !VALID_SEVERITIES.includes(article.severity)) {
    issues.push(`Invalid severity: ${article.severity}. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }

  if (article.location !== null && article.location !== undefined) {
    if (typeof article.location !== 'string') {
      issues.push('Location must be a string or null');
    } else if (article.location.length === 0) {
      issues.push('Location must not be empty string (use null for nationwide)');
    }
  }

  // === Placeholder Detection ===

  const allText = [
    article.title,
    article.summary,
    article.body_md,
  ].join(' ');

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = allText.match(pattern);
    if (matches) {
      issues.push(`Found placeholder text: ${matches.join(', ')}`);
    }
  }

  // === Anti-Hallucination Checks ===

  if (rawData && Object.keys(rawData).length > 0) {
    const identifiers = extractKeyIdentifiers(rawData, sourceType);

    if (identifiers.length > 0) {
      const bodyText = [article.title, article.summary, article.body_md].join(' ');
      const { found, missing } = findIdentifiers(bodyText, identifiers);

      // At least 30% of identifiers should appear, or at least 1 must appear
      const threshold = Math.max(1, Math.ceil(identifiers.length * 0.3));
      if (found.length < threshold) {
        const missingStr = missing.slice(0, 5).join(', ');
        issues.push(
          `Article missing key facts from source (found ${found.length}/${identifiers.length}): ${missingStr}`
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export default { validate };
