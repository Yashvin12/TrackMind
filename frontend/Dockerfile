# ── TrackMind Frontend — Multi-Stage Production Dockerfile ────────────────────
# Stage 1: Build the React/Vite application
# Stage 2: Serve static assets with Nginx Alpine

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package manifests and install dependencies first (layer caching)
COPY package.json package-lock.json ./

# Use --prefer-offline to use local cache when available in CI
RUN npm ci --prefer-offline

# Copy all source code
COPY . .

# Ensure API/WS urls are relative (served through Nginx proxy)
# Vite reads VITE_ prefixed env at build time — none needed for proxy mode
ENV NODE_ENV=production

# Build production bundle
RUN npm run build

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default Nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/trackmind.conf

# Non-root user (Nginx listens on 5173 which is > 1024)
RUN addgroup -S trackmind && adduser -S trackmind -G trackmind \
    && chown -R trackmind:trackmind /usr/share/nginx/html \
    && chown -R trackmind:trackmind /var/cache/nginx \
    && chown -R trackmind:trackmind /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown trackmind:trackmind /var/run/nginx.pid

USER trackmind

EXPOSE 5173

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:5173 || exit 1

CMD ["nginx", "-g", "daemon off;"]
