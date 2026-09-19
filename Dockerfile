# Multi-stage Dockerfile for RP-Man
# Stage 1: Build Frontend
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:client

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Install native dependencies for SQLite and system monitoring
RUN apk add --no-cache python3 make g++ sqlite

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and built frontend
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Create persistent storage directories
RUN mkdir -p /app/data /app/uploads

# Install tsx globally or run directly
RUN npm install -g tsx

EXPOSE 3000

VOLUME ["/app/data", "/app/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["tsx", "src/server/index.ts"]
