FROM node:20-slim

# Install chromium, socat (for port forwarding), and fonts
RUN apt-get update \
    && apt-get install -y wget gnupg chromium socat fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
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

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Fix permissions for the 'node' user
RUN chown -R node:node /usr/src/app

EXPOSE 3001
EXPOSE 9222
EXPOSE 9223

CMD [ "./entrypoint.sh" ]
