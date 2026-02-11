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

const REPO_DIR = process.env.REPO_DIR || '/repo';
const CONTENT_DIR = join(REPO_DIR, 'src', 'content', 'articles');
const MAX_BATCH = parseInt(process.env.MAX_BATCH_SIZE || '50');
const PUBLISH_INTERVAL = parseInt(process.env.PUBLISH_INTERVAL || '30') * 60_000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

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
 * Publish a batch of articles.
 */
async function publishBatch() {
  const articles = stmts.getUnpublished.all(MAX_BATCH);

  if (articles.length === 0) {
    return 0;
  }

  console.log(`[publisher] Publishing ${articles.length} articles...`);

  // Pull latest to avoid conflicts
  try {
    git('pull', '--rebase', 'origin', 'main');
  } catch (err) {
    console.warn(`[publisher] Git pull failed: ${err.message}, continuing anyway`);
  }

  const contentDir = ensureContentDir();
  const filePaths = [];

  for (const article of articles) {
    const markdown = generateMarkdown(article);
    const filePath = join(contentDir, `${article.id}.md`);

    writeFileSync(filePath, markdown, 'utf-8');
    filePaths.push(filePath);
    console.log(`[publisher] Wrote: ${filePath}`);
  }

  // Git add, commit, push
  try {
    for (const fp of filePaths) {
      git('add', fp);
    }

    const commitMsg = articles.length === 1
      ? `Add article: ${articles[0].title.slice(0, 60)}`
      : `Add ${articles.length} articles`;

    git('commit', '-m', commitMsg);
    const sha = git('rev-parse', '--short', 'HEAD');
    git('push', 'origin', 'main');

    console.log(`[publisher] Pushed commit ${sha} with ${articles.length} articles`);

    // Mark all as published
    const batchId = randomUUID();
    for (const article of articles) {
      stmts.markPublished.run({ id: article.id });
    }

    stmts.insertPublishLog.run({
      batch_id: batchId,
      article_count: articles.length,
      commit_sha: sha,
    });

    return articles.length;
  } catch (err) {
    console.error(`[publisher] Git push failed: ${err.message}`);
    return 0;
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
  process.exit(1);
});
