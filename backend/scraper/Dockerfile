FROM ghcr.io/puppeteer/puppeteer:23.11.1

USER root

# Install socat and postgresql-client
RUN apt-get update \
    && apt-get install -y socat postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Copy root package files
COPY package.json package-lock.json ./

# Copy workspace package.json files
COPY backend/api/package.json ./backend/api/
COPY backend/scraper/package.json ./backend/scraper/
COPY backend/shared/package.json ./backend/shared/
COPY admin/package.json ./admin/

# Install dependencies from root
RUN npm install --ignore-scripts --no-audit --no-fund --omit=optional

# Copy source code
COPY backend/shared ./backend/shared
COPY backend/scraper ./backend/scraper

# Fix permissions
RUN chown -R pptruser:pptruser /usr/src/app

USER pptruser

WORKDIR /usr/src/app/backend/scraper

# Make scripts executable (assuming we are owner)
USER root
RUN chmod +x entrypoint.sh run-migrations.sh
USER pptruser

EXPOSE 3008
EXPOSE 9222
EXPOSE 9223

CMD [ "./entrypoint.sh" ]

