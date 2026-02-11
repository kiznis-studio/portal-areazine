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
  'economy',
  'finance',
  'technology',
];

const VALID_SEVERITIES = ['high', 'medium', 'low'];

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
    if (rawData.Title) identifiers.push(rawData.Title);
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
  }

  // FDA Recalls
  if (sourceType === 'fda' || sourceType === 'recalls-fda') {
    // Recall number (e.g., "X-123456-1")
    if (rawData.recall_number) identifiers.push(rawData.recall_number);

    // Product classification
    if (rawData.product_classification) {
      identifiers.push(rawData.product_classification);
    }

    // Manufacturer name
    if (rawData.manufacturer_name) {
      identifiers.push(rawData.manufacturer_name);
    }
  }

  // NHTSA Vehicle Recalls
  if (sourceType === 'nhtsa' || sourceType === 'recalls-nhtsa') {
    // Campaign number (e.g., "20V123")
    if (rawData.CAMPNO) identifiers.push(rawData.CAMPNO);

    // Manufacturer name
    if (rawData.MFR_NAME) identifiers.push(rawData.MFR_NAME);

    // Vehicle/component description
    if (rawData.COMPONENT_DESC) {
      const comp = rawData.COMPONENT_DESC.split(/[,;]/)[0].trim();
      if (comp.length > 3) identifiers.push(comp);
    }
  }

  // NOAA Weather Alerts
  if (sourceType === 'noaa' || sourceType === 'alerts-noaa' || sourceType === 'alerts-weather') {
    // Event type (e.g., "Tornado Warning")
    if (rawData.event) identifiers.push(rawData.event);
    if (rawData.phenomenon || rawData.phenomena) {
      identifiers.push(rawData.phenomenon || rawData.phenomena);
    }

    // Geographic identifiers (areas/counties)
    if (rawData.areaDesc) identifiers.push(rawData.areaDesc);
    if (rawData.headline) {
      // Extract geographic markers from headline
      const geoMatch = rawData.headline.match(/(?:for|in|across)\s+([A-Z][^.;]+)/);
      if (geoMatch) identifiers.push(geoMatch[1].trim());
    }
  }

  // General identifiers (all sources)
  if (rawData.source_url) identifiers.push(new URL(rawData.source_url).hostname);
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
