FROM ghcr.io/puppeteer/puppeteer:23.11.1

USER root

# Install socat (for port forwarding) and postgresql-client (for migrations)
# We skip chromium/fonts related installs as they are in the base image
RUN apt-get update \
    && apt-get install -y socat postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Skip Chromium download as it's in the base image
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# Use the chrome installed in the base image (usually set by the base image, but being explicit doesn't hurt if we knew the path, 
# but rely on base image ENV which is safer)

# Copy package files
COPY package*.json ./
COPY .puppeteerrc.cjs ./

# Install deps
RUN npm install

# Copy source
COPY . .

# Make scripts executable
RUN chmod +x entrypoint.sh run-migrations.sh

# Fix permissions for the pptruser (default user in this image)
RUN chown -R pptruser:pptruser /usr/src/app

# Switch to non-root user
USER pptruser

EXPOSE 3000
EXPOSE 9222
EXPOSE 9223

CMD [ "./entrypoint.sh" ]
