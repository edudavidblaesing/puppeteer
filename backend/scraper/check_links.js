const { pool } = require('./src/db');

async function checkLinks() {
    try {
        console.log('Checking Venue Links...');
        const venueLinks = await pool.query(`
            SELECT count(*) FROM venue_scraped_links vsl
            JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
            WHERE sv.source_code = 'wiki'
        `);
        console.log(`Wiki Venue Links: ${venueLinks.rows[0].count}`);

        const venues = await pool.query(`
            SELECT v.id, v.name, v.field_sources, sv.name as scraped_name 
            FROM venue_scraped_links vsl
            JOIN venues v ON v.id = vsl.venue_id
            JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
            WHERE sv.source_code = 'wiki'
            LIMIT 5
        `);
        venues.rows.forEach(v => {
            console.log(`Venue: ${v.name}, Field Sources: ${JSON.stringify(v.field_sources)}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkLinks();
