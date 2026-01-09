FROM node:20-slim

# Install postgresql-client for any potential DB ops
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy root package files
COPY package.json package-lock.json ./

# Copy workspace package.json files to maintain structure for npm workspaces
COPY backend/api/package.json ./backend/api/
COPY backend/scraper/package.json ./backend/scraper/
COPY backend/shared/package.json ./backend/shared/
COPY admin/package.json ./admin/

# Install dependencies from root
RUN npm install --ignore-scripts --no-audit --no-fund --omit=optional

# Copy source code
COPY backend/shared ./backend/shared
COPY backend/api ./backend/api

# Switch to API directory
WORKDIR /usr/src/app/backend/api

EXPOSE 3007

# Basic start command, can be overridden by docker-compose
CMD ["npm", "start"]
