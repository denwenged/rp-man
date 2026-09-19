# Multi-stage Dockerfile for RP-Man
# Stage 1: Build Frontend and Server Bundle
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source files and configuration
COPY . .

# Build Vite client static files and server bundle
RUN npm run build:client
RUN npm run build:server

# Stage 2: Production Runtime
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install lightweight runtime utilities for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Install production dependencies (better-sqlite3 uses prebuilt glibc binaries)
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built frontend client assets and source files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Ensure persistent data directories exist
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

VOLUME ["/app/data", "/app/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["npx", "tsx", "src/server/index.ts"]
