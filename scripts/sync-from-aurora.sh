#!/bin/bash
# Sync areazine pipeline data from Aurora to local development.
#
# This pulls:
#   1. Generated articles (via git pull - already in the repo)
#   2. SQLite database snapshot (pipeline state: raw data, articles, publish log)
#
# Usage:
#   ./scripts/sync-from-aurora.sh          # Sync everything
#   ./scripts/sync-from-aurora.sh --db     # DB only
#   ./scripts/sync-from-aurora.sh --git    # Git pull only

set -euo pipefail

AURORA="root@158.101.199.103"
REMOTE_DB="/storage/areazine/areazine.db"
LOCAL_DB_DIR="pipeline/data"
LOCAL_DB="$LOCAL_DB_DIR/areazine.db"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_DIR"

sync_git() {
  echo "=== Pulling latest from GitHub ==="
  git pull --rebase origin main
  echo "Done. Content articles are in src/content/articles/"
}

sync_db() {
  echo "=== Syncing SQLite database from Aurora ==="
  mkdir -p "$LOCAL_DB_DIR"

  # Use SQLite backup mode to get a consistent snapshot
  ssh "$AURORA" "sqlite3 $REMOTE_DB '.backup /tmp/areazine-backup.db'" 2>/dev/null
  scp "$AURORA:/tmp/areazine-backup.db" "$LOCAL_DB"
  ssh "$AURORA" "rm -f /tmp/areazine-backup.db" 2>/dev/null

  echo "Done. DB at $LOCAL_DB"
  echo ""
  echo "Quick stats:"
  sqlite3 "$LOCAL_DB" "
    SELECT 'Raw records: ' || COUNT(*) FROM raw_data;
    SELECT 'Articles: ' || COUNT(*) FROM articles;
    SELECT 'Published: ' || COUNT(*) FROM articles WHERE published = 1;
    SELECT 'Pending: ' || COUNT(*) FROM articles WHERE published = 0;
  "
}

case "${1:-all}" in
  --db)    sync_db ;;
  --git)   sync_git ;;
  all|*)   sync_git; echo ""; sync_db ;;
esac
