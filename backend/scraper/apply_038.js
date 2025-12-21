const { pool } = require('./src/db');
const fs = require('fs');

async function run() {
    try {
        const sql = fs.readFileSync('./migrations/038_add_venue_description.sql', 'utf8');
        await pool.query(sql);
        console.log('Migration 038 applied successfully');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}
run();
