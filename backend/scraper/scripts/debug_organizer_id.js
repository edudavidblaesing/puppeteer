const { pool } = require('../src/db');

async function debugOrganizer() {
    const id = '232b586d-1bcd-4d29-9614-d56de6b2a0ed';
    try {
        console.log(`Checking Organizer ID: ${id}`);
        const res = await pool.query('SELECT * FROM organizers WHERE id = $1', [id]);
        console.log('Exists in organizers table?', res.rows.length > 0);
        if (res.rows.length > 0) {
            console.log('Organizer:', res.rows[0]);
        } else {
            // Check if it exists in scraped_organizers? IDs are different usually but worth checking if mixed up
            const resScraped = await pool.query('SELECT * FROM scraped_organizers WHERE id = $1', [id]);
            console.log('Exists in scraped_organizers table?', resScraped.rows.length > 0);
        }

        // Check links
        const links = await pool.query('SELECT * FROM organizer_scraped_links WHERE organizer_id = $1', [id]);
        console.log('Linked Scraped Organizers count:', links.rows.length);
        console.log('Links:', links.rows);

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

debugOrganizer();
