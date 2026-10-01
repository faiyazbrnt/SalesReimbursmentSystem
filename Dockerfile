# ====================================================
# Stage 1: Base image with Node.js and system dependencies
# ====================================================
FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install OpenSSL and CA certificates needed by Prisma engines
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# ====================================================
# Stage 2: Install dependencies and generate Prisma client
# ====================================================
FROM base AS deps
WORKDIR /app

# Copy dependency manifests and Prisma files
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY config ./config
COPY scripts ./scripts

# Install dependencies and trigger postinstall (prisma generate)
RUN npm ci

# ====================================================
# Stage 3: Build the Next.js application
# ====================================================
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .

# Build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Compile Next.js production bundle
RUN npm run build

# ====================================================
# Stage 4: Production Runner container
# ====================================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create a dedicated non-root system user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 nextjs

# Ensure uploads directory exists and is owned by nextjs
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

# Copy built application and required runtime artifacts
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/config ./config
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]

