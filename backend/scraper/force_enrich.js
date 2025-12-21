const { pool } = require('./src/db');
const { autoEnrichArtists, autoEnrichVenues, refreshMainArtist, refreshMainVenue } = require('./src/services/matchingService');

async function forceUpdate() {
    try {
        console.log('Forcing Artist Enrichment...');
        await autoEnrichArtists();

        console.log('Forcing Venue Enrichment...');
        await autoEnrichVenues(); // This will use the inserted links but might not refresh main yet if I haven't defined it

        console.log('Refreshing Artists with Wiki links...');
        const wikiArtists = await pool.query(`
            SELECT DISTINCT artist_id FROM artist_scraped_links asl
            JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
            WHERE sa.source_code = 'wiki'
        `);
        for (const row of wikiArtists.rows) {
            await refreshMainArtist(row.artist_id);
            console.log(`Refreshed Artist ${row.artist_id}`);
        }

        // Verify counts immediately
        const countRes = await pool.query("SELECT count(*) FROM scraped_venues WHERE source_code = 'wiki'");
        console.log(`[Verification] POST-RUN Wiki Venues Count: ${countRes.rows[0].count}`);

        // Manually trigger refresh for scraped venues with wiki links
        // (Assuming refreshMainVenue is implemented now)
        console.log('Refreshing Venues with Wiki links...');
        const wikiVenues = await pool.query(`
            SELECT DISTINCT venue_id FROM venue_scraped_links vsl
            JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
            WHERE sv.source_code = 'wiki'
        `);
        for (const row of wikiVenues.rows) {
            // We need to make sure refreshMainVenue is available
            // Since I am editing the file, I should wait or use the updated module
            // But for this script I will import it. If it's not exported yet, this script will fail.
            // I'll skip this part until I implement the function in the file.
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
forceUpdate(); 
