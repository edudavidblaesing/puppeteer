const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://eventuser:eventpass@postgres:5432/socialevents',
});

async function addSources() {
    try {
        console.log('Adding enrichment sources...');

        // Spotify
        await pool.query(`
            INSERT INTO sources (code, name, base_url, is_active, is_scraper)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (code) DO NOTHING
        `, ['sp', 'Spotify', 'https://spotify.com', true, false]);
        console.log('Added/Verified Spotify (sp)');

        // MusicBrainz
        await pool.query(`
            INSERT INTO sources (code, name, base_url, is_active, is_scraper)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (code) DO NOTHING
        `, ['musicbrainz', 'MusicBrainz', 'https://musicbrainz.org', true, false]);
        console.log('Added/Verified MusicBrainz');

        console.log('Done.');
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

addSources();
