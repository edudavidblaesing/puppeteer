FROM node:20-slim

# Install chromium and fonts to support major charsets
RUN apt-get update \
    && apt-get install -y wget gnupg chromium fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Set Puppeteer env vars
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package files
COPY package*.json ./
COPY .puppeteerrc.cjs ./

# Install deps
RUN npm install

# Copy source
COPY . .

# Fix permissions for the 'node' user
RUN chown -R node:node /usr/src/app

USER node

EXPOSE 3001
EXPOSE 9222

CMD [ "node", "server.js" ]
