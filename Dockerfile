FROM ghcr.io/puppeteer/puppeteer:latest

USER root

# Setup app dir and cache dir permissions
WORKDIR /usr/src/app
RUN mkdir -p /home/pptruser/.cache/puppeteer && \
    chown -R pptruser:pptruser /home/pptruser && \
    chown -R pptruser:pptruser /usr/src/app

# Switch to user
USER pptruser

# Copy package files with ownership
COPY --chown=pptruser:pptruser package*.json ./

# Env vars
# We allow puppeteer to download the correct chromium version
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false \
    PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# Install dependencies (runs as pptruser)
RUN npm install

# Copy app source
COPY --chown=pptruser:pptruser . .

EXPOSE 3001
EXPOSE 9222

CMD [ "node", "server.js" ]
