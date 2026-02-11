FROM node:24-slim

# Git is needed for publisher to commit and push
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production 2>/dev/null || npm install --production

# Copy pipeline code
COPY . .

# Default data directory (override with volume mount)
ENV DATA_DIR=/data
ENV REPO_DIR=/repo

# Health check: ensure node is responsive
HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
  CMD node -e "process.exit(0)"

# No default CMD — set per-service in docker-compose
