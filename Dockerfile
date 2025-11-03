FROM node:18-alpine

# Install timezone data
RUN apk add --no-cache tzdata

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy all application files
COPY . .

# Create config directory with proper permissions
RUN mkdir -p config && chmod 755 config

# Create a healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8188/api/config', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose port 8188
EXPOSE 8188

# Labels
LABEL maintainer="Tautulli Map Viewer"
LABEL description="Real-time map visualization for Tautulli/Plex streams with server-side config"
LABEL version="1.1"

# Start the server
CMD ["node", "server.js"]