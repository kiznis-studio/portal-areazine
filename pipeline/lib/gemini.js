/**
 * Gemini Flash API client for article generation.
 * Pattern ported from kiznis-finance analyst.js.
 */

const API_KEY = process.env.GOOGLE_AI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-001';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract JSON from text that may be wrapped in markdown code blocks.
 */
function extractJSON(text) {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Try extracting from markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch { /* continue */ }
  }

  // Try finding JSON object/array in text
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch { /* continue */ }
  }

  throw new Error(`Could not extract JSON from response: ${text.slice(0, 200)}`);
}

/**
 * Call Gemini API with retry logic.
 * @param {string} prompt - The prompt to send
 * @param {object} [options] - Optional overrides
 * @returns {Promise<{text: string, tokens: number}>}
 */
export async function callGemini(prompt, options = {}) {
  const { temperature = 0.3, maxTokens = 4096, topP = 0.8 } = options;

  if (!API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY not set');
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      topP,
      maxOutputTokens: maxTokens,
    },
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        if (response.status === 429) {
          const wait = RETRY_DELAY_MS * attempt * 2;
          console.warn(`[gemini] Rate limited, waiting ${wait}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await sleep(wait);
          continue;
        }
        throw new Error(`Gemini API ${response.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];

      if (!candidate?.content?.parts?.[0]?.text) {
        throw new Error('Empty response from Gemini');
      }

      return {
        text: candidate.content.parts[0].text,
        tokens: data.usageMetadata?.totalTokenCount || 0,
      };
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`Gemini failed after ${MAX_RETRIES} attempts: ${err.message}`);
      }
      const wait = RETRY_DELAY_MS * attempt;
      console.warn(`[gemini] Attempt ${attempt} failed: ${err.message}, retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
}

/**
 * Call Gemini and extract JSON from the response.
 */
export async function callGeminiJSON(prompt, options = {}) {
  const { text, tokens } = await callGemini(prompt, options);
  const parsed = extractJSON(text);
  return { data: parsed, tokens };
}
