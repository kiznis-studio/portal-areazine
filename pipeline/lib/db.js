import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';

const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = `${DATA_DIR}/areazine.db`;

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

// Schema migration
db.exec(`
  CREATE TABLE IF NOT EXISTS raw_data (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    category TEXT,
    raw_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    body_md TEXT NOT NULL,
    category TEXT NOT NULL,
    tags TEXT,
    location TEXT,
    severity TEXT,
    source_url TEXT,
    source_agency TEXT,
    tokens_used INTEGER DEFAULT 0,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    published INTEGER DEFAULT 0,
    published_at TEXT,
    FOREIGN KEY (source_id) REFERENCES raw_data(id)
  );

  CREATE TABLE IF NOT EXISTS publish_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    article_count INTEGER,
    commit_sha TEXT,
    published_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fetch_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    new_records INTEGER DEFAULT 0,
    total_records INTEGER DEFAULT 0,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_raw_processed ON raw_data(processed, source);
  CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published, category);
  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category, generated_at);
  CREATE INDEX IF NOT EXISTS idx_fetch_log_source ON fetch_log(source, fetched_at);
`);

// Prepared statements
const stmts = {
  insertRaw: db.prepare(`
    INSERT OR IGNORE INTO raw_data (id, source, category, raw_json)
    VALUES (@id, @source, @category, @raw_json)
  `),

  getUnprocessed: db.prepare(
    'SELECT * FROM raw_data WHERE processed = 0 ORDER BY fetched_at LIMIT ?'
  ),

  markProcessed: db.prepare(
    'UPDATE raw_data SET processed = @status WHERE id = @id'
  ),

  insertArticle: db.prepare(`
    INSERT OR IGNORE INTO articles (id, source_id, title, summary, body_md, category, tags, location, severity, source_url, source_agency, tokens_used)
    VALUES (@id, @source_id, @title, @summary, @body_md, @category, @tags, @location, @severity, @source_url, @source_agency, @tokens_used)
  `),

  getUnpublished: db.prepare(
    'SELECT * FROM articles WHERE published = 0 ORDER BY generated_at LIMIT ?'
  ),

  markPublished: db.prepare(
    "UPDATE articles SET published = 1, published_at = datetime('now') WHERE id = @id"
  ),

  insertPublishLog: db.prepare(`
    INSERT INTO publish_log (batch_id, article_count, commit_sha)
    VALUES (@batch_id, @article_count, @commit_sha)
  `),

  insertFetchLog: db.prepare(`
    INSERT INTO fetch_log (source, new_records, total_records, error)
    VALUES (@source, @new_records, @total_records, @error)
  `),

  lastFetch: db.prepare(
    'SELECT fetched_at FROM fetch_log WHERE source = ? AND error IS NULL ORDER BY fetched_at DESC LIMIT 1'
  ),

  stats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM raw_data) as total_raw,
      (SELECT COUNT(*) FROM raw_data WHERE processed = 0) as pending_raw,
      (SELECT COUNT(*) FROM articles) as total_articles,
      (SELECT COUNT(*) FROM articles WHERE published = 0) as pending_articles
  `),

  sourceStats: db.prepare(
    'SELECT source, COUNT(*) as count, SUM(CASE WHEN processed = 0 THEN 1 ELSE 0 END) as pending FROM raw_data GROUP BY source'
  ),
};

// Batch insert for raw data
const insertRawBatch = db.transaction((records) => {
  let inserted = 0;
  for (const record of records) {
    const result = stmts.insertRaw.run(record);
    if (result.changes > 0) inserted++;
  }
  return inserted;
});

export { db, stmts, insertRawBatch };
