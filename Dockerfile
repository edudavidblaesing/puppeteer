FROM node:20-slim

# Install latest chrome dev package and fonts to support major charsets
# We install google-chrome-stable to get all necessary shared library dependencies
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Set Puppeteer cache directory to ensure it's consistent
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer

# Copy package files
COPY package*.json ./
COPY .puppeteerrc.cjs ./

# Install deps
RUN npm install

# Install puppeteer browsers (Chrome + Headless Shell)
# This will use the cache dir defined in .puppeteerrc.cjs
RUN npx puppeteer browsers install chrome
RUN npx puppeteer browsers install chrome-headless-shell

# Copy source
COPY . .

# Fix permissions for the 'node' user
RUN chown -R node:node /usr/src/app

USER node

EXPOSE 3001
EXPOSE 9222

CMD [ "node", "server.js" ]
