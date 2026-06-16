# ═══════════════════════════════════════════════════════════════════
# Thesium — Multi-stage Docker build
# Stage 1: Build frontend + compile TypeScript
# Stage 2: Production image (slim)
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: Builder ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build frontend
COPY . .
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install only production deps
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy server source (runs via tsx in prod, or compile separately)
COPY server ./server

# Copy entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Create logs directory
RUN mkdir -p server/logs

# Non-root user for security
RUN addgroup -g 1001 -S thesium && \
    adduser -S thesium -u 1001 -G thesium && \
    chown -R thesium:thesium /app
USER thesium

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
