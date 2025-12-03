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
# CRITICAL: Unset the base image's executable path so Puppeteer uses our downloaded version
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false \
    PUPPETEER_EXECUTABLE_PATH=""

# Install dependencies (runs as pptruser)
RUN npm install

# Explicitly install the browsers to ensure they are there
RUN npx puppeteer browsers install chrome
RUN npx puppeteer browsers install chrome-headless-shell

# Copy app source
COPY --chown=pptruser:pptruser . .

EXPOSE 3001
EXPOSE 9222

CMD [ "node", "server.js" ]
