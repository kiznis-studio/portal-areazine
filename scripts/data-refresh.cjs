#!/usr/bin/env node
/**
 * Automated data refresh for areazine city/state profiles.
 *
 * Runs all data source fetchers, reports errors to Sentry, commits changes,
 * and pushes to GitHub to trigger a Cloudflare Pages rebuild.
 *
 * Designed to run as a systemd timer on Aurora (monthly for Census/Crime,
 * quarterly for CDC/CMS).
 *
 * Usage:
 *   node scripts/data-refresh.cjs                    # Run all sources
 *   node scripts/data-refresh.cjs --source=census    # Single source
 *   node scripts/data-refresh.cjs --source=crime
 *   node scripts/data-refresh.cjs --source=historical
 *   node scripts/data-refresh.cjs --dry-run          # No commit/push
 *   node scripts/data-refresh.cjs --no-push          # Commit but don't push
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const NO_PUSH = process.argv.includes('--no-push');
const SOURCE_FILTER = process.argv.find(a => a.startsWith('--source='))?.split('=')[1] || null;

const REPO_DIR = path.join(__dirname, '..');
const SENTRY_DSN = 'https://234e5ea110716ac89ad5945a83ea0e5f@o4510827630231552.ingest.de.sentry.io/4510867553779792';

// Lazy-load Sentry (may not be installed in dev)
let Sentry = null;
try {
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
  });
} catch {
  // Sentry not available — continue without it
}

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] ${msg}`);
}

function reportError(source, error) {
  console.error(`[ERROR] ${source}: ${error.message}`);
  if (Sentry) {
    Sentry.captureException(error, {
      tags: { component: 'data-refresh', source },
      extra: { stdout: error.stdout?.toString().slice(-2000) || '' },
    });
  }
}

function reportMessage(msg, level = 'info') {
  log(msg);
  if (Sentry) {
    Sentry.captureMessage(msg, level);
  }
}

/**
 * Run a fetch script as a child process. Returns { success, duration, error }.
 */
function runFetcher(scriptName, args = []) {
  const scriptPath = path.join(__dirname, scriptName);
  const start = Date.now();
  try {
    log(`Running ${scriptName}...`);
    const output = execFileSync('node', [scriptPath, ...args], {
      cwd: REPO_DIR,
      timeout: 30 * 60 * 1000, // 30 min max per script
      maxBuffer: 50 * 1024 * 1024, // 50MB output buffer
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' },
    });
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    log(`  Completed ${scriptName} in ${duration}s`);
    return { success: true, duration: parseFloat(duration), output: output.toString() };
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    err.message = `${scriptName} failed after ${duration}s: ${err.message}`;
    return { success: false, duration: parseFloat(duration), error: err };
  }
}

/**
 * Check if there are any git changes to commit.
 */
function hasChanges() {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_DIR }).toString().trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

/**
 * Count changed files by pattern.
 */
function countChanges(pattern) {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_DIR }).toString();
    return status.split('\n').filter(l => l.includes(pattern)).length;
  } catch {
    return 0;
  }
}

/**
 * Commit and push changes.
 */
function commitAndPush(sources) {
  if (DRY_RUN) {
    log('[dry-run] Would commit and push changes');
    return;
  }

  if (!hasChanges()) {
    log('No changes to commit');
    return;
  }

  const cityCount = countChanges('city-profiles');
  const stateCount = countChanges('state-profiles');
  const otherCount = countChanges('national-stats');

  const sourceList = sources.join(', ');
  const parts = [];
  if (cityCount > 0) parts.push(`${cityCount} city profiles`);
  if (stateCount > 0) parts.push(`${stateCount} state profiles`);
  if (otherCount > 0) parts.push('national stats');

  const commitMsg = `data-refresh: Update ${parts.join(', ')} (${sourceList})`;

  try {
    // Stage data files only
    execFileSync('git', ['add', 'src/data/city-profiles/', 'src/data/state-profiles/', 'src/data/national-stats.json'], {
      cwd: REPO_DIR,
    });

    execFileSync('git', ['commit', '-m', commitMsg], {
      cwd: REPO_DIR,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Areazine Data Refresh',
        GIT_AUTHOR_EMAIL: 'data-refresh@areazine.com',
        GIT_COMMITTER_NAME: 'Areazine Data Refresh',
        GIT_COMMITTER_EMAIL: 'data-refresh@areazine.com',
      },
    });
    log(`Committed: ${commitMsg}`);

    if (!NO_PUSH) {
      execFileSync('git', ['push', 'origin', 'main'], { cwd: REPO_DIR, timeout: 60000 });
      log('Pushed to GitHub — Cloudflare Pages rebuild triggered');
    }
  } catch (err) {
    reportError('git', err);
  }
}

/**
 * Validate data after refresh — check for anomalies.
 */
