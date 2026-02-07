# Commute Compute System Docker Image
# License: AGPL-3.0
# See LICENSE file for full terms

# Use Node.js 20 Alpine for minimal image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install production dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create data directory for persistent storage
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/status', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

# Environment defaults (can be overridden)
ENV NODE_ENV=production \
    PORT=3000

# Start application
CMD ["node", "src/server.js"]
