# ── NEXUS SUPPORT API — Dockerfile ──
# Node 20 on Debian Bookworm for mediasoup C++ compilation + FFmpeg

FROM node:20-bookworm-slim AS base

# Install mediasoup build dependencies + FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/* \
    python3 \
    python3-pip \
    build-essential \
    gcc \
    g++ \
    make \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Dependencies stage ──
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm install
RUN npx prisma generate

# ── Development stage ──
FROM base AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY . .
RUN npx prisma generate

# Expose API port + mediasoup UDP range
EXPOSE 8080
EXPOSE 40000-49999/udp

CMD ["npx", "ts-node-dev", "--respawn", "--transpile-only", "src/server.ts"]

# ── Production build stage ──
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npx tsc

# ── Production stage ──
FROM base AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 8080
EXPOSE 40000-49999/udp

CMD ["node", "dist/server.js"]
