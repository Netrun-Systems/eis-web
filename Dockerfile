# ============================================================
# EIS Web — Multi-stage Docker build
# Stage 1: Build Vite frontend
# Stage 2: Production image — Express API + static frontend
# ============================================================

# ── Stage 1: Build frontend ──────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
# Use --legacy-peer-deps: @pixi/react@8 requires React 19 but project uses React 18
RUN npm ci --legacy-peer-deps

COPY . .

# Build the Vite SPA (tsc + vite build)
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install production deps + tsx for TypeScript API runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && \
    npm install --legacy-peer-deps tsx typescript @types/node

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy API source (TypeScript — run via tsx/esm at runtime)
COPY --from=builder /app/src/api ./src/api
COPY --from=builder /app/db ./db

# Copy public CSV data files into dist so they're served as static assets
COPY --from=builder /app/public/data ./dist/data

# Copy server entrypoint
COPY server.mjs ./server.mjs

ENV NODE_ENV=production
EXPOSE 8080

# Use tsx ESM loader to resolve TypeScript imports at runtime
CMD ["node", "--import", "tsx/esm", "server.mjs"]