function validateData() {
  const issues = [];

  // Spot-check a few city profiles
  const testCities = [
    'src/data/city-profiles/CA/san-francisco.json',
    'src/data/city-profiles/NY/buffalo.json',
    'src/data/city-profiles/TX/houston.json',
  ];

  for (const cityPath of testCities) {
    const fullPath = path.join(REPO_DIR, cityPath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const profile = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

      // Check population is reasonable
      if (profile.population && (profile.population < 100 || profile.population > 50_000_000)) {
        issues.push(`${cityPath}: Suspicious population ${profile.population}`);
      }

      // Check income is reasonable (in dollars)
      if (profile.medianHouseholdIncome && (profile.medianHouseholdIncome < 5000 || profile.medianHouseholdIncome > 500_000)) {
        issues.push(`${cityPath}: Suspicious income ${profile.medianHouseholdIncome}`);
      }

      // Check crime rates are per 100k (not raw counts)
      if (profile.crime?.violentCrimeRate > 5000) {
        issues.push(`${cityPath}: Violent crime rate ${profile.crime.violentCrimeRate} seems too high (per 100k)`);
      }

      // Check history has valid years
      if (profile.history?.years && profile.history.years.length < 5) {
        issues.push(`${cityPath}: History only has ${profile.history.years.length} years`);
      }
    } catch (err) {
      issues.push(`${cityPath}: Failed to parse: ${err.message}`);
    }
  }

  // Check national stats
  const natPath = path.join(REPO_DIR, 'src/data/national-stats.json');
  if (fs.existsSync(natPath)) {
    try {
      const nat = JSON.parse(fs.readFileSync(natPath, 'utf8'));
      if (!nat.avgMedianIncome || nat.avgMedianIncome < 30000 || nat.avgMedianIncome > 150000) {
        issues.push(`national-stats.json: Suspicious avgMedianIncome ${nat.avgMedianIncome}`);
      }
    } catch (err) {
      issues.push(`national-stats.json: Failed to parse: ${err.message}`);
    }
  }

  return issues;
}

async function main() {
  log('=== Areazine Data Refresh ===');
  log(`Mode: ${DRY_RUN ? 'dry-run' : NO_PUSH ? 'no-push' : 'full'}`);
  log(`Source filter: ${SOURCE_FILTER || 'all'}`);

  const results = {};

  // Define all data sources and their fetch scripts
  const allSources = {
    census: { script: 'fetch-all-city-data.cjs', args: [], description: 'Census ACS + CDC + CMS' },
    crime: { script: 'fetch-crime-data.cjs', args: [], description: 'FBI Crime Data (CDE)' },
    historical: { script: 'fetch-historical-data.cjs', args: [], description: 'Census Historical (2013-2023)' },
  };

  // Filter to requested source(s)
  const sourcesToRun = [];
  for (const [name, config] of Object.entries(allSources)) {
    if (SOURCE_FILTER && name !== SOURCE_FILTER) continue;
    sourcesToRun.push({ name, ...config });
  }

  if (sourcesToRun.length === 0) {
    log(`Unknown source: ${SOURCE_FILTER}. Available: ${Object.keys(allSources).join(', ')}`);
    process.exit(1);
  }

  // Run each fetcher
  const failedSources = [];
  const succeededSources = [];

  for (const source of sourcesToRun) {
    log(`\n--- ${source.description} ---`);
    const result = runFetcher(source.script, DRY_RUN ? ['--dry-run', ...source.args] : source.args);
    results[source.name] = result;

    if (result.success) {
      succeededSources.push(source.name);
    } else {
      failedSources.push(source.name);
      reportError(source.name, result.error);
    }
  }

  // Validate data
  log('\n--- Validation ---');
  const issues = validateData();
  if (issues.length > 0) {
    const msg = `Data validation found ${issues.length} issues:\n${issues.join('\n')}`;
    reportMessage(msg, 'warning');
  } else {
    log('Validation passed — no anomalies detected');
  }

  // Commit and push if anything succeeded
  if (succeededSources.length > 0 && !DRY_RUN) {
    log('\n--- Git ---');
    commitAndPush(succeededSources);
  }

  // Summary
  log('\n=== Summary ===');
  for (const [name, result] of Object.entries(results)) {
    const status = result.success ? 'OK' : 'FAILED';
    log(`  ${name}: ${status} (${result.duration}s)`);
  }
  if (issues.length > 0) {
    log(`  Validation issues: ${issues.length}`);
  }
  if (failedSources.length > 0) {
    reportMessage(`Data refresh completed with failures: ${failedSources.join(', ')}`, 'error');
  } else {
    log('All sources refreshed successfully');
  }

  // Flush Sentry events before exit
  if (Sentry) {
    await Sentry.flush(5000);
  }

  process.exit(failedSources.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  if (Sentry) {
    Sentry.captureException(err);
    Sentry.flush(5000).finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
