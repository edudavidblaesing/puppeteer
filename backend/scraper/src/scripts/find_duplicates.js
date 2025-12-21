const { pool } = require('../db');

async function findXavier() {
    try {
        const res = await pool.query("SELECT id, title, date, venue_name, artists FROM events WHERE title ILIKE '%Xavier Naidoo%' OR artists ILIKE '%Xavier Naidoo%'");
        console.log('Found events:', JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

findXavier();
