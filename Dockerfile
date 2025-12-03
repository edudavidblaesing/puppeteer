FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to install dependencies and setup permissions
USER root

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
# We allow puppeteer to download the correct chromium version
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false \
    PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# Ensure the cache directory exists and is writable
RUN mkdir -p /home/pptruser/.cache/puppeteer && \
    chown -R pptruser:pptruser /home/pptruser

RUN npm install

# Explicitly install the browser to ensure it's there
RUN npx puppeteer browsers install chrome

# Copy app source
COPY . .

# Ensure pptruser has ownership of the application directory
RUN chown -R pptruser:pptruser /usr/src/app

# Switch back to the non-root user provided by the base image
USER pptruser

EXPOSE 3001
EXPOSE 9222

CMD [ "node", "server.js" ]
