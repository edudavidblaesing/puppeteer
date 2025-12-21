const { pool } = require('./src/db');

async function checkScraped() {
    try {
        console.log('Checking Scraped Venues for Wiki...');
        const res = await pool.query(`
            SELECT count(*) FROM scraped_venues WHERE source_code = 'wiki'
        `);
        console.log(`Wiki Scraped Venues: ${res.rows[0].count}`);

        if (parseInt(res.rows[0].count) > 0) {
            const rows = await pool.query(`SELECT * FROM scraped_venues WHERE source_code = 'wiki' LIMIT 5`);
            console.log(rows.rows);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkScraped();
