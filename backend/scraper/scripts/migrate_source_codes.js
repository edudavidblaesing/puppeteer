
const { pool } = require('../src/db');

async function migrate() {
    console.log('Starting migration of source codes to 2-character format...');

    try {
        // 1. Event Sources (Configuration)
        console.log('Updating event_sources...');
        await pool.query("UPDATE event_sources SET code = 'tm' WHERE code = 'ticketmaster'");
        await pool.query("UPDATE event_sources SET code = 'sp' WHERE code = 'spotify'");

        // 2. Scraped Events
        console.log('Updating scraped_events...');
        await pool.query("UPDATE scraped_events SET source_code = 'tm' WHERE source_code = 'ticketmaster'");

        // 3. Scraped Venues
        console.log('Updating scraped_venues...');
        await pool.query("UPDATE scraped_venues SET source_code = 'tm' WHERE source_code = 'ticketmaster'");

        // 4. Scraped Artists
        console.log('Updating scraped_artists...');
        await pool.query("UPDATE scraped_artists SET source_code = 'sp' WHERE source_code = 'spotify'");
        await pool.query("UPDATE scraped_artists SET source_code = 'tm' WHERE source_code = 'ticketmaster'");

        // 5. Scraped Organizers
        console.log('Updating scraped_organizers...');
        await pool.query("UPDATE scraped_organizers SET source_code = 'tm' WHERE source_code = 'ticketmaster'");

        // 6. Main Entities (tracking primary source)
        console.log('Updating main entities (artists, venues, events)...');
        await pool.query("UPDATE events SET source_code = 'tm' WHERE source_code = 'ticketmaster'");
        await pool.query("UPDATE venues SET source_code = 'tm' WHERE source_code = 'ticketmaster'");
        await pool.query("UPDATE artists SET source_code = 'sp' WHERE source_code = 'spotify'");
        await pool.query("UPDATE artists SET source_code = 'tm' WHERE source_code = 'ticketmaster'");

        // 7. Field Sources JSON (This is harder, inside JSONB)
        // We need to replace values inside JSON: {"title": "ticketmaster"} -> {"title": "tm"}
        // Postgres has jsonb functions.
        // It's complex to regex replace inside jsonb safely for all keys.
        // But simply replacing the text representation might work if we cast to text and back?
        // UPDATE table SET field_sources = REPLACE(field_sources::text, '"ticketmaster"', '"tm"')::jsonb

        console.log('Updating field_sources (JSONB)...');
        const tables = ['events', 'venues', 'artists'];
        for (const table of tables) {
            await pool.query(`
                UPDATE ${table} 
                SET field_sources = REPLACE(field_sources::text, '"ticketmaster"', '"tm"')::jsonb 
                WHERE field_sources::text LIKE '%"ticketmaster"%'
            `);
            await pool.query(`
                UPDATE ${table} 
                SET field_sources = REPLACE(field_sources::text, '"spotify"', '"sp"')::jsonb 
                WHERE field_sources::text LIKE '%"spotify"%'
            `);
        }

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
