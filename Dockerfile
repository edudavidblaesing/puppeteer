FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to install dependencies and setup permissions
USER root

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
# We skip chromium download because the base image already includes a compatible chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

RUN npm install

# Copy app source
COPY . .

# Ensure pptruser has ownership of the application directory
RUN chown -R pptruser:pptruser /usr/src/app

# Switch back to the non-root user provided by the base image
USER pptruser

EXPOSE 3000

CMD [ "node", "server.js" ]
