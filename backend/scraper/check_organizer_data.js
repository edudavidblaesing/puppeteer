const { pool } = require('./src/db');

async function checkOrganizerData() {
    try {
        console.log('--- Checking Organizer Data ---');

        // 1. Total Organizers
        const total = await pool.query('SELECT COUNT(*) FROM organizers');
        console.log(`Total Organizers: ${total.rows[0].count}`);

        // 2. Organizers without source_code (if column exists) or unlinked
        // Let's check columns first to be safe, but usually we link via organizer_scraped_links

        const unlinked = await pool.query(`
            SELECT o.id, o.name
            FROM organizers o
            LEFT JOIN organizer_scraped_links osl ON osl.organizer_id = o.id
            WHERE osl.organizer_id IS NULL
        `);
        console.log(`\nOrganizers without scraped links: ${unlinked.rowCount}`);
        if (unlinked.rowCount > 0) {
            console.table(unlinked.rows.slice(0, 10)); // Show top 10
        }

        // 3. Organizers with 0 events
        const noEvents = await pool.query(`
            SELECT o.id, o.name
            FROM organizers o
            LEFT JOIN event_organizers eo ON eo.organizer_id = o.id
            WHERE eo.event_id IS NULL
        `);
        console.log(`\nOrganizers with 0 events: ${noEvents.rowCount}`);
        if (noEvents.rowCount > 0 && noEvents.rowCount < 20) {
            console.table(noEvents.rows);
        }

        // 4. Check venues for a sample organizer with events
        // Logic: Organizer -> Event -> Venue
        console.log('\nChecking Venue connections for top 5 organizers by event count:');
        const topOrganizers = await pool.query(`
            SELECT o.name, COUNT(DISTINCT eo.event_id) as event_count, COUNT(DISTINCT e.venue_id) as venue_count
            FROM organizers o
            JOIN event_organizers eo ON eo.organizer_id = o.id
            JOIN events e ON e.id = eo.event_id
            GROUP BY o.id, o.name
            ORDER BY event_count DESC
            LIMIT 5
        `);
        console.table(topOrganizers.rows);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkOrganizerData();
