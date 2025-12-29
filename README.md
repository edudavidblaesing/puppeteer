# Social Events

A platform for aggregating and managing social events from multiple sources.

## Project Structure

```
social-events/
├── admin/                # Admin Dashboard (Next.js)
├── backend/
│   ├── scraper/          # Event scraper service (Node.js + Puppeteer)
│   └── api/              # REST API service (future)
├── frontend/
│   ├── web/              # Web application (future)
│   └── app/              # Mobile app (future)
├── workflows/            # n8n automation workflows
├── docs/                 # Documentation
└── docker-compose.yml    # Docker orchestration
```

## Services

### Event Scraper Service
Scrapes events from multiple sources:
- **Resident Advisor (RA)** - Electronic music events
- **Eventbrite** - General events (planned)
- **Facebook Events** - Social events (planned)
- **DICE** - Music events (planned)

### Database
PostgreSQL database with:
- `events` - All events from all sources
- `venues` - Venue information
- `artists` - Artist information
- `event_sources` - Registered event sources

## Quick Start

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f event-scraper

# Stop services
docker-compose down

### Admin Dashboard (Local Dev)
```bash
cd admin
npm install
npm run dev
# Open http://localhost:3000
```

## API Endpoints

### Events
- `GET /api/events?area=34&limit=100` - Search events
- `POST /db/sync` - Sync events from source
- `GET /db/events` - List events from database
- `GET /db/stats` - Database statistics

### Venues
- `GET /api/venue/:id` - Get venue from source
- `GET /db/venues` - List venues from database
- `POST /db/venues/enrich` - Enrich missing venues

### Artists
- `GET /api/artist/:id` - Get artist from source
- `GET /db/artists` - List artists from database
- `POST /db/artists/enrich` - Enrich missing artists

## Database Migrations

Migrations run automatically on container start. To add new tables/columns:

1. Create a new file: `backend/scraper/migrations/003_your_feature.sql`
2. Push to git
3. Deploy - migrations apply automatically

## n8n Workflows

Import workflows from the `workflows/` folder:
- `sync-events-by-city.json` - Sync events for multiple cities
- `enrich-venues-artists.json` - Enrich venue/artist data

## Environment Variables

See `.env.example` for available configuration options.
