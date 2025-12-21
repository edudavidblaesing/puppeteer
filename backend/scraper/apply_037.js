const { pool } = require('./src/db');
const fs = require('fs');
const path = require('path');

async function run() {
    try {
        const sql = fs.readFileSync(path.join(__dirname, 'migrations', '037_add_columns_scraped_venues.sql'), 'utf8');
        console.log('Applying migration 037...');
        await pool.query(sql);
        console.log('✅ Migration applied.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}
run();
