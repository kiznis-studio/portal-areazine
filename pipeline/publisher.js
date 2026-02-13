/**
 * Areazine Publisher Daemon
 * Reads unpublished articles, generates markdown files in the Astro
 * content directory, and pushes to GitHub to trigger CI/CD.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { stmts } from './lib/db.js';
import { Sentry } from './lib/sentry.js';

const REPO_DIR = process.env.REPO_DIR || '/repo';
const CONTENT_DIR = join(REPO_DIR, 'src', 'content', 'articles');
const MAX_BATCH = parseInt(process.env.MAX_BATCH_SIZE || '50');
const PUBLISH_INTERVAL = parseInt(process.env.PUBLISH_INTERVAL || '30') * 60_000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const INDEXNOW_KEY = '766538bdafcc4bf2b8f3a2d4d4d0b9fa';
const SITE_URL = 'https://areazine.com';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run a git command in the repo directory.
 */
function git(...args) {
  return execFileSync('git', args, {
    cwd: REPO_DIR,
    encoding: 'utf-8',
    timeout: 60_000,
  }).trim();
}

/**
 * Generate frontmatter + markdown for an article.
 */
function generateMarkdown(article) {
  const tags = JSON.parse(article.tags || '[]');
  // Use article generation time (UTC from SQLite) as publish date
  const publishDate = article.generated_at
    ? new Date(article.generated_at + 'Z').toISOString()
    : new Date().toISOString();

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(article.title)}`,
    `summary: ${JSON.stringify(article.summary)}`,
    `category: "${article.category}"`,
    `tags: ${JSON.stringify(tags)}`,
  ];

  if (article.location) {
    frontmatter.push(`location: "${article.location}"`);
  }
  if (article.severity) {
    frontmatter.push(`severity: "${article.severity}"`);
  }
  if (article.source_url) {
    frontmatter.push(`sourceUrl: "${article.source_url}"`);
  }

  frontmatter.push(`sourceAgency: "${article.source_agency}"`);
  frontmatter.push(`publishedAt: ${publishDate}`);
  frontmatter.push('---');
  frontmatter.push('');

  return frontmatter.join('\n') + article.body_md;
}

/**
 * Ensure the content directory for the current month exists.
 */
function ensureContentDir() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dir = join(CONTENT_DIR, String(year), month);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
}

/**
 * Build the Astro site and deploy to Cloudflare Pages.
 * Called after a successful git push.
 */
function buildAndDeploy(articleCount) {
  const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
  const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!CF_TOKEN || !CF_ACCOUNT) {
    console.warn('[publisher] No Cloudflare credentials, skipping deploy');
    return;
  }

  console.log('[publisher] Building site...');
  const buildStart = Date.now();

  execFileSync('npm', ['run', 'build'], {
    cwd: REPO_DIR,
    encoding: 'utf-8',
    timeout: 600_000,
    env: {
      ...process.env,
      SKIP_OG: 'true',
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=2048',
      PATH: process.env.PATH,
    },
  });

  const buildSec = ((Date.now() - buildStart) / 1000).toFixed(1);
  console.log(`[publisher] Build completed in ${buildSec}s`);

  console.log('[publisher] Deploying to Cloudflare Pages...');
  execFileSync('npx', [
    'wrangler', 'pages', 'deploy', 'dist',
    '--project-name=portal-areazine',
    '--branch=main',
    `--commit-message=Pipeline: ${articleCount} articles`,
    '--commit-dirty=true',
  ], {
    cwd: REPO_DIR,
    encoding: 'utf-8',
    timeout: 300_000,
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: CF_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT,
      PATH: process.env.PATH,
    },
  });

  console.log('[publisher] Deploy complete');
}

/**
 * Publish a batch of articles.
 * Bulletproof pattern: clean → sync → write → commit → push → build → deploy.
 */
async function publishBatch() {
  const articles = stmts.getUnpublished.all(MAX_BATCH);

  if (articles.length === 0) {
    return 0;
  }

  console.log(`[publisher] Publishing ${articles.length} articles...`);

  // ── STEP 1: Clean local state ──
  // Discard any leftover changes from failed pushes or external edits.
  // Safe because unpublished articles are still in the DB and will be re-written.
  try {
    git('checkout', '--', '.');
    git('clean', '-fd', 'src/content/articles/');
  } catch (err) {
    console.warn(`[publisher] Git clean failed: ${err.message}`);
  }

  // ── STEP 2: Sync with upstream ──
  // Pulls any code changes pushed from dev VM.
  // Always fast-forwards since we just cleaned.
  try {
    git('fetch', 'origin', 'main');
    git('reset', '--hard', 'origin/main');
  } catch (err) {
    console.error(`[publisher] Git sync failed: ${err.message}`);
    Sentry.captureException(err, { tags: { component: 'publisher', action: 'git-sync' } });
    return 0;
  }

  // ── STEP 3: Write article files ──
  const contentDir = ensureContentDir();
  const filePaths = [];

  for (const article of articles) {
    const markdown = generateMarkdown(article);
    const filePath = join(contentDir, `${article.id}.md`);
    writeFileSync(filePath, markdown, 'utf-8');
    filePaths.push(filePath);
    console.log(`[publisher] Wrote: ${filePath}`);
  }

  // ── STEP 4: Commit and push ──
  try {
    for (const fp of filePaths) {
      git('add', fp);
    }

    const commitMsg = articles.length === 1
      ? `Add article: ${articles[0].title.slice(0, 60)}`
      : `Add ${articles.length} articles`;

    git('commit', '-m', commitMsg);
    git('push', 'origin', 'main');
    const sha = git('rev-parse', '--short', 'HEAD');
    console.log(`[publisher] Pushed commit ${sha}`);
  } catch (err) {
    console.error(`[publisher] Git push failed: ${err.message}`);
    Sentry.captureException(err, { tags: { component: 'publisher', action: 'git-push' } });
    return 0;
  }

  // ── STEP 5: Build and deploy ──
  try {
    buildAndDeploy(articles.length);
  } catch (err) {
    // Push succeeded, so articles are in GitHub even if deploy fails.
    // Mark as published anyway — deploy will catch up next cycle.
    console.error(`[publisher] Deploy failed: ${err.message}`);
    Sentry.captureException(err, { tags: { component: 'publisher', action: 'deploy' } });
  }

  // ── STEP 6: Mark published + IndexNow ──
  await submitIndexNow(articles);

  const batchId = randomUUID();
  const sha = git('rev-parse', '--short', 'HEAD');
  for (const article of articles) {
    stmts.markPublished.run({ id: article.id });
  }

  stmts.insertPublishLog.run({
    batch_id: batchId,
    article_count: articles.length,
    commit_sha: sha,
  });

  return articles.length;
}

/**
 * Submit URLs to IndexNow (Bing, Yandex) for instant indexing.
 */
async function submitIndexNow(articles) {
  const CATEGORIES = {
    'recalls-cpsc': 'recalls/cpsc',
    'recalls-fda': 'recalls/fda',
    'recalls-vehicles': 'recalls/vehicles',
    'weather': 'weather',
    'earthquakes': 'earthquakes',
    'disasters': 'disasters',
    'drug-shortages': 'drug-shortages',
    'air-quality': 'air-quality',
  };

  const urls = articles.map(a => {
    const catSlug = CATEGORIES[a.category] || a.category;
    return `${SITE_URL}/${catSlug}/${a.id}`;
  });

  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: 'areazine.com',
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
    console.log(`[publisher] IndexNow submitted ${urls.length} URLs, status: ${response.status}`);
  } catch (err) {
    console.warn(`[publisher] IndexNow failed: ${err.message}`);
  }
}

/**
 * Configure git identity and credentials for pushing.
 */
function configureGit() {
  const name = process.env.GIT_AUTHOR_NAME || 'Areazine Pipeline';
  const email = process.env.GIT_AUTHOR_EMAIL || 'pipeline@areazine.com';

  git('config', 'user.name', name);
  git('config', 'user.email', email);

  if (GITHUB_TOKEN) {
    // Set HTTPS remote with embedded token for authentication
    const currentRemote = git('remote', 'get-url', 'origin');
    const repoPath = currentRemote
      .replace(/^https?:\/\/[^/]*\//, '')
      .replace(/^git@github\.com:/, '')
      .replace(/\.git$/, '');
    const tokenUrl = `https://x-access-token:${GITHUB_TOKEN}@github.com/${repoPath}.git`;
    git('remote', 'set-url', 'origin', tokenUrl);
    console.log('[publisher] Git credentials configured via GITHUB_TOKEN');
  }
}

/**
 * Main loop — publishes at configured intervals.
 */
async function main() {
  console.log('[publisher] Starting areazine publisher');
  console.log(`[publisher] Repo: ${REPO_DIR}`);
  console.log(`[publisher] Interval: ${PUBLISH_INTERVAL / 60_000} minutes`);

  configureGit();

  while (true) {
    try {
      const published = await publishBatch();
      if (published > 0) {
        console.log(`[publisher] Batch complete: ${published} articles published`);
      }
    } catch (err) {
      console.error(`[publisher] Batch error: ${err.message}`);
    }

    await sleep(PUBLISH_INTERVAL);
  }
}

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('[publisher] Received SIGTERM, shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[publisher] Received SIGINT, shutting down');
  process.exit(0);
});

main().catch(err => {
  console.error('[publisher] Fatal error:', err);
  Sentry.captureException(err);
  Sentry.flush(2000).finally(() => process.exit(1));
});
