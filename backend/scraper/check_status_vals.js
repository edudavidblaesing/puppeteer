const { pool } = require('./src/db');

async function checkStatusValues() {
    try {
        const res = await pool.query(`
      SELECT status, publish_status, COUNT(*) 
      FROM events 
      GROUP BY status, publish_status
    `);
        console.table(res.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkStatusValues();
