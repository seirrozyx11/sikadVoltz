# SikadVoltz Backend - Production Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build dependencies
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production image
FROM node:20-alpine AS production

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    tini \
    curl \
    && rm -rf /var/cache/apk/*

# Create app user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=appuser:appgroup . .

# Create necessary directories with proper permissions
RUN mkdir -p logs tmp && \
    chown -R appuser:appgroup /app

# Remove unnecessary files for production
RUN rm -rf \
    tests/ \
    coverage/ \
    .env.test \
    .eslintrc.js \
    .prettierrc.js \
    jest.config.json \
    *.md \
    deployment/ \
    scripts/setup-apm.js

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "index.js"]

# Metadata
LABEL \
    org.opencontainers.image.title="SikadVoltz Backend" \
    org.opencontainers.image.description="Backend API for SikadVoltz cycling training application" \
    org.opencontainers.image.version="1.0.0" \
    org.opencontainers.image.source="https://github.com/seirrozyx11/sikadVoltz" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.vendor="SikadVoltz Team"