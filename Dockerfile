# Multi-stage Dockerfile for RP-Man (Optimized for ZimaOS, CasaOS, and Linux/macOS/Windows)
# Stage 1: Build Frontend & Server
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install build tools in case native recompilation is required on ARM / offline networks
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests first for optimal layer caching
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source code and configurations
COPY . .

# Build Vite client static bundle and server bundle
RUN npm run build:client
RUN npm run build:server

# Stage 2: Production Runtime
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install runtime utilities (curl/wget for healthcheck, sqlite3 for CLI inspection)
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    curl \
    wget \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built frontend assets and server sources from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Prepare data and uploads directories for persistent volumes
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

VOLUME ["/app/data", "/app/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Start the application
CMD ["npx", "tsx", "src/server/index.ts"]
