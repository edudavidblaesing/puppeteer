const { pool } = require('./src/db');

async function checkCounts() {
    try {
        const scraped = await pool.query('SELECT COUNT(*) FROM scraped_organizers');
        const main = await pool.query('SELECT COUNT(*) FROM organizers');
        console.log(`Scraped Organizers: ${scraped.rows[0].count}`);
        console.log(`Main Organizers: ${main.rows[0].count}`);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkCounts();
