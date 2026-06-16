# ═══════════════════════════════════════════════════════════════════
# Thesium — Multi-stage Docker build
#
# Stage 1: Builder   — compiles TypeScript server + builds Vite frontend
# Stage 2: Production — slim image running compiled JS with `node`
#                       (no tsx, no devDependencies in production)
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: Builder ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install ALL dependencies (including devDeps for tsc + vite)
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy full source
COPY . .

# Compile TypeScript server → dist/server/
RUN npm run build:server

# Build Vite frontend → dist/ (overwrites nothing; server goes to dist/server/)
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install ONLY production dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate

# Copy compiled server from builder
COPY --from=builder /app/dist/server ./dist/server

# Copy built frontend from builder (served by Express static)
COPY --from=builder /app/dist ./dist

# Copy entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Create logs directory
RUN mkdir -p logs

# Non-root user for security
RUN addgroup -g 1001 -S thesium && \
    adduser -S thesium -u 1001 -G thesium && \
    chown -R thesium:thesium /app
USER thesium

EXPOSE 3001

# Health check — uses compiled server on port 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
