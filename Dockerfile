# Stage 1: Build Frontend and Server
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
RUN npm ci

# Copy all source files
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js ./
COPY client ./client
COPY server ./server
COPY shared ./shared

# Build client and server
RUN npm run build

# Stage 2: Production Minimal Runtime
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Security hardening: run as unprivileged node user
USER node

EXPOSE 3000

# Zero persistence guarantee: purely in-memory ephemeral execution
CMD ["node", "dist/server/server/src/index.js"]
